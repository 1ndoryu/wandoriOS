//! Tests de integración del catálogo admin de assets del Bosque.
//! [297A-60] Verifican: autorización admin+CSRF, alta/validación, duplicados,
//! actualización/desactivación, listado completo y eventos de auditoría.
//! Necesitan `DATABASE_URL` apuntando a la BD local.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::handlers::create_router_with_state;
use glory_backend::services::SessionService;
use glory_backend::AppState;

async fn state() -> AppState {
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL requerido");
    AppState {
        pool: PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .expect("BD disponible"),
        upload_dir: "target/game-asset-admin-test-uploads".to_string(),
        resend_api_key: None,
        email_from: "test@example.invalid".to_string(),
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        game_ticket_secret: None,
        game_ticket_store: glory_backend::services::game_ticket::GameTicketStore::default(),
        game_ws_state: glory_backend::services::game_ws::GameWsState::default(),
        site_url: "http://localhost:3000".to_string(),
        login_rate_limit: Arc::new(Mutex::new(HashMap::new())),
        auth_action_rate_limit: Arc::new(Mutex::new(HashMap::new())),
    }
}

async fn create_user(app: &AppState, role: &str) -> (Uuid, String, String) {
    let user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users
            (id, email, password_hash, role, status, email_verified_at)
         VALUES ($1, $2, 'test-only-password-hash', $3::user_role, 'active', NOW())",
    )
    .bind(user_id)
    .bind(format!("asset-admin-{user_id}@example.invalid"))
    .bind(role)
    .execute(&app.pool)
    .await
    .expect("usuario creado");
    let session = SessionService::create(&app.pool, user_id, None, Some("asset-admin-test"))
        .await
        .expect("sesión creada");
    (user_id, session.raw_token, session.csrf_token)
}

async fn cleanup(app: &AppState, user_id: Uuid, asset_id: Option<&str>) {
    if let Some(id) = asset_id {
        sqlx::query("DELETE FROM game_audit_events WHERE entity_kind = 'asset' AND entity_id = $1")
            .bind(id)
            .execute(&app.pool)
            .await
            .expect("eventos de auditoría limpiados");
        sqlx::query("DELETE FROM game_assets WHERE id = $1")
            .bind(id)
            .execute(&app.pool)
            .await
            .expect("asset limpiado");
    }
    sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&app.pool)
        .await
        .expect("sesiones limpiadas");
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&app.pool)
        .await
        .expect("usuario limpiado");
}

fn unique_asset_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("ta{}", &hex[..20])
}

fn admin_create_request(
    session: &str,
    csrf_cookie: Option<&str>,
    csrf_header: Option<&str>,
    body: Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/api/admin/game/assets")
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header(
            "cookie",
            format!(
                "session_id={session}; csrf_token={}",
                csrf_cookie.unwrap_or("missing")
            ),
        );
    if let Some(token) = csrf_header {
        builder = builder.header("x-csrf-token", token);
    }
    builder
        .body(Body::from(body.to_string()))
        .expect("request válida")
}

fn admin_update_request(session: &str, csrf: &str, id: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(format!("/api/admin/game/assets/{id}"))
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::from(body.to_string()))
        .expect("request válida")
}

fn admin_list_request(session: &str, csrf: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri("/api/admin/game/assets")
        .header("origin", "http://localhost:5173")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::empty())
        .expect("request válida")
}

fn public_list_request() -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri("/api/game/assets")
        .body(Body::empty())
        .expect("request válida")
}

fn audit_list_request(session: &str, csrf: &str, entity_id: &str) -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri(format!("/api/admin/game/audit/assets?entityId={entity_id}"))
        .header("origin", "http://localhost:5173")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::empty())
        .expect("request válida")
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body legible");
    serde_json::from_slice(&body).expect("json válido")
}

