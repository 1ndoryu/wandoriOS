//! Tests de integración de versiones de assets del Bosque (Assets 3D).
//! [297A-72] Verifican: importación de GLB por hash con header binario válido,
//! rechazo de GLB inválido/oversized, numeración de versiones, deduplicación,
//! metadata allowlisted, activación única, contrato público y inmutabilidad.
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
use glory_backend::models::game_asset::GAME_ASSET_GLB_MAX_BYTES;
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
        upload_dir: "target/game-asset-version-test-uploads".to_string(),
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
    .bind(format!("asset-version-{user_id}@example.invalid"))
    .bind(role)
    .execute(&app.pool)
    .await
    .expect("usuario creado");
    let session = SessionService::create(&app.pool, user_id, None, Some("asset-version-test"))
        .await
        .expect("sesión creada");
    (user_id, session.raw_token, session.csrf_token)
}

async fn create_asset(app: &AppState) -> String {
    let id = unique_asset_id();
    sqlx::query("INSERT INTO game_assets (id, display_name, category) VALUES ($1, 'Seto', 'tree')")
        .bind(&id)
        .execute(&app.pool)
        .await
        .expect("asset creado");
    id
}

/* [297A-72] La inmutabilidad se prueba en paralelo con otros tests cuyos
 * cleanups deshabilitan el trigger (ALTER TABLE). Un mutex de módulo
 * serializa todos los bloques que tocan el trigger: un UPDATE de prueba
 * nunca corre mientras otro test deshabilita el trigger. */
static TRIGGER_MUTEX: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

async fn cleanup(app: &AppState, user_id: Uuid, asset_id: &str) {
    let _guard = TRIGGER_MUTEX.lock().await;
    sqlx::query("DELETE FROM game_audit_events WHERE entity_kind = 'asset' AND entity_id = $1")
        .bind(asset_id)
        .execute(&app.pool)
        .await
        .expect("auditoría limpiada");
    /* Las versiones son inmutables por trigger; se deshabilita el trigger
     * solo para las filas de prueba y se vuelve a habilitar de inmediato. */
    sqlx::query("ALTER TABLE game_asset_versions DISABLE TRIGGER protect_game_asset_version_snapshot_trigger")
        .execute(&app.pool)
        .await
        .expect("trigger deshabilitado");
    sqlx::query("DELETE FROM game_asset_versions WHERE asset_id = $1")
        .bind(asset_id)
        .execute(&app.pool)
        .await
        .expect("versiones limpiadas");
    sqlx::query("ALTER TABLE game_asset_versions ENABLE TRIGGER protect_game_asset_version_snapshot_trigger")
        .execute(&app.pool)
        .await
        .expect("trigger habilitado");
    sqlx::query("DELETE FROM game_assets WHERE id = $1")
        .bind(asset_id)
        .execute(&app.pool)
        .await
        .expect("asset limpiado");
    drop(_guard);
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
    format!("tav{}", &hex[..20])
}

/// GLB mínimo válido: header de 12 bytes (magic glTF, versión 2, longitud 12).
fn valid_glb() -> Vec<u8> {
    let mut bytes = Vec::new();
    bytes.extend_from_slice(&[0x67, 0x6C, 0x54, 0x46]); // "glTF"
    bytes.extend_from_slice(&2u32.to_le_bytes());
    bytes.extend_from_slice(&12u32.to_le_bytes());
    bytes
}

fn multipart_request(
    session: &str,
    csrf_cookie: &str,
    csrf_header: Option<&str>,
    asset_id: &str,
    file: &[u8],
) -> Request<Body> {
    let boundary = "----glory-test-boundary-297a72";
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        format!("Content-Disposition: form-data; name=\"file\"; filename=\"tree.glb\"\r\n")
            .as_bytes(),
    );
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(file);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());

    let mut builder = Request::builder()
        .method("POST")
        .uri(format!("/api/admin/game/assets/{asset_id}/versions"))
        .header("origin", "http://localhost:5173")
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .header(
            "cookie",
            format!("session_id={session}; csrf_token={csrf_cookie}"),
        );
    if let Some(token) = csrf_header {
        builder = builder.header("x-csrf-token", token);
    }
    builder
        .body(Body::from(body))
        .expect("request multipart válida")
}

