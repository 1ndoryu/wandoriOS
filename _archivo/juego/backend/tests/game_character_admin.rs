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
        upload_dir: "target/game-character-admin-test-uploads".to_string(),
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
    .bind(format!("char-admin-{user_id}@example.invalid"))
    .bind(role)
    .execute(&app.pool)
    .await
    .expect("usuario creado");
    let session = SessionService::create(&app.pool, user_id, None, Some("character-admin-test"))
        .await
        .expect("sesión creada");
    (user_id, session.raw_token, session.csrf_token)
}

async fn cleanup(app: &AppState, user_id: Uuid, character_id: Option<&str>) {
    sqlx::query("DELETE FROM user_game_profiles WHERE user_id = $1")
        .bind(user_id)
        .execute(&app.pool)
        .await
        .ok();
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
    if let Some(id) = character_id {
        sqlx::query("DELETE FROM game_character_definitions WHERE id = $1")
            .bind(id)
            .execute(&app.pool)
            .await
            .expect("personaje limpiado");
    }
}

fn unique_character_id() -> String {
    let hex = Uuid::new_v4().simple().to_string();
    format!("tc{}", &hex[..20])
}

fn admin_create_request(
    session: &str,
    csrf_cookie: Option<&str>,
    csrf_header: Option<&str>,
    body: Value,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/api/admin/game/characters")
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

fn profile_update_request(
    session: &str,
    csrf: &str,
    display_name: &str,
    character_id: &str,
) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri("/api/game/profile")
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::from(
            json!({
                "displayName": display_name,
                "characterId": character_id,
                "expectedRevision": 0
            })
            .to_string(),
        ))
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
        "id": unique_character_id(),
        "displayName": "Guardián",
        "bodyTone": "ink"
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
    let id = unique_character_id();
    let body = json!({
        "id": id,
        "displayName": "Guardián de prueba",
        "bodyTone": "ink"
    });

    let created = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            body,
        ))
        .await
        .expect("router responde");
    let created_status = created.status();
    let created_body = json_body(created).await;

    let catalog = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/game/characters")
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let catalog_body = json_body(catalog).await;

    for (label, invalid) in [
        (
            "id mayúscula",
            json!({"id": "Upper-Case", "displayName": "A", "bodyTone": "ink"}),
        ),
        (
            "tono inválido",
            json!({"id": unique_character_id(), "displayName": "A", "bodyTone": "neon"}),
        ),
        (
            "etiqueta vacía",
            json!({"id": unique_character_id(), "displayName": " ", "bodyTone": "ink"}),
        ),
        (
            "etiqueta larga",
            json!({"id": unique_character_id(), "displayName": "x".repeat(49), "bodyTone": "ink"}),
        ),
        (
            "etiqueta con control",
            json!({"id": unique_character_id(), "displayName": "A\nB", "bodyTone": "ink"}),
        ),
    ] {
        let rejected = create_router_with_state(app.clone())
            .oneshot(admin_create_request(
                &admin_session,
                Some(&admin_csrf),
                Some(&admin_csrf),
                invalid,
            ))
            .await
            .expect("router responde");
        assert_eq!(
            rejected.status(),
            StatusCode::UNPROCESSABLE_ENTITY,
            "{label}"
        );
    }

    cleanup(&app, admin_id, Some(&id)).await;
    assert_eq!(created_status, StatusCode::OK);
    assert_eq!(created_body["id"], id);
    assert_eq!(created_body["displayName"], "Guardián de prueba");
    assert_eq!(created_body["isActive"], true);
    assert!(catalog_body
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["id"] == id));
}

