use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::extract::ConnectInfo;
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::handlers::create_router_with_state;
use glory_backend::services::SessionService;
use glory_backend::AppState;

const TEST_SECRET: &str = "article-soft-delete-test-secret";

async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas HTTP de artículos");
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/article-soft-delete-test-uploads".to_string(),
        resend_api_key: None,
        email_from: "test@example.invalid".to_string(),
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        game_ticket_secret: None,
        game_ticket_store: glory_backend::services::game_ticket::GameTicketStore::default(),
        game_ws_state: glory_backend::services::game_ws::GameWsState::default(),
        site_url: "http://localhost:3000".to_string(),
        login_rate_limit: Arc::new(Mutex::new(
            HashMap::<String, (u8, std::time::Instant)>::new(),
        )),
        auth_action_rate_limit: Arc::new(Mutex::new(
            HashMap::<String, (u8, std::time::Instant)>::new(),
        )),
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
    .bind(format!("article-admin-{user_id}@example.invalid"))
    .execute(&state.pool)
    .await
    .expect("debe poder crear el admin de prueba");
    user_id
}

async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result =
        SessionService::create(&state.pool, user_id, None, Some("article-soft-delete-test"))
            .await
            .expect("debe poder crear la sesión de prueba");
    (result.raw_token, result.csrf_token)
}

async fn cleanup(state: &AppState, user_id: Uuid) {
    sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("debe poder limpiar las sesiones de prueba");
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("debe poder limpiar el usuario de prueba");
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
        .expect("request admin válida");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 41_001))));
    request
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("cuerpo HTTP legible");
    serde_json::from_slice(&body).expect("respuesta JSON válida")
}

fn create_body(title: &str) -> Value {
    json!({
        "title": title,
        "content": { "type": "doc", "content": [{ "type": "paragraph" }] },
        "excerpt": "resumen",
        "status": "published"
    })
}

/// [028A-12] DEBUG temporal: revela el error real de la creación.
#[tokio::test]
async fn debug_create_error() {
    let state = test_state().await;
    let admin_id = create_admin(&state).await;
    let result = glory_backend::services::article::ArticleService::create(
        &state.pool,
        glory_backend::models::article::CreateArticleRequest {
            title: "Debug create".to_string(),
            content: json!({ "type": "doc" }),
            excerpt: String::new(),
            cover_image: None,
            status: "published".to_string(),
            is_pinned: false,
        },
    )
    .await;
    eprintln!("SERVICE RESULT: {result:?}");
    cleanup(&state, admin_id).await;
}

