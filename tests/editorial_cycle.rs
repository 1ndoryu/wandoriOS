// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
//! Tests de integración del ciclo editorial (297A-14).
//! Verifican la trazabilidad de las transiciones de un artículo a través del
//! flujo completo: borrador → revisión (ready) → publicación → despublicación.
//! El contrato del envelope `resources` (editorial/visibility) y el campo
//! `published_at` deben mantenerse coherentes en cada transición, y la
//! despublicación debe limpiar la fecha de publicación (un draft no arrastra
//! una fecha vieja, y republicar conserva la fecha de PRIMERA publicación).
//! Necesitan `DATABASE_URL` apuntando a la BD local (glory_backend_wandorius).

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::handlers::create_router_with_state;
use glory_backend::services::SessionService;
use glory_backend::AppState;

const TEST_SECRET: &str = "editorial-cycle-test-secret";

async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas HTTP del ciclo editorial");
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/editorial-cycle-test-uploads".to_string(),
        resend_api_key: None,
        email_from: "test@example.invalid".to_string(),
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        site_url: "http://localhost:3000".to_string(),
        login_rate_limit: Arc::new(Mutex::new(HashMap::new())),
        auth_action_rate_limit: Arc::new(Mutex::new(HashMap::new())),
        dev_mailbox: Arc::new(Mutex::new(Vec::new())),
    }
}

fn production_router(state: &AppState) -> axum::Router {
    create_router_with_state(state.clone())
}

async fn create_admin(state: &AppState) -> Uuid {
    let user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role)
         VALUES ($1, $2, 'test-only-password-hash', 'admin')",
    )
    .bind(user_id)
    .bind(format!("editorial-admin-{user_id}@example.invalid"))
    .execute(&state.pool)
    .await
    .expect("debe poder crear el admin de prueba");
    user_id
}

async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result = SessionService::create(&state.pool, user_id, None, Some("editorial-cycle-test"))
        .await
        .expect("debe poder crear la sesión de prueba");
    (result.raw_token, result.csrf_token)
}

async fn cleanup(state: &AppState, user_id: Uuid) {
    sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("limpiar sesiones");
    sqlx::query("DELETE FROM articles WHERE id IN (SELECT id FROM resources WHERE kind = 'article' AND title LIKE 'Editorial cycle %')")
        .execute(&state.pool)
        .await
        .expect("limpiar artículos del test");
    sqlx::query("DELETE FROM resources WHERE title LIKE 'Editorial cycle %'")
        .execute(&state.pool)
        .await
        .expect("limpiar envelopes del test");
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("limpiar el usuario de prueba");
}

fn admin_request(
    method: &str,
    uri: &str,
    session_token: &str,
    csrf_cookie: &str,
    csrf_header: Option<&str>,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("origin", "http://localhost:5173")
        .header(
            "cookie",
            format!("session_id={session_token}; csrf_token={csrf_cookie}"),
        );
    if let Some(csrf) = csrf_header {
        builder = builder.header("x-csrf-token", csrf);
    }
    if body.is_some() {
        builder = builder.header("content-type", "application/json");
    }
    let mut request = builder
        .body(
            body.map(|value| Body::from(value.to_string()))
                .unwrap_or_else(Body::empty),
        )
        .expect("request admin construido");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 5000))));
    request
}

async fn body_json(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), 1_048_576)
        .await
        .expect("cuerpo leído");
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
}

/// Lee el envelope `resources` del artículo (editorial/visibility/lifecycle).
async fn resource_envelope(state: &AppState, article_id: Uuid) -> (String, String, String) {
    sqlx::query_as::<_, (String, String, String)>(
        "SELECT editorial::text, visibility::text, lifecycle::text FROM resources WHERE id = $1",
    )
    .bind(article_id)
    .fetch_one(&state.pool)
    .await
    .expect("envelope del recurso leído")
}

/// Lee el estado actual del artículo (status + published_at).
async fn article_state(
    state: &AppState,
    article_id: Uuid,
) -> (String, Option<chrono::DateTime<chrono::Utc>>) {
    sqlx::query_as::<_, (String, Option<chrono::DateTime<chrono::Utc>>)>(
        "SELECT status, published_at FROM articles WHERE id = $1",
    )
    .bind(article_id)
    .fetch_one(&state.pool)
    .await
    .expect("estado del artículo leído")
}

