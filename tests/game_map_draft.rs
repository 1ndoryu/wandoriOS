use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::config::AppConfig;
use glory_backend::handlers::create_router;
use glory_backend::models::game_map::MAP_VERSION_MAX_JSON_BYTES;
use glory_backend::services::SessionService;
use glory_backend::AppState;

async fn test_state() -> AppState {
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL es obligatorio para las pruebas HTTP de borradores");
    let pool = PgPoolOptions::new()
        .max_connections(16)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/game-map-draft-http-test-uploads".to_string(),
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
    create_router(
        state.pool.clone(),
        AppConfig {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL debe existir"),
            host: "127.0.0.1".to_string(),
            port: 3000,
            stripe_secret_key: None,
            stripe_webhook_secret: None,
            game_ticket_secret: None,
            upload_dir: "target/game-map-draft-http-test-uploads".to_string(),
            resend_api_key: None,
            email_from: "test@example.invalid".to_string(),
            frontend_dist: "frontend/dist".to_string(),
        },
    )
}

async fn create_user(state: &AppState, role: &str) -> Uuid {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO users
            (id, email, password_hash, role, status, email_verified_at)
         VALUES ($1, $2, 'test-only-password-hash', $3::user_role, 'active', NOW())",
    )
    .bind(id)
    .bind(format!("game-map-draft-{role}-{id}@example.invalid"))
    .bind(role)
    .execute(&state.pool)
    .await
    .expect("debe poder crear el usuario de prueba");
    id
}

async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result = SessionService::create(&state.pool, user_id, None, Some("game-map-draft-test"))
        .await
        .expect("debe poder crear la sesión de prueba");
    (result.raw_token, result.csrf_token)
}

async fn cleanup(state: &AppState, user_ids: &[Uuid]) {
    for user_id in user_ids {
        sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
            .bind(user_id)
            .execute(&state.pool)
            .await
            .expect("debe poder limpiar las sesiones de prueba");
        sqlx::query(
            "DELETE FROM users
             WHERE id = $1
               AND NOT EXISTS (
                   SELECT 1 FROM game_map_versions WHERE published_by = $1
               )",
        )
        .bind(user_id)
        .execute(&state.pool)
        .await
        .expect("debe poder limpiar el usuario si no es autor");
    }
}

fn map_id() -> String {
    format!("map-draft-test-{}", Uuid::new_v4())
}

fn valid_document(id: &str) -> Value {
    json!({
        "schemaVersion": 1,
        "id": id,
        "terrain": {
            "schemaVersion": 1,
            "bounds": { "minX": 0.0, "maxX": 32.0, "minZ": 0.0, "maxZ": 32.0 },
            "cellSize": 2.0,
            "chunkSize": 16,
            "chunks": [{
                "x": 0,
                "z": 0,
                "heights": vec![0.0; 289],
                "surfaces": vec![0; 256]
            }]
        },
        "assetManifest": {
            "tree-v1": {
                "id": "tree-v1",
                "category": "tree",
                "contentHash": "sha256:tree-v1",
                "collisionProxy": { "kind": "circle", "radius": 0.5 }
            }
        },
        "instances": [{
            "id": "tree-instance",
            "assetVersionId": "tree-v1",
            "position": { "x": 8.0, "z": 8.0 },
            "rotationY": 0.0,
            "scale": 1.0,
            "terrainAnchor": "surface"
        }],
        "spawnPoints": [{
            "id": "spawn",
            "position": { "x": 2.0, "z": 2.0 },
            "radius": 0.5
        }]
    })
}

fn draft_request(
    method: &str,
    map_id: &str,
    session_token: &str,
    csrf_cookie: &str,
    csrf_header: &str,
    expected_revision: i32,
    document: &Value,
) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(format!("/api/admin/game/maps/{map_id}/draft"))
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header(
            "cookie",
            format!("session_id={session_token}; csrf_token={csrf_cookie}"),
        )
        .header("x-csrf-token", csrf_header)
        .body(Body::from(
            json!({
                "expectedRevision": expected_revision,
                "mapId": map_id,
                "document": document
            })
            .to_string(),
        ))
        .expect("request de borrador válida")
}

async fn response_json(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("cuerpo HTTP legible");
    serde_json::from_slice(&body).expect("respuesta JSON válida")
}

