use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::extract::ConnectInfo;
use axum::http::{header::SET_COOKIE, Request, StatusCode};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::handlers::create_router_with_state;
use glory_backend::services::SessionService;
use glory_backend::AppState;

const TEST_SECRET: &str = "game-ticket-http-test-secret";

async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas HTTP de tickets");
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/game-ticket-http-test-uploads".to_string(),
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

fn production_router(state: &AppState, secret: Option<&str>) -> axum::Router {
    let mut router_state = state.clone();
    router_state.game_ticket_secret = secret.map(str::to_string);
    create_router_with_state(router_state)
}

async fn create_user(state: &AppState) -> Uuid {
    let user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash)
         VALUES ($1, $2, 'test-only-password-hash')",
    )
    .bind(user_id)
    .bind(format!("game-ticket-{user_id}@example.invalid"))
    .execute(&state.pool)
    .await
    .expect("debe poder crear el usuario de prueba");
    user_id
}

async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result = SessionService::create(&state.pool, user_id, None, Some("game-ticket-test"))
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

fn ticket_request(
    session_token: &str,
    csrf_cookie: &str,
    csrf_header: Option<&str>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/api/game/ticket")
        .header("origin", "http://localhost:5173")
        .header(
            "cookie",
            format!("session_id={session_token}; csrf_token={csrf_cookie}"),
        );
    if let Some(csrf) = csrf_header {
        builder = builder.header("x-csrf-token", csrf);
    }
    let mut request = builder
        .body(Body::empty())
        .expect("request de ticket válida");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 40_001))));
    request
}

fn guest_ticket_request(cookie: Option<&str>) -> Request<Body> {
    let mut builder = Request::builder()
        .method("POST")
        .uri("/api/game/ticket")
        .header("origin", "http://localhost:5173");
    if let Some(cookie) = cookie {
        builder = builder.header("cookie", cookie);
    }
    let mut request = builder
        .body(Body::empty())
        .expect("request de invitado válida");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 40_002))));
    request
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("cuerpo HTTP legible");
    serde_json::from_slice(&body).expect("respuesta JSON válida")
}

#[tokio::test]
async fn ticket_is_issued_from_session_subject_without_exposing_uuid() {
    let state = test_state().await;
    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;

    let response = production_router(&state, Some(TEST_SECRET))
        .oneshot(ticket_request(
            &session_token,
            &csrf_token,
            Some(&csrf_token),
        ))
        .await
        .expect("router debe responder");
    let status = response.status();
    let body = json_body(response).await;
    let ticket = body["ticket"]
        .as_str()
        .expect("respuesta debe contener ticket");

    cleanup(&state, user_id).await;

    let claims = state
        .game_ticket_store
        .consume(ticket, TEST_SECRET)
        .expect("ticket emitido debe resolver el subject en el store compartido");
    assert_eq!(status, StatusCode::OK);
    assert_eq!(claims.subject, user_id);
    assert!(ticket.starts_with("g1.game."));
    assert!(!ticket.contains(&user_id.to_string()));
    assert!(body.get("userId").is_none());
    assert!(!body.to_string().contains(&user_id.to_string()));
}