#[tokio::test]
async fn admin_create_rejects_duplicate_id() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let id = unique_character_id();
    let body = json!({
        "id": id,
        "displayName": "Único",
        "bodyTone": "middle"
    });

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

    cleanup(&app, admin_id, Some(&id)).await;
    assert_eq!(first.status(), StatusCode::OK);
    assert_eq!(duplicate.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn admin_update_renames_deactivates_and_blocks_profile_selection() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, user_csrf) = create_user(&app, "user").await;
    let id = unique_character_id();

    create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            Some(&admin_csrf),
            Some(&admin_csrf),
            json!({
                "id": id,
                "displayName": "Activo",
                "bodyTone": "ink"
            }),
        ))
        .await
        .expect("creación responde");

    let update = create_router_with_state(app.clone())
        .oneshot({
            let request = Request::builder()
                .method("PUT")
                .uri(format!("/api/admin/game/characters/{id}"))
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header(
                    "cookie",
                    format!("session_id={admin_session}; csrf_token={admin_csrf}"),
                )
                .header("x-csrf-token", &admin_csrf)
                .body(Body::from(
                    json!({
                        "displayName": "Retirado",
                        "bodyTone": "paper",
                        "isActive": false
                    })
                    .to_string(),
                ))
                .expect("request válida");
            request
        })
        .await
        .expect("actualización responde");
    let update_status = update.status();
    let update_body = json_body(update).await;

    let catalog = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/game/characters")
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let catalog_body = json_body(catalog).await;

    let selection = create_router_with_state(app.clone())
        .oneshot(profile_update_request(
            &user_session,
            &user_csrf,
            "Explorador",
            &id,
        ))
        .await
        .expect("perfil responde");

    let missing = create_router_with_state(app.clone())
        .oneshot({
            let request = Request::builder()
                .method("PUT")
                .uri("/api/admin/game/characters/no-existe")
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header(
                    "cookie",
                    format!("session_id={admin_session}; csrf_token={admin_csrf}"),
                )
                .header("x-csrf-token", &admin_csrf)
                .body(Body::from(
                    json!({
                        "displayName": "X",
                        "bodyTone": "ink",
                        "isActive": true
                    })
                    .to_string(),
                ))
                .expect("request válida");
            request
        })
        .await
        .expect("actualización responde");

    cleanup(&app, admin_id, Some(&id)).await;
    cleanup(&app, user_id, None).await;
    assert_eq!(update_status, StatusCode::OK);
    assert_eq!(update_body["displayName"], "Retirado");
    assert_eq!(update_body["bodyTone"], "paper");
    assert_eq!(update_body["isActive"], false);
    assert!(!catalog_body
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["id"] == id));
    assert_eq!(selection.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn admin_list_requires_admin_role() {
    let app = state().await;
    let (admin_id, _admin_session, _admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, _user_csrf) = create_user(&app, "user").await;

    let without_session = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/admin/game/characters")
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let non_admin = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/admin/game/characters")
                .header("cookie", format!("session_id={user_session}"))
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");

    cleanup(&app, admin_id, None).await;
    cleanup(&app, user_id, None).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn admin_list_includes_deactivated_while_public_hides_them() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let active_id = unique_character_id();
    let retired_id = unique_character_id();

    for (id, name) in [(&active_id, "Activo"), (&retired_id, "Retirado")] {
        create_router_with_state(app.clone())
            .oneshot(admin_create_request(
                &admin_session,
                Some(&admin_csrf),
                Some(&admin_csrf),
                json!({ "id": id, "displayName": name, "bodyTone": "ink" }),
            ))
            .await
            .expect("creación responde");
    }

    create_router_with_state(app.clone())
        .oneshot({
            let request = Request::builder()
                .method("PUT")
                .uri(format!("/api/admin/game/characters/{retired_id}"))
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header(
                    "cookie",
                    format!("session_id={admin_session}; csrf_token={admin_csrf}"),
                )
                .header("x-csrf-token", &admin_csrf)
                .body(Body::from(
                    json!({
                        "displayName": "Retirado",
                        "bodyTone": "paper",
                        "isActive": false
                    })
                    .to_string(),
                ))
                .expect("request válida");
            request
        })
        .await
        .expect("actualización responde");

    let admin_list = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/admin/game/characters")
                .header("cookie", format!("session_id={admin_session}"))
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let admin_list_status = admin_list.status();
    let admin_body = json_body(admin_list).await;

    let public_catalog = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/game/characters")
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let public_body = json_body(public_catalog).await;

    sqlx::query("DELETE FROM game_character_definitions WHERE id = $1")
        .bind(&active_id)
        .execute(&app.pool)
        .await
        .expect("personaje activo limpiado");
    sqlx::query("DELETE FROM game_character_definitions WHERE id = $1")
        .bind(&retired_id)
        .execute(&app.pool)
        .await
        .expect("personaje retirado limpiado");
    cleanup(&app, admin_id, None).await;

    assert_eq!(admin_list_status, StatusCode::OK);
    let admin_items = admin_body.as_array().expect("lista admin válida");
    let active_item = admin_items
        .iter()
        .find(|item| item["id"] == active_id)
        .expect("opción activa listada");
    let retired_item = admin_items
        .iter()
        .find(|item| item["id"] == retired_id)
        .expect("opción desactivada listada");
    assert_eq!(active_item["isActive"], true);
    assert_eq!(retired_item["isActive"], false);
    assert!(public_body
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["id"] == active_id));
    assert!(!public_body
        .as_array()
        .unwrap()
        .iter()
        .any(|item| item["id"] == retired_id));
}
