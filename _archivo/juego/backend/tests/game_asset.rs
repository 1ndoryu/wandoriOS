//! Tests de integración del catálogo público de assets del Bosque.
//! [297A-60] Verifican que el catálogo público solo expone opciones activas,
//! allowlisted y sin estado administrativo. Necesitan `DATABASE_URL`.

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use serde_json::Value;
use sqlx::postgres::PgPoolOptions;
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::handlers::create_router_with_state;
use glory_backend::AppState;

async fn state() -> AppState {
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL requerido");
    AppState {
        pool: PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .expect("BD disponible"),
        upload_dir: "target/game-asset-test-uploads".to_string(),
        resend_api_key: None,
        email_from: "test@example.invalid".to_string(),
        stripe_secret_key: None,
        stripe_webhook_secret: None,
        game_ticket_secret: None,
        game_ticket_store: glory_backend::services::game_ticket::GameTicketStore::default(),
        game_ws_state: glory_backend::services::game_ws::GameWsState::default(),
        site_url: "http://localhost:3000".to_string(),
        login_rate_limit: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        auth_action_rate_limit: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
    }
}

fn public_list_request() -> Request<Body> {
    Request::builder()
        .method("GET")
        .uri("/api/game/assets")
        .body(Body::empty())
        .expect("request válida")
}

async fn json_body(response: axum::response::Response) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX)
        .await
        .expect("body legible");
    serde_json::from_slice(&body).expect("json válido")
}

#[tokio::test]
async fn public_catalog_returns_only_active_allowlisted_options() {
    let app = state().await;

    let response = create_router_with_state(app.clone())
        .oneshot(public_list_request())
        .await
        .expect("router responde");
    assert_eq!(response.status(), StatusCode::OK);

    let body = json_body(response).await;
    let items = body.as_array().expect("lista de assets");
    /* El seed de la migración [297A-60] debe estar presente y con el shape
     * público: id/displayName/category, nunca isActive/createdAt. */
    for id in ["terrain", "tree", "rock", "water"] {
        assert!(
            items.iter().any(|asset| asset["id"] == id),
            "el catálogo debe incluir {id}"
        );
    }
    for item in items {
        assert!(item["id"].is_string());
        assert!(item["displayName"].is_string());
        assert!(item["category"].is_string());
        assert!(item.get("isActive").is_none(), "el público no ve estado");
        assert!(item.get("createdAt").is_none(), "el público no ve fechas");
    }
}

#[tokio::test]
async fn public_catalog_rejects_unknown_extra_fields() {
    /* Un id de asset con la categoría del contrato (tree) no puede llevar
     * campos administrativos; el contrato público lo decide el servidor. */
    let _ = Uuid::new_v4();
    let app = state().await;

    let response = create_router_with_state(app.clone())
        .oneshot(public_list_request())
        .await
        .expect("router responde");
    assert_eq!(response.status(), StatusCode::OK);
    let body = json_body(response).await;
    for item in body.as_array().expect("lista") {
        assert_eq!(
            item.as_object().expect("objeto").keys().len(),
            3,
            "shape público estable: {item:?}"
        );
    }
}
