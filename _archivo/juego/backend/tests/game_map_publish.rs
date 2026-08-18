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
        .expect("DATABASE_URL es obligatorio para las pruebas HTTP de mapas");
    let pool = PgPoolOptions::new()
        .max_connections(16)
        .connect(&database_url)
        .await
        .expect("la base de datos de pruebas debe estar disponible");

    AppState {
        pool,
        upload_dir: "target/game-map-http-test-uploads".to_string(),
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
            upload_dir: "target/game-map-http-test-uploads".to_string(),
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
    .bind(format!("game-map-{role}-{id}@example.invalid"))
    .bind(role)
    .execute(&state.pool)
    .await
    .expect("debe poder crear el usuario de prueba");
    id
}

async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
    let result = SessionService::create(&state.pool, user_id, None, Some("game-map-test"))
        .await
        .expect("debe poder crear la sesión de prueba");
    (result.raw_token, result.csrf_token)
}

async fn cleanup(state: &AppState, user_ids: &[Uuid]) {
    /* Los snapshots son inmutables incluso para DELETE y conservan su autoría.
     * Se eliminan primero las sesiones; los usuarios que ya son autores se
     * conservan por la FK RESTRICT y los demás sí se limpian. */
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
    format!("map-test-{}", Uuid::new_v4())
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

fn publish_request(
    session_token: &str,
    csrf_cookie: &str,
    csrf_header: &str,
    expected_version: i32,
    document: &Value,
) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/admin/game/maps")
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header(
            "cookie",
            format!("session_id={session_token}; csrf_token={csrf_cookie}"),
        )
        .header("x-csrf-token", csrf_header)
        .body(Body::from(
            json!({
                "expectedVersion": expected_version,
                "document": document
            })
            .to_string(),
        ))
        .expect("request de publicación válida")
}

async fn response_json(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("cuerpo HTTP legible");
    serde_json::from_slice(&body).expect("respuesta JSON válida")
}