fn json_request(
    method: &str,
    session: &str,
    csrf: &str,
    uri: String,
    body: Option<Value>,
) -> Request<Body> {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("origin", "http://localhost:5173")
        .header("content-type", "application/json")
        .header("cookie", format!("session_id={session}; csrf_token={csrf}"))
        .header("x-csrf-token", csrf);
    match body {
        Some(value) => builder
            .body(Body::from(value.to_string()))
            .expect("request JSON válida"),
        None => builder.body(Body::empty()).expect("request vacía válida"),
    }
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body legible");
    serde_json::from_slice(&body).expect("json válido")
}

#[tokio::test]
async fn import_requires_admin_and_valid_csrf() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, user_csrf) = create_user(&app, "user").await;
    let asset_id = create_asset(&app).await;

    let without_session = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .method("POST")
                .uri(format!("/api/admin/game/assets/{asset_id}/versions"))
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    let non_admin = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &user_session,
            &user_csrf,
            Some(&user_csrf),
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");
    let wrong_csrf = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some("wrong-csrf"),
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");
    let missing_csrf_header = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            None,
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");

    cleanup(&app, admin_id, &asset_id).await;
    cleanup(&app, user_id, &asset_id).await;
    assert_eq!(without_session.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);
    assert_eq!(wrong_csrf.status(), StatusCode::FORBIDDEN);
    assert_eq!(missing_csrf_header.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn import_stores_by_hash_and_numbers_versions() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = create_asset(&app).await;
    let glb = valid_glb();

    let first = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &glb,
        ))
        .await
        .expect("router responde");
    let first_status = first.status();
    let first_body = json_body(first).await;
    if first_status != StatusCode::OK {
        eprintln!("IMPORT ERROR BODY: {first_body}");
    }
    assert_eq!(first_status, StatusCode::OK);
    assert_eq!(first_body["version"], json!(1));
    assert_eq!(first_body["assetId"], json!(asset_id));
    assert_eq!(first_body["kind"], json!("glb"));
    assert_eq!(first_body["isActive"], json!(false));
    assert!(!first_body["contentHash"].as_str().unwrap().is_empty());
    assert!(
        first_body.get("storagePath").is_none(),
        "el DTO admin no expone rutas de storage"
    );

    let second = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &glb,
        ))
        .await
        .expect("router responde");
    assert_eq!(second.status(), StatusCode::OK);
    let second_body = json_body(second).await;
    assert_eq!(second_body["version"], json!(2));
    assert_eq!(
        second_body["contentHash"], first_body["contentHash"],
        "mismo GLB → mismo hash (content-addressed)"
    );

    let list = create_router_with_state(app.clone())
        .oneshot(json_request(
            "GET",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions"),
            None,
        ))
        .await
        .expect("router responde");
    assert_eq!(list.status(), StatusCode::OK);
    let items = json_body(list).await;
    let versions: Vec<i32> = items
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["version"].as_i64())
        .map(|value| value as i32)
        .collect();
    assert_eq!(versions, vec![2, 1]);

    cleanup(&app, admin_id, &asset_id).await;
}