/// [028A-12] Ciclo completo: crear → soft delete (papelera + envelope) →
/// restaurar (artículo y envelope vuelven juntos).
#[tokio::test]
async fn soft_delete_moves_article_and_envelope_to_trash_and_restore_recovers_both() {
    let state = test_state().await;
    let admin_id = create_admin(&state).await;
    let router = production_router(&state);
    let (session_token, csrf_token) = session(&state, admin_id).await;

    /* Crear artículo publicado. */
    let created = router
        .clone()
        .oneshot(admin_request(
            "POST",
            "/api/admin/articles",
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            Some(create_body("Soft delete test")),
        ))
        .await
        .expect("request de creación");
    let created_status = created.status();
    let created_body = to_bytes(created.into_body(), usize::MAX)
        .await
        .expect("cuerpo de creación legible");
    if created_status != StatusCode::CREATED {
        eprintln!("CREATE BODY: {}", String::from_utf8_lossy(&created_body));
    }
    assert_eq!(created_status, StatusCode::CREATED);
    let article: Value = serde_json::from_slice(&created_body).expect("artículo JSON");
    let article_id = article["id"].as_str().expect("id del artículo").to_string();
    assert_eq!(article["trashed"], json!(false));

    /* Soft delete. */
    let deleted = router
        .clone()
        .oneshot(admin_request(
            "DELETE",
            &format!("/api/admin/articles/{article_id}"),
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            None,
        ))
        .await
        .expect("request de borrado");
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);

    /* Ya no aparece en el listado normal ni en el público. */
    let list = router
        .clone()
        .oneshot(admin_request(
            "GET",
            "/api/admin/articles",
            &session_token,
            &csrf_token,
            None,
            None,
        ))
        .await
        .expect("listado admin");
    let list_body = json_body(list).await;
    let ids: Vec<&str> = list_body["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter_map(|item| item["id"].as_str())
        .collect();
    assert!(
        !ids.contains(&article_id.as_str()),
        "no debe listar trashed"
    );

    let public = router
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/api/articles/{article_id}"))
                .body(Body::empty())
                .expect("request público"),
        )
        .await
        .expect("request público");
    assert_eq!(public.status(), StatusCode::NOT_FOUND);

    /* La Papelera lo lista con trashed = true. */
    let trashed = router
        .clone()
        .oneshot(admin_request(
            "GET",
            "/api/admin/articles/trashed",
            &session_token,
            &csrf_token,
            None,
            None,
        ))
        .await
        .expect("papelera");
    assert_eq!(trashed.status(), StatusCode::OK);
    let trashed_body = json_body(trashed).await;
    assert_eq!(trashed_body["total"], json!(1));
    let trashed_item = trashed_body["items"]
        .as_array()
        .expect("items")
        .iter()
        .find(|item| item["id"].as_str() == Some(article_id.as_str()))
        .expect("el artículo debe estar en la papelera");
    assert_eq!(trashed_item["trashed"], json!(true));

    /* El envelope `resources` quedó trashed en la misma transacción. */
    let (lifecycle,): (String,) = sqlx::query_as("SELECT lifecycle FROM resources WHERE id = $1")
        .bind(&article_id)
        .fetch_one(&state.pool)
        .await
        .expect("envelope del artículo");
    assert_eq!(lifecycle, "trashed");

    /* Restaurar. */
    let restored = router
        .clone()
        .oneshot(admin_request(
            "POST",
            &format!("/api/admin/articles/{article_id}/restore"),
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            None,
        ))
        .await
        .expect("restore");
    assert_eq!(restored.status(), StatusCode::OK);
    let restored_body = json_body(restored).await;
    assert_eq!(restored_body["id"].as_str(), Some(article_id.as_str()));
    assert_eq!(restored_body["trashed"], json!(false));

    /* La Papelera queda vacía y el listado normal lo vuelve a incluir. */
    let trashed_after = json_body(
        router
            .clone()
            .oneshot(admin_request(
                "GET",
                "/api/admin/articles/trashed",
                &session_token,
                &csrf_token,
                None,
                None,
            ))
            .await
            .expect("papelera tras restore"),
    )
    .await;
    assert_eq!(trashed_after["total"], json!(0));
    let list_after = json_body(
        router
            .clone()
            .oneshot(admin_request(
                "GET",
                "/api/admin/articles",
                &session_token,
                &csrf_token,
                None,
                None,
            ))
            .await
            .expect("listado tras restore"),
    )
    .await;
    let ids_after: Vec<&str> = list_after["items"]
        .as_array()
        .expect("items")
        .iter()
        .filter_map(|item| item["id"].as_str())
        .collect();
    assert!(ids_after.contains(&article_id.as_str()));

    /* El envelope volvió a active. */
    let (lifecycle_after,): (String,) =
        sqlx::query_as("SELECT lifecycle FROM resources WHERE id = $1")
            .bind(&article_id)
            .fetch_one(&state.pool)
            .await
            .expect("envelope restaurado");
    assert_eq!(lifecycle_after, "active");

    /* Limpieza directa de la fila y del envelope de prueba. */
    sqlx::query("DELETE FROM resources WHERE id = $1")
        .bind(&article_id)
        .execute(&state.pool)
        .await
        .expect("limpieza envelope");
    sqlx::query("DELETE FROM articles WHERE id = $1")
        .bind(&article_id)
        .execute(&state.pool)
        .await
        .expect("limpieza artículo");
    cleanup(&state, admin_id).await;
}