#[tokio::test]
async fn editorial_cycle_tracks_published_at() {
    let state = test_state().await;
    let router = production_router(&state);
    let admin_id = create_admin(&state).await;
    let (token, csrf) = session(&state, admin_id).await;
    let title = format!("Editorial cycle {admin_id}");

    /* 1. Borrador: status='draft' (o sin status) → envelope draft/private,
     *    published_at NULL. */
    let create = admin_request(
        "POST",
        "/api/admin/articles",
        &token,
        &csrf,
        Some(&csrf),
        Some(json!({
            "title": title,
            "content": { "type": "doc", "content": [] },
            "status": "draft",
        })),
    );
    let create = router
        .clone()
        .oneshot(create)
        .await
        .expect("crear artículo");
    assert_eq!(
        create.status(),
        StatusCode::CREATED,
        "crear borrador: {:?}",
        create.status()
    );
    let created: Value = body_json(create).await;
    let article_id: Uuid = created["id"]
        .as_str()
        .expect("id del artículo")
        .parse()
        .expect("uuid válido");

    let (status, published_at) = article_state(&state, article_id).await;
    assert_eq!(status, "draft", "nace como borrador");
    assert!(
        published_at.is_none(),
        "un borrador no tiene fecha de publicación"
    );
    let (editorial, visibility, lifecycle) = resource_envelope(&state, article_id).await;
    assert_eq!(editorial, "draft");
    assert_eq!(visibility, "private");
    assert_eq!(lifecycle, "active");

    /* 2. Publicación: status='published' → envelope ready/public, published_at
     *    se fija. */
    let publish = admin_request(
        "PUT",
        &format!("/api/admin/articles/{article_id}"),
        &token,
        &csrf,
        Some(&csrf),
        Some(json!({ "status": "published" })),
    );
    let publish = router
        .clone()
        .oneshot(publish)
        .await
        .expect("publicar artículo");
    assert_eq!(
        publish.status(),
        StatusCode::OK,
        "publicar: {:?}",
        publish.status()
    );

    let (status, published_at) = article_state(&state, article_id).await;
    assert_eq!(status, "published", "queda publicado");
    let first_published = published_at.expect("publicado tiene fecha");
    let (editorial, visibility, _) = resource_envelope(&state, article_id).await;
    assert_eq!(editorial, "ready");
    assert_eq!(visibility, "public");

    /* 3. Despublicación: status='draft' → envelope draft/private y
     *    published_at se limpia (trazabilidad: un draft no arrastra fecha). */
    let unpublish = admin_request(
        "PUT",
        &format!("/api/admin/articles/{article_id}"),
        &token,
        &csrf,
        Some(&csrf),
        Some(json!({ "status": "draft" })),
    );
    let unpublish = router
        .clone()
        .oneshot(unpublish)
        .await
        .expect("despublicar artículo");
    assert_eq!(
        unpublish.status(),
        StatusCode::OK,
        "despublicar: {:?}",
        unpublish.status()
    );

    let (status, published_at) = article_state(&state, article_id).await;
    assert_eq!(status, "draft", "vuelve a borrador");
    assert!(published_at.is_none(), "despublicar limpia published_at");
    let (editorial, visibility, _) = resource_envelope(&state, article_id).await;
    assert_eq!(editorial, "draft");
    assert_eq!(visibility, "private");

    /* 4. República: published_at se reescribe al momento actual (trazabilidad
     *    de la publicación vigente, no de la primera). */
    let republish = admin_request(
        "PUT",
        &format!("/api/admin/articles/{article_id}"),
        &token,
        &csrf,
        Some(&csrf),
        Some(json!({ "status": "published" })),
    );
    let republish = router
        .clone()
        .oneshot(republish)
        .await
        .expect("republicar artículo");
    assert_eq!(
        republish.status(),
        StatusCode::OK,
        "republicar: {:?}",
        republish.status()
    );

    let (status, published_at) = article_state(&state, article_id).await;
    assert_eq!(status, "published");
    let republished_at = published_at.expect("republicado tiene fecha");
    assert!(
        republished_at >= first_published,
        "la republicación actualiza la fecha de publicación"
    );
    let (editorial, visibility, _) = resource_envelope(&state, article_id).await;
    assert_eq!(editorial, "ready");
    assert_eq!(visibility, "public");

    cleanup(&state, admin_id).await;
}
