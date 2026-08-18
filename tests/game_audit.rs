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
        upload_dir: "target/game-audit-test-uploads".to_string(),
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
    .bind(format!("audit-{user_id}@example.invalid"))
    .bind(role)
    .execute(&app.pool)
    .await
    .expect("usuario creado");
    let session = SessionService::create(&app.pool, user_id, None, Some("game-audit-test"))
        .await
        .expect("sesión creada");
    (user_id, session.raw_token, session.csrf_token)
}

async fn cleanup(app: &AppState, user_id: Uuid, character_id: Option<&str>) {
    sqlx::query("DELETE FROM game_audit_events WHERE actor_id = $1")
        .bind(user_id)
        .execute(&app.pool)
        .await
        .expect("auditoría limpiada");
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

fn admin_create_request(session: &str, csrf: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/admin/game/characters")
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::from(body.to_string()))
        .expect("request válida")
}

fn admin_update_request(session: &str, csrf: &str, id: &str, body: Value) -> Request<Body> {
    Request::builder()
        .method("PUT")
        .uri(format!("/api/admin/game/characters/{id}"))
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::from(body.to_string()))
        .expect("request válida")
}

fn audit_list_request(session: Option<&str>, entity_id: Option<&str>) -> Request<Body> {
    let mut uri = "/api/admin/game/audit/characters".to_string();
    if let Some(id) = entity_id {
        uri = format!("{uri}?entityId={id}");
    }
    let mut builder = Request::builder().uri(uri);
    if let Some(session) = session {
        builder = builder.header("cookie", format!("session_id={session}"));
    }
    builder.body(Body::empty()).expect("request válida")
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body legible");
    serde_json::from_slice(&body).expect("json válido")
}

/* [297A-58] Auditoría de publicación de mapas: mismos helpers de sesión, pero
 * el publish requiere CSRF + origin y los snapshots son inmutables (el usuario
 * autor no se borra; el resto del cleanup sí). */
fn unique_map_id() -> String {
    format!("map-test-{}", Uuid::new_v4())
}

fn valid_map_document(id: &str) -> Value {
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

fn admin_map_publish_request(session: &str, csrf: &str, map_id: &str) -> Request<Body> {
    Request::builder()
        .method("POST")
        .uri("/api/admin/game/maps")
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf)
        .body(Body::from(
            json!({
                "expectedVersion": 0,
                "document": valid_map_document(map_id)
            })
            .to_string(),
        ))
        .expect("request de publicación válida")
}

fn map_audit_list_request(session: Option<&str>, entity_id: Option<&str>) -> Request<Body> {
    let mut uri = "/api/admin/game/audit/maps".to_string();
    if let Some(id) = entity_id {
        uri = format!("{uri}?entityId={id}");
    }
    let mut builder = Request::builder().uri(uri);
    if let Some(session) = session {
        builder = builder.header("cookie", format!("session_id={session}"));
    }
    builder.body(Body::empty()).expect("request válida")
}

/* Los snapshots son inmutables: el usuario que ya es autor se conserva por la
 * FK RESTRICT; los demás sí se limpian. */
async fn cleanup_map_author(app: &AppState, user_id: Uuid) {
    sqlx::query("DELETE FROM game_audit_events WHERE actor_id = $1")
        .bind(user_id)
        .execute(&app.pool)
        .await
        .expect("auditoría limpiada");
    sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(&app.pool)
        .await
        .expect("sesiones limpiadas");
    sqlx::query(
        "DELETE FROM users
         WHERE id = $1
           AND NOT EXISTS (SELECT 1 FROM game_map_versions WHERE published_by = $1)",
    )
    .bind(user_id)
    .execute(&app.pool)
    .await
    .expect("usuario limpiado si no es autor");
}

#[tokio::test]
async fn admin_character_changes_are_audited_with_visible_state() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let id = unique_character_id();

    let created = create_router_with_state(app.clone())
        .oneshot(admin_create_request(
            &admin_session,
            &admin_csrf,
            json!({ "id": id, "displayName": "Auditable", "bodyTone": "ink" }),
        ))
        .await
        .expect("creación responde");
    assert_eq!(created.status(), StatusCode::OK);

    let updated = create_router_with_state(app.clone())
        .oneshot(admin_update_request(
            &admin_session,
            &admin_csrf,
            &id,
            json!({ "displayName": "Retirado", "bodyTone": "paper", "isActive": false }),
        ))
        .await
        .expect("actualización responde");
    assert_eq!(updated.status(), StatusCode::OK);

    let list = create_router_with_state(app.clone())
        .oneshot(audit_list_request(Some(&admin_session), Some(&id)))
        .await
        .expect("auditoría responde");
    let body = json_body(list).await;

    let events = body.as_array().expect("lista de eventos");
    assert_eq!(events.len(), 2, "crear + actualizar = 2 eventos");
    let created_event = events
        .iter()
        .find(|event| event["action"] == "character.created")
        .expect("evento de creación");
    let updated_event = events
        .iter()
        .find(|event| event["action"] == "character.updated")
        .expect("evento de actualización");

    for event in events {
        assert_eq!(event["actorKind"], "admin");
        assert_eq!(event["entityKind"], "character");
        assert_eq!(event["entityId"], id);
    }
    assert_eq!(created_event["payload"]["displayName"], "Auditable");
    assert_eq!(created_event["payload"]["isActive"], true);
    assert_eq!(updated_event["payload"]["displayName"], "Retirado");
    assert_eq!(updated_event["payload"]["isActive"], false);

    cleanup(&app, admin_id, Some(&id)).await;
}