/// [028A-12] La Papelera y el restore exigen sesión admin y CSRF.
#[tokio::test]
async fn trash_and_restore_require_admin_session_and_csrf() {
    let state = test_state().await;
    let admin_id = create_admin(&state).await;
    let router = production_router(&state);
    let (session_token, csrf_token) = session(&state, admin_id).await;

    let article_id = Uuid::new_v4();

    /* Sin sesión: 401. */
    let no_session = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/admin/articles/trashed")
                .body(Body::empty())
                .expect("request sin sesión"),
        )
        .await
        .expect("request sin sesión");
    assert_eq!(no_session.status(), StatusCode::UNAUTHORIZED);

    /* Restore sin CSRF: 403. */
    let no_csrf = router
        .clone()
        .oneshot(admin_request(
            "POST",
            &format!("/api/admin/articles/{article_id}/restore"),
            &session_token,
            &csrf_token,
            None,
            None,
        ))
        .await
        .expect("restore sin csrf");
    assert_eq!(no_csrf.status(), StatusCode::FORBIDDEN);

    /* Restore de un artículo que no está en la papelera: 404. */
    let missing = router
        .clone()
        .oneshot(admin_request(
            "POST",
            &format!("/api/admin/articles/{article_id}/restore"),
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            None,
        ))
        .await
        .expect("restore de inexistente");
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);

    cleanup(&state, admin_id).await;
}

/// [028A-12] Un artículo trashed deja de ser visible por id/slug/alias
/// (admin y público) hasta que se restaura.
#[tokio::test]
async fn trashed_article_is_hidden_from_reads_until_restore() {
    let state = test_state().await;
    let admin_id = create_admin(&state).await;
    let router = production_router(&state);
    let (session_token, csrf_token) = session(&state, admin_id).await;

    let created = router
        .clone()
        .oneshot(admin_request(
            "POST",
            "/api/admin/articles",
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            Some(create_body("Lectura oculta test")),
        ))
        .await
        .expect("creación");
    let article = json_body(created).await;
    let article_id = article["id"].as_str().expect("id").to_string();

    let deleted = router
        .clone()
        .oneshot(admin_request(
            "DELETE",
            &format!("/api/admin/articles/{article_id}"),
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            None,
        ))
        .await
        .expect("borrado");
    assert_eq!(deleted.status(), StatusCode::NO_CONTENT);

    /* Admin por id: 404 mientras está trashed. */
    let by_id = router
        .clone()
        .oneshot(admin_request(
            "GET",
            &format!("/api/admin/articles/{article_id}"),
            &session_token,
            &csrf_token,
            None,
            None,
        ))
        .await
        .expect("get admin");
    assert_eq!(by_id.status(), StatusCode::NOT_FOUND);

    /* Restaurar y volver a ser visible por id. */
    let restored = router
        .clone()
        .oneshot(admin_request(
            "POST",
            &format!("/api/admin/articles/{article_id}/restore"),
            &session_token,
            &csrf_token,
            Some(&csrf_token),
            None,
        ))
        .await
        .expect("restore");
    assert_eq!(restored.status(), StatusCode::OK);
    let by_id_after = router
        .clone()
        .oneshot(admin_request(
            "GET",
            &format!("/api/admin/articles/{article_id}"),
            &session_token,
            &csrf_token,
            None,
            None,
        ))
        .await
        .expect("get admin tras restore");
    assert_eq!(by_id_after.status(), StatusCode::OK);

    sqlx::query("DELETE FROM resources WHERE id = $1")
        .bind(&article_id)
        .execute(&state.pool)
        .await
        .expect("limpieza envelope");
    sqlx::query("DELETE FROM articles WHERE id = $1")
        .bind(&article_id)
        .execute(&state.pool)
        .await
        .expect("limpieza artículo");
    cleanup(&state, admin_id).await;
}
