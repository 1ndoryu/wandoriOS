// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
//! Helpers compartidos de los tests de integración (modulo common).

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::extract::ConnectInfo;
use axum::http::Request;
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use uuid::Uuid;

use glory_backend::handlers::create_router_with_state;
use glory_backend::services::SessionService;
use glory_backend::AppState;

pub async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas del comercio");
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/commerce-e2e-test-uploads".to_string(),
        resend_api_key: None,
        email_from: "test@example.invalid".to_string(),
        /* Sin secretos Stripe → modo mock (dev). Con claves reales el mock
         * nunca se activa (fail-closed). */
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        site_url: "http://localhost:3000".to_string(),
        login_rate_limit: Arc::new(Mutex::new(HashMap::new())),
        auth_action_rate_limit: Arc::new(Mutex::new(HashMap::new())),
        dev_mailbox: Arc::new(Mutex::new(Vec::new())),
    }
}

pub fn production_router(state: &AppState) -> axum::Router {
    create_router_with_state(state.clone())
}

pub async fn create_user(state: &AppState, role: &str, email_prefix: &str) -> (Uuid, String) {
    let user_id = Uuid::new_v4();
    let email = format!("{email_prefix}-{user_id}@example.invalid");
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role)
         VALUES ($1, $2, 'test-only-password-hash', $3::user_role)",
    )
    .bind(user_id)
    .bind(&email)
    .bind(role)
    .execute(&state.pool)
    .await
    .expect("debe poder crear el usuario de prueba");
    (user_id, email)
}

pub async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result = SessionService::create(&state.pool, user_id, None, Some("commerce-e2e-test"))
        .await
        .expect("debe poder crear la sesión de prueba");
    (result.raw_token, result.csrf_token)
}

pub fn admin_request(
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
        .expect("request construido");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 5000))));
    request
}

/// Request público sin sesión (checkout invitado, webhook, descarga).
pub fn public_request(method: &str, uri: &str, body: Option<Value>) -> Request<Body> {
    let builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json");
    let mut request = builder
        .body(
            body.map(|value| Body::from(value.to_string()))
                .unwrap_or_else(Body::empty),
        )
        .expect("request público construido");
    request
        .extensions_mut()
        .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 5000))));
    request
}

pub async fn body_json(response: axum::response::Response) -> Value {
    let bytes = to_bytes(response.into_body(), 1_048_576)
        .await
        .expect("cuerpo leído");
    serde_json::from_slice(&bytes).unwrap_or(Value::Null)
}

pub async fn body_bytes(response: axum::response::Response) -> Vec<u8> {
    to_bytes(response.into_body(), 1_048_576)
        .await
        .expect("cuerpo leído")
        .to_vec()
}

/// Evento de webhook de prueba (livemode=false) firmado por el propio test.
pub fn test_event(event_id: &str, event_type: &str, object: Value) -> Value {
    json!({
        "id": event_id,
        "type": event_type,
        "livemode": false,
        "data": { "object": object }
    })
}
