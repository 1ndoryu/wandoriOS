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

async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas HTTP de perfiles");
    let pool = PgPoolOptions::new()
        .max_connections(16)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/game-profile-http-test-uploads".to_string(),
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

async fn create_user(state: &AppState) -> Uuid {
    let user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, 'test-only-password-hash')",
    )
    .bind(user_id)
    .bind(format!("game-profile-{user_id}@example.invalid"))
    .execute(&state.pool)
    .await
    .expect("debe poder crear el usuario de prueba");
    user_id
}

async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result = SessionService::create(&state.pool, user_id, None, Some("game-profile-test"))
        .await
        .expect("debe poder crear la sesión de prueba");
    (result.raw_token, result.csrf_token)
}

async fn cleanup(state: &AppState, user_id: Uuid) {
    sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("debe poder limpiar sesiones");
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("debe poder limpiar usuario");
}

fn get_request() -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri("/api/game/profile")
        .body(Body::empty())
        .expect("GET válida")
}

fn update_request(
    session_token: &str,
    csrf_cookie: Option<&str>,
    csrf_header: Option<&str>,
    display_name: &str,
    expected_revision: i32,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("PUT")
        .uri("/api/game/profile")
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header(
            "cookie",
            format!(
                "session_id={session_token}; csrf_token={}",
                csrf_cookie.unwrap_or("missing")
            ),
        );
    if let Some(csrf_header) = csrf_header {
        builder = builder.header("x-csrf-token", csrf_header);
    }
    builder
        .body(Body::from(
            json!({
                "displayName": display_name,
                "characterId": "forest-scout",
                "expectedRevision": expected_revision,
            })
            .to_string(),
        ))
        .expect("PUT válida")
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("cuerpo HTTP legible");
    serde_json::from_slice(&body).expect("respuesta JSON válida")
}

#[tokio::test]
async fn profile_is_private_and_returns_a_safe_default_without_a_row() {
    let state = test_state().await;
    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;
    let mut request = get_request();
    request.headers_mut().insert(
        "cookie",
        format!("session_id={session_token}; csrf_token={csrf_token}")
            .parse()
            .expect("cookie válida"),
    );

    let response = create_router_with_state(state.clone())
        .oneshot(request)
        .await
        .expect("router debe responder");
    let status = response.status();
    let body = json_body(response).await;
    let row_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM user_game_profiles WHERE user_id = $1")
            .bind(user_id)
            .fetch_one(&state.pool)
            .await
            .expect("debe poder inspeccionar perfil");

    cleanup(&state, user_id).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["displayName"], "Jugador");
    assert_eq!(body["characterId"], "forest-scout");
    assert_eq!(body["revision"], 0);
    assert!(body.get("userId").is_none());
    assert_eq!(row_count.0, 0);
}

#[tokio::test]
async fn profile_update_requires_session_and_csrf() {
    let state = test_state().await;
    let without_session = create_router_with_state(state.clone())
        .oneshot(update_request(
            "missing",
            Some("csrf"),
            Some("csrf"),
            "Bosque",
            0,
        ))
        .await
        .expect("router debe responder");

    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;
    let without_csrf = create_router_with_state(state.clone())
        .oneshot(update_request(
            &session_token,
            Some(&csrf_token),
            None,
            "Bosque",
            0,
        ))
        .await
        .expect("router debe responder");
    let wrong_csrf = create_router_with_state(state.clone())
        .oneshot(update_request(
            &session_token,
            Some(&csrf_token),
            Some("wrong"),
            "Bosque",
            0,
        ))
        .await
        .expect("router debe responder");

    cleanup(&state, user_id).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(without_csrf.status(), StatusCode::FORBIDDEN);
    assert_eq!(wrong_csrf.status(), StatusCode::FORBIDDEN);
    let _ = csrf_token;
}

#[tokio::test]
async fn profile_update_validates_allowlisted_name_and_unknown_fields() {
    let state = test_state().await;
    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;

    let oversized = update_request(
        &session_token,
        Some(&csrf_token),
        Some(&csrf_token),
        &"x".repeat(25),
        0,
    );
    let oversized_response = create_router_with_state(state.clone())
        .oneshot(oversized)
        .await
        .expect("router debe responder");

    let body = json!({
        "displayName": "Bosque",
        "expectedRevision": 0,
        "fakeField": "admin"
    });
    let unknown_response = create_router_with_state(state.clone())
        .oneshot({
            let mut request = Request::builder()
                .method("PUT")
                .uri("/api/game/profile")
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header(
                    "cookie",
                    format!("session_id={session_token}; csrf_token={csrf_token}"),
                )
                .header("x-csrf-token", &csrf_token)
                .body(Body::from(body.to_string()))
                .expect("request con campo desconocido");
            request.headers_mut().remove("content-length");
            request
        })
        .await
        .expect("router debe responder");

    cleanup(&state, user_id).await;
    assert_eq!(
        oversized_response.status(),
        StatusCode::UNPROCESSABLE_ENTITY
    );
    assert_eq!(unknown_response.status(), StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn concurrent_first_updates_have_one_winner_and_revision_increments() {
    let state = test_state().await;
    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;
    let router = create_router_with_state(state.clone());
    let first = router.clone().oneshot(update_request(
        &session_token,
        Some(&csrf_token),
        Some(&csrf_token),
        "Claro",
        0,
    ));
    let second = router.oneshot(update_request(
        &session_token,
        Some(&csrf_token),
        Some(&csrf_token),
        "Oscuro",
        0,
    ));
    let (first, second) = tokio::join!(first, second);
    let first = first.expect("primera request debe responder");
    let second = second.expect("segunda request debe responder");
    let statuses = [first.status(), second.status()];
    let first_body = json_body(first).await;
    let second_body = json_body(second).await;
    let success = if statuses[0] == StatusCode::OK {
        first_body
    } else {
        second_body
    };
    let row: (String, String, i32) = sqlx::query_as(
        "SELECT display_name, character_id, revision FROM user_game_profiles WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_one(&state.pool)
    .await
    .expect("la escritura ganadora debe crear el perfil");

    cleanup(&state, user_id).await;
    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == StatusCode::OK)
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|status| **status == StatusCode::CONFLICT)
            .count(),
        1
    );
    assert!(success["displayName"] == "Claro" || success["displayName"] == "Oscuro");
    assert_eq!(success["revision"], 1);
    assert_eq!(row.1, "forest-scout");
    assert_eq!(row.2, 1);
}