#[tokio::test]
async fn admin_create_requires_admin_role_and_valid_csrf() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, user_csrf) = create_user(&app, "user").await;
    let body = json!({
        "id": unique_asset_id(),
        "displayName": "Seto",
        "category": "tree"
    });

    let without_session = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            "missing",
            Some("csrf"),
            Some("csrf"),
            body.clone(),
        ))
        .await
        .expect("router responde");
    let non_admin = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &user_session,
            Some(&user_csrf),
            Some(&user_csrf),
            body.clone(),
        ))
        .await
        .expect("router responde");
    let missing_csrf = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            None,
            body.clone(),
        ))
        .await
        .expect("router responde");
    let wrong_csrf = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some("wrong"),
            body.clone(),
        ))
        .await
        .expect("router responde");

    cleanup(&app, admin_id, None).await;
    cleanup(&app, user_id, None).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);
    assert_eq!(missing_csrf.status(), StatusCode::FORBIDDEN);
    assert_eq!(wrong_csrf.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn admin_create_adds_option_to_public_catalog_and_validates_input() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = unique_asset_id();

    let response = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({ "id": asset_id, "displayName": "Seto", "category": "tree" }),
        ))
        .await
        .expect("router responde");
    assert_eq!(response.status(), StatusCode::OK);
    let created = json_body(response).await;
    assert_eq!(created["id"], json!(asset_id));
    assert_eq!(created["displayName"], json!("Seto"));
    assert_eq!(created["category"], json!("tree"));
    assert_eq!(created["isActive"], json!(true));

    let public = create_router_with_state(app.clone())
        .oneshot(public_list_request())
        .await
        .expect("router responde");
    let items = json_body(public).await;
    assert!(
        items
            .as_array()
            .unwrap()
            .iter()
            .any(|asset| asset["id"] == asset_id),
        "el nuevo asset aparece en el catálogo público"
    );

    let bad_id = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({ "id": "Bad-ID", "displayName": "Seto", "category": "tree" }),
        ))
        .await
        .expect("router responde");
    let bad_category = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({ "id": unique_asset_id(), "displayName": "Seto", "category": "casa" }),
        ))
        .await
        .expect("router responde");
    assert_eq!(bad_id.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(bad_category.status(), StatusCode::UNPROCESSABLE_ENTITY);

    cleanup(&app, admin_id, Some(&asset_id)).await;
}

#[tokio::test]
async fn admin_create_rejects_duplicate_id() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = unique_asset_id();
    let body = json!({ "id": asset_id, "displayName": "Seto", "category": "tree" });

    let first = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            body.clone(),
        ))
        .await
        .expect("router responde");
    let duplicate = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            body,
        ))
        .await
        .expect("router responde");

    cleanup(&app, admin_id, Some(&asset_id)).await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(duplicate.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn admin_update_renames_deactivates_and_hides_from_public() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = unique_asset_id();

    let created = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({ "id": asset_id, "displayName": "Seto", "category": "tree" }),
        ))
        .await
        .expect("router responde");
    assert_eq!(created.status(), StatusCode::OK);

    let updated = create_router_with_state(app.clone())
        .oneshot(admin_update_request(
            &admin_session,
            &admin_csrf,
            &asset_id,
            json!({ "displayName": "Seto alto", "category": "tree", "isActive": false }),
        ))
        .await
        .expect("router responde");
    assert_eq!(updated.status(), StatusCode::OK);
    let body = json_body(updated).await;
    assert_eq!(body["displayName"], json!("Seto alto"));
    assert_eq!(body["isActive"], json!(false));

    let public = create_router_with_state(app.clone())
        .oneshot(public_list_request())
        .await
        .expect("router responde");
    let items = json_body(public).await;
    assert!(
        !items
            .as_array()
            .unwrap()
            .iter()
            .any(|asset| asset["id"] == asset_id),
        "el asset desactivado desaparece del catálogo público"
    );

    let missing = create_router_with_state(app.clone())
        .oneshot(admin_update_request(
            &admin_session,
            &admin_csrf,
            "no-existe",
            json!({ "displayName": "X", "category": "rock", "isActive": true }),
        ))
        .await
        .expect("router responde");
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);

    cleanup(&app, admin_id, Some(&asset_id)).await;
}