#[tokio::test]
async fn publish_requires_admin_and_valid_csrf() {
    let state = test_state().await;
    let map = map_id();
    let user_id = create_user(&state, "user").await;
    let admin_id = create_user(&state, "admin").await;
    let (user_token, user_csrf) = session(&state, user_id).await;
    let (admin_token, admin_csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let non_admin = router
        .clone()
        .oneshot(publish_request(
            &user_token,
            &user_csrf,
            &user_csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("router debe responder");
    let invalid_csrf = production_router(&state)
        .oneshot(publish_request(
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
async fn publish_without_session_returns_401_and_map_id_mismatch_returns_422() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;

    let without_session = production_router(&state)
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/game/maps")
                .header("content-type", "application/json")
                .body(Body::from(
                    json!({
                        "expectedVersion": 0,
                        "document": valid_document(&map)
                    })
                    .to_string(),
                ))
                .expect("request sin sesión válida"),
        )
        .await
        .expect("router debe responder");

    let mismatch = production_router(&state)
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
    let mismatch_status = mismatch.status();
    cleanup(&state, &[admin_id]).await;

    assert_eq!(without_session_status, StatusCode::UNAUTHORIZED);
    assert_eq!(mismatch_status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
async fn publish_persists_fixture_and_public_get_hides_admin_fields() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let published = router
        .clone()
        .oneshot(publish_request(
            &token,
            &csrf,
            &csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("publicación debe responder");
    let published_status = published.status();
    let published_body = response_json(published).await;

    let public_response = router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/game/maps/{map}"))
                .body(Body::empty())
                .expect("lectura pública válida"),
        )
        .await
        .expect("lectura pública debe responder");
    let public_status = public_response.status();
    let public_body = response_json(public_response).await;
    let row: (i64, i64) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE is_active), COUNT(*)
         FROM game_map_versions WHERE map_id = $1",
    )
    .bind(&map)
    .fetch_one(&state.pool)
    .await
    .expect("debe poder inspeccionar el fixture persistido");

    cleanup(&state, &[admin_id]).await;

    assert_eq!(published_status, StatusCode::OK);
    assert_eq!(public_status, StatusCode::OK);
    assert_eq!(published_body["mapId"], map);
    assert_eq!(published_body["version"], 1);
    assert_eq!(public_body["mapId"], map);
    assert_eq!(public_body["version"], 1);
    assert!(public_body.get("publishedBy").is_none());
    assert!(public_body.get("isActive").is_none());
    assert!(public_body.get("id").is_none());
    assert_eq!(row, (1, 1));
}

#[tokio::test]
async fn stale_revision_returns_409_and_second_publish_keeps_one_active() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let router = production_router(&state);

    let first = router
        .clone()
        .oneshot(publish_request(
            &token,
            &csrf,
            &csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("primera publicación debe responder");
    assert_eq!(first.status(), StatusCode::OK);

    let stale_response = router
        .clone()
        .oneshot(publish_request(
            &token,
            &csrf,
            &csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("publicación obsoleta debe responder");
    let stale_status = stale_response.status();
    let stale_body = response_json(stale_response).await;

    let second = router
        .oneshot(publish_request(
            &token,
            &csrf,
            &csrf,
            1,
            &valid_document(&map),
        ))
        .await
        .expect("segunda publicación debe responder");
    let second_status = second.status();
    let second_body = response_json(second).await;
    let row: (i64, i64, Option<i32>) = sqlx::query_as(
        "SELECT COUNT(*) FILTER (WHERE is_active), COUNT(*), MAX(version) FILTER (WHERE is_active)
         FROM game_map_versions WHERE map_id = $1",
    )
    .bind(&map)
    .fetch_one(&state.pool)
    .await
    .expect("debe poder inspeccionar versiones activas");

    cleanup(&state, &[admin_id]).await;

    assert_eq!(stale_status, StatusCode::CONFLICT);
    assert_eq!(stale_body["error"], "conflict");
    assert_eq!(second_status, StatusCode::OK);
    assert_eq!(second_body["version"], 2);
    assert_eq!(row, (1, 2, Some(2)));
}

#[tokio::test]
async fn concurrent_first_publications_have_one_winner() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let router = production_router(&state);
    let first = router.clone().oneshot(publish_request(
        &token,
        &csrf,
        &csrf,
        0,
        &valid_document(&map),
    ));
    let second = router.oneshot(publish_request(
        &token,
        &csrf,
        &csrf,
        0,
        &valid_document(&map),
    ));
    let (first, second) = tokio::join!(first, second);
    let statuses = [
        first.expect("primera request debe responder").status(),
        second.expect("segunda request debe responder").status(),
    ];
    let active_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM game_map_versions WHERE map_id = $1 AND is_active")
            .bind(&map)
            .fetch_one(&state.pool)
            .await
            .expect("debe poder comprobar la versión activa");

    cleanup(&state, &[admin_id]).await;

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
    assert_eq!(active_count.0, 1);
}

#[tokio::test]
async fn publish_rejects_body_over_map_quota_before_deserialization() {
    let state = test_state().await;
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let oversized = Body::from(vec![b' '; MAP_VERSION_MAX_JSON_BYTES + 1]);
    let response = production_router(&state)
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/admin/game/maps")
                .header("origin", "http://localhost:5173")
                .header("content-type", "application/json")
                .header("cookie", format!("session_id={token}; csrf_token={csrf}"))
                .header("x-csrf-token", &csrf)
                .body(oversized)
                .expect("request sobredimensionada válida"),
        )
        .await
        .expect("router debe responder");

    cleanup(&state, &[admin_id]).await;
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
}

#[tokio::test]
async fn published_snapshot_cannot_be_mutated_by_database_update() {
    let state = test_state().await;
    let map = map_id();
    let admin_id = create_user(&state, "admin").await;
    let (token, csrf) = session(&state, admin_id).await;
    let response = production_router(&state)
        .oneshot(publish_request(
            &token,
            &csrf,
            &csrf,
            0,
            &valid_document(&map),
        ))
        .await
        .expect("publicación debe responder");
    assert_eq!(response.status(), StatusCode::OK);

    let attempted_update =
        sqlx::query("UPDATE game_map_versions SET document = '{}'::jsonb WHERE map_id = $1")
            .bind(&map)
            .execute(&state.pool)
            .await;
    let attempted_delete = sqlx::query("DELETE FROM game_map_versions WHERE map_id = $1")
        .bind(&map)
        .execute(&state.pool)
        .await;
    let document: (Value,) =
        sqlx::query_as("SELECT document FROM game_map_versions WHERE map_id = $1 AND is_active")
            .bind(&map)
            .fetch_one(&state.pool)
            .await
            .expect("el snapshot debe seguir existiendo");

    cleanup(&state, &[admin_id]).await;

    assert!(
        attempted_update.is_err(),
        "el trigger debe bloquear la actualización"
    );
    assert!(
        attempted_delete.is_err(),
        "el trigger debe bloquear el borrado"
    );
    assert_eq!(document.0["id"], map);
}