#[tokio::test]
async fn audit_list_requires_admin_role() {
    let app = state().await;
    let (admin_id, _admin_session, _admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, _user_csrf) = create_user(&app, "user").await;

    let without_session = create_router_with_state(app.clone())
        .oneshot(audit_list_request(None, None))
        .await
        .expect("auditoría responde");
    let non_admin = create_router_with_state(app.clone())
        .oneshot(audit_list_request(Some(&user_session), None))
        .await
        .expect("auditoría responde");

    cleanup(&app, admin_id, None).await;
    cleanup(&app, user_id, None).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn audit_list_filters_by_entity_and_bounds_the_limit() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let first_id = unique_character_id();
    let second_id = unique_character_id();

    for id in [&first_id, &second_id] {
        create_router_with_state(app.clone())
            .oneshot(admin_create_request(
                &admin_session,
                &admin_csrf,
                json!({ "id": id, "displayName": "Personaje", "bodyTone": "ink" }),
            ))
            .await
            .expect("creación responde");
    }

    let filtered = create_router_with_state(app.clone())
        .oneshot(audit_list_request(Some(&admin_session), Some(&first_id)))
        .await
        .expect("auditoría responde");
    let filtered_body = json_body(filtered).await;
    let filtered_events = filtered_body.as_array().expect("lista de eventos");
    assert_eq!(filtered_events.len(), 1);
    assert_eq!(filtered_events[0]["entityId"], first_id);

    let bounded = create_router_with_state(app.clone())
        .oneshot(audit_list_request(Some(&admin_session), None))
        .await
        .expect("auditoría responde");
    let bounded_body = json_body(bounded).await;
    let bounded_events = bounded_body.as_array().expect("lista de eventos");
    assert!(bounded_events.len() >= 2, "todos los eventos sin filtro");

    cleanup(&app, admin_id, Some(&first_id)).await;
    sqlx::query("DELETE FROM game_character_definitions WHERE id = $1")
        .bind(&second_id)
        .execute(&app.pool)
        .await
        .expect("personaje limpiado");
}

#[tokio::test]
async fn map_publication_is_audited_with_metadata_only() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let map = unique_map_id();

    let published = create_router_with_state(app.clone())
        .oneshot(admin_map_publish_request(&admin_session, &admin_csrf, &map))
        .await
        .expect("publicación responde");
    assert_eq!(published.status(), StatusCode::OK);

    let list = create_router_with_state(app.clone())
        .oneshot(map_audit_list_request(Some(&admin_session), Some(&map)))
        .await
        .expect("auditoría responde");
    let body = json_body(list).await;
    let events = body.as_array().expect("lista de eventos");
    assert_eq!(events.len(), 1, "una publicación = un evento");
    let event = &events[0];
    assert_eq!(event["action"], "map.published");
    assert_eq!(event["actorKind"], "admin");
    assert_eq!(event["entityKind"], "map");
    assert_eq!(event["entityId"], map);
    assert_eq!(event["payload"]["version"], 1);
    assert!(event["payload"].get("schemaVersion").is_some());
    assert!(event["payload"].get("contentHash").is_some());
    assert!(
        event["payload"].get("document").is_none(),
        "el evento nunca lleva el documento del mapa"
    );
    assert!(
        event["payload"].get("instances").is_none(),
        "el evento no expone coordenadas ni instancias"
    );

    cleanup_map_author(&app, admin_id).await;
}

#[tokio::test]
async fn map_audit_requires_admin_and_does_not_leak_actor_id() {
    let app = state().await;
    let (admin_id, _admin_session, _admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, _user_csrf) = create_user(&app, "user").await;

    let without_session = create_router_with_state(app.clone())
        .oneshot(map_audit_list_request(None, None))
        .await
        .expect("auditoría responde");
    let non_admin = create_router_with_state(app.clone())
        .oneshot(map_audit_list_request(Some(&user_session), None))
        .await
        .expect("auditoría responde");

    cleanup_map_author(&app, admin_id).await;
    cleanup_map_author(&app, user_id).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn map_audit_filters_by_map_id() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let first_map = unique_map_id();
    let second_map = unique_map_id();

    for map in [&first_map, &second_map] {
        create_router_with_state(app.clone())
            .oneshot(admin_map_publish_request(&admin_session, &admin_csrf, map))
            .await
            .expect("publicación responde");
    }

    let filtered = create_router_with_state(app.clone())
        .oneshot(map_audit_list_request(
            Some(&admin_session),
            Some(&first_map),
        ))
        .await
        .expect("auditoría responde");
    let body = json_body(filtered).await;
    let events = body.as_array().expect("lista de eventos");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0]["entityId"], first_map);

    cleanup_map_author(&app, admin_id).await;
}
