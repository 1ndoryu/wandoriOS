//! Tests de integración de privacidad de analytics (297A-16).
//! Verifican el E2E del ciclo legal/operativo: consentimiento fail-closed,
//! anonimización (ip/user-agent solo como hashes), deduplicación por event_id,
//! purga por retención y que las métricas agregadas no expongan datos del
//! usuario (user_id, ip, user-agent, metadata) fuera de capacidad.
//! Necesitan `DATABASE_URL` apuntando a la BD local.

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

async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas de analytics");
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/analytics-test-uploads".to_string(),
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

fn router(state: &AppState) -> axum::Router {
    create_router_with_state(state.clone())
}

fn public_request(
    method: &str,
    uri: &str,
    consent: Option<&str>,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("x-forwarded-for", "203.0.113.7")
        .header("user-agent", "Mozilla/5.0 (test)");
    if let Some(value) = consent {
        builder = builder.header("x-analytics-consent", value);
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
        )
        .header("content-type", "application/json");
    if let Some(csrf) = csrf_header {
        builder = builder.header("x-csrf-token", csrf);
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

fn events_batch(count: usize) -> Value {
    let events: Vec<Value> = (0..count)
        .map(|i| {
            json!({
                "event_id": format!("00000000-0000-0000-0000-{:012}", i + 1),
                "event_type": "page_view",
                "target_type": "page",
                "metadata": { "page": format!("/p/{i}") }
            })
        })
        .collect();
    json!({ "events": events })
}

#[tokio::test]
async fn consentimiento_anonimizacion_dedupe_y_purga() {
    let state = test_state().await;
    let router = router(&state);

    /* Limpieza preventiva de runs anteriores. */
    sqlx::query("DELETE FROM analytics_events WHERE metadata->>'page' LIKE '/p/%' OR metadata->>'page' LIKE '/privacy/%'")
        .execute(&state.pool)
        .await
        .expect("limpiar eventos residuales");

    /* 1. Sin consentimiento → fail-closed: nada se almacena. */
    let request = public_request("POST", "/api/analytics/events", None, Some(events_batch(2)));
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let count_sin_consentimiento: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM analytics_events WHERE metadata->>'page' LIKE '/p/%'",
    )
    .fetch_one(&state.pool)
    .await
    .expect("count eventos sin consentimiento");
    assert_eq!(
        count_sin_consentimiento, 0,
        "sin consentimiento no se almacena nada"
    );

    /* 2. Consentimiento explícito → se almacenan con ip/user-agent hasheados. */
    let request = public_request(
        "POST",
        "/api/analytics/events",
        Some("granted"),
        Some(json!({ "events": [
            { "event_id": "00000000-0000-0000-0000-000000000101",
              "event_type": "page_view", "target_type": "page",
              "metadata": { "page": "/privacy/1" } }
        ]})),
    );
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let row: (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT event_type, ip_hash, user_agent FROM analytics_events \
         WHERE metadata->>'page' = '/privacy/1'",
    )
    .fetch_one(&state.pool)
    .await
    .expect("fila del evento consentido");
    assert_eq!(row.0, "page_view");
    let ip_hash = row.1.expect("ip_hash presente");
    let ua_hash = row.2.expect("user_agent presente");
    assert_eq!(ip_hash.len(), 64, "ip guardada como SHA-256");
    assert_eq!(ua_hash.len(), 64, "user-agent guardado como SHA-256");
    assert!(
        !ip_hash.contains("203.0.113.7"),
        "la IP nunca se guarda en claro"
    );
    assert!(
        !ua_hash.contains("Mozilla"),
        "el UA nunca se guarda en claro"
    );

    /* 3. Dedup por event_id: el mismo evento reintentado no infla la métrica. */
    let duplicate = json!({ "events": [
        { "event_id": "00000000-0000-0000-0000-000000000101",
          "event_type": "page_view", "target_type": "page",
          "metadata": { "page": "/privacy/1" } }
    ]});
    let request = public_request(
        "POST",
        "/api/analytics/events",
        Some("granted"),
        Some(duplicate),
    );
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM analytics_events WHERE metadata->>'page' = '/privacy/1'",
    )
    .fetch_one(&state.pool)
    .await
    .expect("count dedup");
    assert_eq!(count, 1, "el reintento no duplica el evento");

    /* 4. Lote mayor de 50 eventos → 422 (límite acotado). */
    let request = public_request(
        "POST",
        "/api/analytics/events",
        Some("granted"),
        Some(events_batch(51)),
    );
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);

    /* 5. Purga por retención: un evento viejo se elimina, el reciente se queda. */
    sqlx::query(
        "UPDATE analytics_events SET created_at = NOW() - INTERVAL '40 days' \
         WHERE metadata->>'page' = '/privacy/1'",
    )
    .execute(&state.pool)
    .await
    .expect("envejecer evento");
    let admin_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users (id, email, password_hash, role)
         VALUES ($1, $2, 'test-only-password-hash', 'admin'::user_role)",
    )
    .bind(admin_id)
    .bind(format!("analytics-admin-{admin_id}@example.invalid"))
    .execute(&state.pool)
    .await
    .expect("crear admin");
    let session = SessionService::create(&state.pool, admin_id, None, Some("analytics-test"))
        .await
        .expect("sesión admin");
    let (token, csrf) = (session.raw_token, session.csrf_token);

    let request = admin_request(
        "POST",
        "/api/admin/analytics/retention",
        &token,
        &csrf,
        Some(&csrf),
        Some(json!({ "max_age_days": 30 })),
    );
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let retention: Value = body_json(response).await;
    assert!(
        retention["deleted"].as_u64().unwrap_or(0) >= 1,
        "el evento viejo se purgó"
    );
    let remaining: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM analytics_events WHERE metadata->>'page' = '/privacy/1'",
    )
    .fetch_one(&state.pool)
    .await
    .expect("count post-purga");
    assert_eq!(remaining, 0, "purga elimina por retención");

    /* 6. Stats agregadas: el panel no expone datos fuera de capacidad. */
    let request = admin_request(
        "GET",
        "/api/admin/analytics/stats",
        &token,
        &csrf,
        None,
        None,
    );
    let response = router.clone().oneshot(request).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let stats: Value = body_json(response).await;
    let serialized = stats.to_string();
    assert!(stats["total_page_views"].is_number());
    assert!(stats["recent_events"].is_array());
    assert!(
        !serialized.contains("ip_hash"),
        "las stats no exponen ip_hash"
    );
    assert!(
        !serialized.contains("user_agent"),
        "las stats no exponen user_agent"
    );
    assert!(
        !serialized.contains("203.0.113.7"),
        "las stats no exponen la IP"
    );
    assert!(
        !serialized.contains("user_id"),
        "las stats no exponen user_id"
    );

    /* Sin sesión → 401 en stats y retention (frontera de capacidad). */
    let anonymous = public_request("GET", "/api/admin/analytics/stats", None, None);
    let response = router.clone().oneshot(anonymous).await.unwrap();
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    /* Limpieza. */
    sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
        .bind(admin_id)
        .execute(&state.pool)
        .await
        .expect("limpiar sesiones");
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(admin_id)
        .execute(&state.pool)
        .await
        .expect("limpiar admin");
}