#[tokio::test]
async fn guest_ticket_sets_cookie_and_reuses_the_same_server_identity() {
    let state = test_state().await;
    let router = production_router(&state, Some(TEST_SECRET));

    let first = router
        .clone()
        .oneshot(guest_ticket_request(None))
        .await
        .expect("router debe responder");
    assert_eq!(first.status(), StatusCode::OK);
    let set_cookie = first
        .headers()
        .get(SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .expect("la primera petición debe emitir cookie invitada")
        .to_string();
    assert!(set_cookie.starts_with("guest_game=g1.guest."));
    assert!(set_cookie.contains("HttpOnly"));
    let cookie = set_cookie
        .split(';')
        .next()
        .expect("cookie invitada con nombre y valor")
        .to_string();
    let first_body = json_body(first).await;
    let first_ticket = first_body["ticket"].as_str().expect("ticket invitado");
    let first_subject = state
        .game_ticket_store
        .consume(first_ticket, TEST_SECRET)
        .expect("primer ticket consumible")
        .subject;

    let second = router
        .oneshot(guest_ticket_request(Some(&cookie)))
        .await
        .expect("router debe responder");
    assert_eq!(second.status(), StatusCode::OK);
    assert!(second.headers().get(SET_COOKIE).is_none());
    let second_body = json_body(second).await;
    let second_ticket = second_body["ticket"]
        .as_str()
        .expect("segundo ticket invitado");
    let second_subject = state
        .game_ticket_store
        .consume(second_ticket, TEST_SECRET)
        .expect("segundo ticket consumible")
        .subject;
    assert_eq!(first_subject, second_subject);
}

#[tokio::test]
async fn ticket_requires_valid_csrf_for_authenticated_sessions_but_allows_guests() {
    let state = test_state().await;
    let guest = production_router(&state, Some(TEST_SECRET))
        .oneshot(guest_ticket_request(None))
        .await
        .expect("router debe responder");
    assert_eq!(guest.status(), StatusCode::OK);

    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;
    let without_csrf = production_router(&state, Some(TEST_SECRET))
        .oneshot(ticket_request(&session_token, &csrf_token, None))
        .await
        .expect("router debe responder");
    let wrong_csrf = production_router(&state, Some(TEST_SECRET))
        .oneshot(ticket_request(
            &session_token,
            &csrf_token,
            Some("wrong-csrf"),
        ))
        .await
        .expect("router debe responder");

    cleanup(&state, user_id).await;

    assert_eq!(without_csrf.status(), StatusCode::FORBIDDEN);
    assert_eq!(wrong_csrf.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn guest_ticket_rate_limit_is_per_ip_and_returns_429() {
    let state = test_state().await;
    let router = production_router(&state, Some(TEST_SECRET));
    for _ in 0..3 {
        let response = router
            .clone()
            .oneshot(guest_ticket_request(None))
            .await
            .expect("router debe responder");
        assert_eq!(response.status(), StatusCode::OK);
    }
    let limited = router
        .oneshot(guest_ticket_request(None))
        .await
        .expect("router debe responder");
    assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn authenticated_session_revokes_stale_guest_identity_server_side() {
    /* [297A-76] Reclamación invitado→cuenta: una cookie temporal que viaja con
     * una sesión autenticada deja de resolver de inmediato (fail-closed), sin
     * fusionar identidades ni degradar la cuenta. */
    let state = test_state().await;
    let router = production_router(&state, Some(TEST_SECRET));

    /* Crear primero la identidad invitada y quedarnos con su cookie. */
    let guest_response = router
        .clone()
        .oneshot(guest_ticket_request(None))
        .await
        .expect("router debe responder");
    let guest_cookie_header = guest_response
        .headers()
        .get(SET_COOKIE)
        .and_then(|value| value.to_str().ok())
        .expect("cookie invitada")
        .to_string();
    let guest_cookie_value = guest_cookie_header
        .split(';')
        .next()
        .expect("cookie")
        .strip_prefix("guest_game=")
        .expect("prefijo guest_game")
        .to_string();
    let guest_ticket = json_body(guest_response).await["ticket"]
        .as_str()
        .expect("ticket invitado")
        .to_string();
    let guest_subject = state
        .game_ticket_store
        .consume(&guest_ticket, TEST_SECRET)
        .expect("ticket invitado consumible")
        .subject;
    assert!(
        state
            .game_ticket_store
            .resolve_guest(&guest_cookie_value, TEST_SECRET)
            .expect("store disponible")
            .is_some(),
        "la identidad invitada debe estar vigente antes del login"
    );

    /* La cuenta solicita ticket enviando también la cookie invitada. */
    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;
    let authenticated = router
        .clone()
        .oneshot({
            let mut builder = Request::builder()
                .method("POST")
                .uri("/api/game/ticket")
                .header("origin", "http://localhost:5173")
                .header(
                    "cookie",
                    format!("session_id={session_token}; csrf_token={csrf_token}; {guest_cookie_header}"),
                )
                .header("x-csrf-token", &csrf_token);
            let mut request = builder
                .body(Body::empty())
                .expect("request de reclamación válida");
            request
                .extensions_mut()
                .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 40_003))));
            request
        })
        .await
        .expect("router debe responder");
    assert_eq!(authenticated.status(), StatusCode::OK);
    let authenticated_ticket = json_body(authenticated).await["ticket"]
        .as_str()
        .expect("ticket de cuenta")
        .to_string();
    let account_claims = state
        .game_ticket_store
        .consume(&authenticated_ticket, TEST_SECRET)
        .expect("ticket de cuenta consumible");
    assert_eq!(account_claims.subject, user_id);
    assert_ne!(account_claims.subject, guest_subject);

    /* La identidad invitada quedó revocada server-side: la cookie ya no resuelve. */
    assert!(
        state
            .game_ticket_store
            .resolve_guest(&guest_cookie_value, TEST_SECRET)
            .expect("store disponible")
            .is_none(),
        "la identidad invitada debe revocarse al autenticarse"
    );

    cleanup(&state, user_id).await;
}

#[tokio::test]
async fn ticket_fails_closed_when_secret_is_not_configured() {
    let state = test_state().await;
    let user_id = create_user(&state).await;
    let (session_token, csrf_token) = session(&state, user_id).await;

    let response = production_router(&state, None)
        .oneshot(ticket_request(
            &session_token,
            &csrf_token,
            Some(&csrf_token),
        ))
        .await
        .expect("router debe responder");
    let status = response.status();
    let body = json_body(response).await;

    cleanup(&state, user_id).await;

    assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(body["error"], "internal_error");
    assert!(body.get("ticket").is_none());
}