#[tokio::test]
async fn draft_requires_admin_and_valid_csrf() {
    let state = test_state().await;
    let map = map_id();
    let user_id = create_user(&state, "user").await;
    let admin_id = create_user(&state, "admin").await;
    let (user_token, user_csrf) = session(&state, user_id).await;
    let (admin_token, admin_csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let non_admin = router
        .clone()
        .oneshot(draft_request(
            "PUT",
            &map,
            &user_token,
            &user_csrf,
            &user_csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("router debe responder");
    let invalid_csrf = production_router(&state)
        .oneshot(draft_request(
            "PUT",
            &map,
            &admin_token,
            &admin_csrf,
            "wrong-csrf",
            0,
            &valid_document(&map),
        ))
        .await
        .expect("router debe responder");

    let non_admin_status = non_admin.status();
    let invalid_csrf_status = invalid_csrf.status();
    cleanup(&state, &[user_id, admin_id]).await;

    assert_eq!(non_admin_status, StatusCode::FORBIDDEN);
    assert_eq!(invalid_csrf_status, StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn draft_requires_session_and_coherent_map_id() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;

    let without_session = production_router(&state)
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/admin/game/maps/{map}/draft"))
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "expectedRevision": 0,
                        "mapId": map,
                        "document": valid_document(&map)
                    })
                    .to_string(),
                ))
                .expect("request sin sesión válida"),
        )
        .await
        .expect("router debe responder");

    /* Un mapId en el body distinto del path rechaza antes de tocar la BD. */
    let incoherent_body = production_router(&state)
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/admin/game/maps/{map}/draft"))
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header("cookie", format!("session_id={token}; csrf_token={csrf}"))
                .header("x-csrf-token", &csrf)
                .body(Body::from(
                    json!({
                        "expectedRevision": 0,
                        "mapId": "another-map",
                        "document": valid_document(&map)
                    })
                    .to_string(),
                ))
                .expect("request con mapId incoherente"),
        )
        .await
        .expect("router debe responder");

    let without_session_status = without_session.status();
    let incoherent_body_status = incoherent_body.status();
    cleanup(&state, &[admin_id]).await;

    assert_eq!(without_session_status, StatusCode::UNAUTHORIZED);
    assert_eq!(incoherent_body_status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn save_and_get_draft_roundtrip_with_optimistic_revision() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let first = router
        .clone()
        .oneshot(draft_request(
            "PUT",
            &map,
            &token,
            &csrf,
            &csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("primer guardado debe responder");
    let first_status = first.status();
    let first_body = response_json(first).await;

    let fetched = router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/admin/game/maps/{map}/draft"))
                .header("cookie", format!("session_id={token}; csrf_token={csrf}"))
                .body(Body::empty())
                .expect("lectura de borrador válida"),
        )
        .await
        .expect("lectura debe responder");
    let fetched_status = fetched.status();
    let fetched_body = response_json(fetched).await;

    let second = router
        .clone()
        .oneshot(draft_request(
            "PUT",
            &map,
            &token,
            &csrf,
            &csrf,
            1,
            &valid_document(&map),
        ))
        .await
        .expect("segundo guardado debe responder");
    let second_status = second.status();
    let second_body = response_json(second).await;

    let stale = router
        .oneshot(draft_request(
            "PUT",
            &map,
            &token,
            &csrf,
            &csrf,
            1,
            &valid_document(&map),
        ))
        .await
        .expect("guardado obsoleto debe responder");
    let stale_status = stale.status();

    cleanup(&state, &[admin_id]).await;

    assert_eq!(first_status, StatusCode::OK);
    assert_eq!(first_body["revision"], 1);
    assert_eq!(first_body["mapId"], map);
    assert_eq!(fetched_status, StatusCode::OK);
    assert_eq!(fetched_body["revision"], 1);
    assert!(fetched_body.get("updatedBy").is_none());
    assert_eq!(second_status, StatusCode::OK);
    assert_eq!(second_body["revision"], 2);
    assert_eq!(stale_status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn publish_clears_draft_and_public_get_never_serves_it() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let saved = router
        .clone()
        .oneshot(draft_request(
            "PUT",
            &map,
            &token,
            &csrf,
            &csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("guardado debe responder");
    assert_eq!(saved.status(), StatusCode::OK);

    let published = router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/game/maps")
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header("cookie", format!("session_id={token}; csrf_token={csrf}"))
                .header("x-csrf-token", &csrf)
                .body(Body::from(
                    json!({
                        "expectedVersion": 0,
                        "mapId": map,
                        "document": valid_document(&map)
                    })
                    .to_string(),
                ))
                .expect("publicación válida"),
        )
        .await
        .expect("publicación debe responder");
    let published_status = published.status();

    let draft_after_publish = router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/admin/game/maps/{map}/draft"))
                .header("cookie", format!("session_id={token}; csrf_token={csrf}"))
                .body(Body::empty())
                .expect("lectura de borrador válida"),
        )
        .await
        .expect("lectura debe responder");
    let draft_after_publish_status = draft_after_publish.status();

    let public_map = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/game/maps/{map}"))
                .body(Body::empty())
                .expect("lectura pública válida"),
        )
        .await
        .expect("lectura pública debe responder");
    let public_status = public_map.status();
    let public_body = response_json(public_map).await;

    cleanup(&state, &[admin_id]).await;

    assert_eq!(published_status, StatusCode::OK);
    assert_eq!(draft_after_publish_status, StatusCode::NOT_FOUND);
    assert_eq!(public_status, StatusCode::OK);
    assert_eq!(public_body["version"], 1);
    assert!(public_body.get("revision").is_none());
}

#[tokio::test]
async fn draft_rejects_body_over_map_quota_and_invalid_document() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let oversized = router
        .clone()
        .oneshot(
            Request::builder()
                .method("PUT")
                .uri(format!("/api/admin/game/maps/{map}/draft"))
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header("cookie", format!("session_id={token}; csrf_token={csrf}"))
                .header("x-csrf-token", &csrf)
                .body(Body::from(vec![b' '; MAP_VERSION_MAX_JSON_BYTES + 1]))
                .expect("request sobredimensionada válida"),
        )
        .await
        .expect("router debe responder");

    let mut broken = valid_document(&map);
    broken["schemaVersion"] = json!(99);
    let invalid_document = router
        .oneshot(draft_request("PUT", &map, &token, &csrf, &csrf, 0, &broken))
        .await
        .expect("router debe responder");

    let oversized_status = oversized.status();
    let invalid_status = invalid_document.status();
    cleanup(&state, &[admin_id]).await;

    assert_eq!(oversized_status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(invalid_status, StatusCode::UNPROCESSABLE_ENTITY);
}