#[tokio::test]
async fn import_rejects_invalid_glb_oversized_and_missing_file() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = create_asset(&app).await;

    let not_glb = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            b"not-a-glb",
        ))
        .await
        .expect("router responde");
    let bad_version = {
        let mut bytes = valid_glb();
        bytes[4] = 3;
        create_router_with_state(app.clone())
            .oneshot(multipart_request(
                &admin_session,
                &admin_csrf,
                Some(&admin_csrf),
                &asset_id,
                &bytes,
            ))
            .await
            .expect("router responde")
    };
    let oversized = {
        let mut bytes = valid_glb();
        bytes.extend(std::iter::repeat(0u8).take(GAME_ASSET_GLB_MAX_BYTES + 1));
        create_router_with_state(app.clone())
            .oneshot(multipart_request(
                &admin_session,
                &admin_csrf,
                Some(&admin_csrf),
                &asset_id,
                &bytes,
            ))
            .await
            .expect("router responde")
    };
    let missing_asset = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            "no-existe",
            &valid_glb(),
        ))
        .await
        .expect("router responde");

    cleanup(&app, admin_id, &asset_id).await;
    assert_eq!(not_glb.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(bad_version.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(oversized.status(), StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(missing_asset.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn metadata_update_and_activation_flow() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = create_asset(&app).await;

    let imported = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");
    assert_eq!(imported.status(), StatusCode::OK);

    /* Metadata allowlisted antes de activar. */
    let metadata = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/1"),
            Some(json!({
                "proxy": { "kind": "circle", "radius": 0.5 },
                "scale": 1.5
            })),
        ))
        .await
        .expect("router responde");
    assert_eq!(metadata.status(), StatusCode::OK);
    let metadata_body = json_body(metadata).await;
    assert_eq!(metadata_body["proxy"]["kind"], json!("circle"));
    assert_eq!(metadata_body["scale"], json!(1.5));

    let bad_metadata = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/1"),
            Some(json!({
                "proxy": { "kind": "casa" },
                "scale": 1.0
            })),
        ))
        .await
        .expect("router responde");
    assert_eq!(bad_metadata.status(), StatusCode::UNPROCESSABLE_ENTITY);

    /* Activar: queda activa y la edición posterior es inmutable (409). */
    let activated = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/1/activate"),
            None,
        ))
        .await
        .expect("router responde");
    assert_eq!(activated.status(), StatusCode::OK);
    let activated_body = json_body(activated).await;
    assert_eq!(activated_body["isActive"], json!(true));

    let immutable_edit = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/1"),
            Some(json!({ "proxy": null, "scale": 2.0 })),
        ))
        .await
        .expect("router responde");
    assert_eq!(immutable_edit.status(), StatusCode::CONFLICT);

    cleanup(&app, admin_id, &asset_id).await;
}

#[tokio::test]
async fn active_version_is_public_and_only_one_is_active() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = create_asset(&app).await;

    let before_active = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/game/assets/{asset_id}/active"))
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    assert_eq!(before_active.status(), StatusCode::NOT_FOUND);

    let first = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");
    assert_eq!(first.status(), StatusCode::OK);
    let second = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");
    assert_eq!(second.status(), StatusCode::OK);

    let activate_v1 = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/1/activate"),
            None,
        ))
        .await
        .expect("router responde");
    assert_eq!(activate_v1.status(), StatusCode::OK);
    let activate_v2 = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/2/activate"),
            None,
        ))
        .await
        .expect("router responde");
    assert_eq!(activate_v2.status(), StatusCode::OK);

    let public = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(format!("/api/game/assets/{asset_id}/active"))
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    assert_eq!(public.status(), StatusCode::OK);
    let public_body = json_body(public).await;
    assert_eq!(public_body["version"], json!(2));
    assert_eq!(public_body["versionId"], json!(format!("{asset_id}-v2")));
    assert_eq!(public_body["category"], json!("tree"));
    assert!(public_body.get("storagePath").is_none());
    assert!(public_body.get("isActive").is_none());
    assert!(public_body.get("byteSize").is_none());

    let active_count: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM game_asset_versions WHERE asset_id = $1 AND is_active",
    )
    .bind(&asset_id)
    .fetch_one(&app.pool)
    .await
    .expect("cuenta activas");
    assert_eq!(active_count.0, 1);

    cleanup(&app, admin_id, &asset_id).await;
}