#[tokio::test]
async fn admin_list_requires_admin_role() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, user_csrf) = create_user(&app, "user").await;

    let without_session = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/admin/game/assets")
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let non_admin = create_router_with_state(app.clone())
        .oneshot(admin_list_request(&user_session, &user_csrf))
        .await
        .expect("router responde");
    let admin = create_router_with_state(app.clone())
        .oneshot(admin_list_request(&admin_session, &admin_csrf))
        .await
        .expect("router responde");

    cleanup(&app, admin_id, None).await;
    cleanup(&app, user_id, None).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);
    assert_eq!(admin.status(), StatusCode::OK);
}

#[tokio::test]
async fn admin_list_includes_deactivated_while_public_hides_them() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = unique_asset_id();

    let created = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({ "id": asset_id, "displayName": "Seto", "category": "tree" }),
        ))
        .await
        .expect("router responde");
    assert_eq!(created.status(), StatusCode::OK);

    let deactivated = create_router_with_state(app.clone())
        .oneshot(admin_update_request(
            &admin_session,
            &admin_csrf,
            &asset_id,
            json!({ "displayName": "Seto", "category": "tree", "isActive": false }),
        ))
        .await
        .expect("router responde");
    assert_eq!(deactivated.status(), StatusCode::OK);

    let admin_list = create_router_with_state(app.clone())
        .oneshot(admin_list_request(&admin_session, &admin_csrf))
        .await
        .expect("router responde");
    let admin_items = json_body(admin_list).await;
    let entry = admin_items
        .as_array()
        .unwrap()
        .iter()
        .find(|asset| asset["id"] == asset_id)
        .expect("el admin ve el asset desactivado");
    assert_eq!(entry["isActive"], json!(false));

    let public = create_router_with_state(app.clone())
        .oneshot(public_list_request())
        .await
        .expect("router responde");
    let public_items = json_body(public).await;
    assert!(
        !public_items
            .as_array()
            .unwrap()
            .iter()
            .any(|asset| asset["id"] == asset_id),
        "el público no ve el asset desactivado"
    );

    cleanup(&app, admin_id, Some(&asset_id)).await;
}

#[tokio::test]
async fn audit_records_asset_events_and_lists_them() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = unique_asset_id();

    let created = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({ "id": asset_id, "displayName": "Seto", "category": "tree" }),
        ))
        .await
        .expect("router responde");
    assert_eq!(created.status(), StatusCode::OK);

    let updated = create_router_with_state(app.clone())
        .oneshot(admin_update_request(
            &admin_session,
            &admin_csrf,
            &asset_id,
            json!({ "displayName": "Seto alto", "category": "tree", "isActive": true }),
        ))
        .await
        .expect("router responde");
    assert_eq!(updated.status(), StatusCode::OK);

    let audit = create_router_with_state(app.clone())
        .oneshot(audit_list_request(&admin_session, &admin_csrf, &asset_id))
        .await
        .expect("router responde");
    assert_eq!(audit.status(), StatusCode::OK);
    let events = json_body(audit).await;
    let actions: Vec<&str> = events
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|event| event["action"].as_str())
        .collect();
    assert!(
        actions.contains(&"asset.created"),
        "debe existir el evento de creación: {actions:?}"
    );
    assert!(
        actions.contains(&"asset.updated"),
        "debe existir el evento de actualización: {actions:?}"
    );
    for event in events.as_array().unwrap() {
        assert_eq!(event["entityKind"], json!("asset"));
        assert_eq!(event["entityId"], json!(asset_id));
        assert!(
            event.get("actorId").is_none(),
            "el listado no expone identidades"
        );
    }

    cleanup(&app, admin_id, Some(&asset_id)).await;
}
