use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::to_bytes;
use axum::body::Body;
use axum::http::{Request, StatusCode};
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
        upload_dir: "target/game-character-test-uploads".to_string(),
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

async fn create_user(app: &AppState) -> (Uuid, String, String) {
    let user_id = Uuid::new_v4();
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'test-hash')")
        .bind(user_id)
        .bind(format!("character-{user_id}@example.invalid"))
        .execute(&app.pool)
        .await
        .expect("usuario creado");
    let session = SessionService::create(&app.pool, user_id, None, Some("character-test"))
        .await
        .expect("sesión creada");
    (user_id, session.raw_token, session.csrf_token)
}

async fn cleanup(app: &AppState, user_id: Uuid) {
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

#[tokio::test]
async fn public_catalog_returns_only_active_allowlisted_options() {
    let app = state().await;
    let response = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .uri("/api/game/characters")
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let status = response.status();
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body legible");
    let json: serde_json::Value = serde_json::from_slice(&body).expect("json válido");
    assert_eq!(status, StatusCode::OK);
    /* [297A-52] Las pruebas admin pueden añadir opciones a la misma BD aislada;
     * el contrato público no exige un número fijo de filas, solo su forma. */
    assert!(json.as_array().map(Vec::len).unwrap_or(0) >= 3);
    assert!(json.as_array().unwrap().iter().all(|item| {
        item.get("id").is_some()
            && item.get("displayName").is_some()
            && item.get("bodyTone").is_some()
            && item.get("isActive").is_none()
            && item.get("createdAt").is_none()
            && item.get("script").is_none()
            && item.get("storageKey").is_none()
    }));
}

#[tokio::test]
async fn profile_selection_rejects_unknown_character_and_accepts_seeded_option() {
    let app = state().await;
    let (user_id, session, csrf) = create_user(&app).await;
    let make_request = |character_id: &str| {
        Request::builder()
            .method("PUT")
            .uri("/api/game/profile")
            .header("origin", "http://localhost:5173")
            .header("content-type", "application/json")
            .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
            .header("x-csrf-token", &csrf)
            .body(Body::from(
                serde_json::json!({
                    "displayName": "Explorador",
                    "characterId": character_id,
                    "expectedRevision": 0
                })
                .to_string(),
            ))
            .expect("request válida")
    };

    let rejected = create_router_with_state(app.clone())
        .oneshot(make_request("admin"))
        .await
        .expect("router responde");
    let accepted = create_router_with_state(app.clone())
        .oneshot(make_request("forest-ranger"))
        .await
        .expect("router responde");
    let accepted_body = to_bytes(accepted.into_body(), usize::MAX)
        .await
        .expect("body legible");
    let json: serde_json::Value = serde_json::from_slice(&accepted_body).expect("json válido");

    cleanup(&app, user_id).await;
    assert_eq!(rejected.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(json["characterId"], "forest-ranger");
    assert_eq!(json["revision"], 1);
}