#[tokio::test]
async fn version_file_serves_glb_bytes_only_to_admin() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let (user_id, user_session, user_csrf) = create_user(&app, "user").await;
    let asset_id = create_asset(&app).await;
    let glb = valid_glb();

    let imported = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &glb,
        ))
        .await
        .expect("router responde");
    assert_eq!(imported.status(), StatusCode::OK);

    let uri = format!("/api/admin/game/assets/{asset_id}/versions/1/file");
    let public_file = create_router_with_state(app.clone())
        .oneshot(
            Request::builder()
                .method("GET")
                .uri(&uri)
                .body(Body::empty())
                .expect("request válida"),
        )
        .await
        .expect("router responde");
    assert_eq!(public_file.status(), StatusCode::UNAUTHORIZED);

    let non_admin = create_router_with_state(app.clone())
        .oneshot(json_request(
            "GET",
            &user_session,
            &user_csrf,
            uri.clone(),
            None,
        ))
        .await
        .expect("router responde");
    assert_eq!(non_admin.status(), StatusCode::FORBIDDEN);

    let admin_file = create_router_with_state(app.clone())
        .oneshot(json_request("GET", &admin_session, &admin_csrf, uri, None))
        .await
        .expect("router responde");
    assert_eq!(admin_file.status(), StatusCode::OK);
    let content_type = admin_file
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = to_bytes(admin_file.into_body(), usize::MAX)
        .await
        .expect("body legible");

    cleanup(&app, admin_id, &asset_id).await;
    cleanup(&app, user_id, &asset_id).await;
    assert_eq!(content_type, "model/gltf-binary");
    assert_eq!(bytes.to_vec(), glb, "el GLB servido debe ser el importado");
}

#[tokio::test]
async fn published_version_cannot_be_mutated_by_database_update() {
    let app = state().await;
    let (admin_id, admin_session, admin_csrf) = create_user(&app, "admin").await;
    let asset_id = create_asset(&app).await;

    let imported = create_router_with_state(app.clone())
        .oneshot(multipart_request(
            &admin_session,
            &admin_csrf,
            Some(&admin_csrf),
            &asset_id,
            &valid_glb(),
        ))
        .await
        .expect("router responde");
    assert_eq!(imported.status(), StatusCode::OK);
    let activated = create_router_with_state(app.clone())
        .oneshot(json_request(
            "PUT",
            &admin_session,
            &admin_csrf,
            format!("/api/admin/game/assets/{asset_id}/versions/1/activate"),
            None,
        ))
        .await
        .expect("router responde");
    assert_eq!(activated.status(), StatusCode::OK);

    /* [297A-72] Los intentos directos en BD corren bajo el mismo mutex que los
     * cleanups usan para deshabilitar el trigger: nunca se solapan. */
    let _guard = TRIGGER_MUTEX.lock().await;
    let update_result =
        sqlx::query("UPDATE game_asset_versions SET content_hash = 'tampered' WHERE asset_id = $1")
            .bind(&asset_id)
            .execute(&app.pool)
            .await;
    let delete_result = sqlx::query("DELETE FROM game_asset_versions WHERE asset_id = $1")
        .bind(&asset_id)
        .execute(&app.pool)
        .await;
    drop(_guard);
    let hash: (String,) =
        sqlx::query_as("SELECT content_hash FROM game_asset_versions WHERE asset_id = $1")
            .bind(&asset_id)
            .fetch_one(&app.pool)
            .await
            .expect("la versión debe seguir existiendo");

    cleanup(&app, admin_id, &asset_id).await;
    assert!(
        update_result.is_err(),
        "el trigger debe bloquear la actualización"
    );
    assert!(
        delete_result.is_err(),
        "el trigger debe bloquear el borrado"
    );
    assert_ne!(hash.0, "tampered");
}
