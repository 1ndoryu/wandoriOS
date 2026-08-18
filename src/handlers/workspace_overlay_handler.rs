use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use utoipa::ToSchema;

use crate::errors::AppError;
use crate::middleware::AuthUser;
use crate::models::workspace_overlay::{
    UpdateWorkspaceOverlayRequest, WorkspaceOverlayDocument, WorkspaceOverlayResponse,
};
use crate::services::workspace_overlay_svc::WorkspaceOverlayService;
use crate::AppState;

#[derive(Debug, serde::Serialize, ToSchema)]
pub struct WorkspaceOverlayApiResponse {
    pub overlay: WorkspaceOverlayDocument,
    pub revision: i32,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<WorkspaceOverlayResponse> for WorkspaceOverlayApiResponse {
    fn from(response: WorkspaceOverlayResponse) -> Self {
        Self {
            overlay: response.overlay,
            revision: response.revision,
            updated_at: response.updated_at,
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/workspace/overlay",
    responses(
        (status = 200, description = "Overlay personal", body = WorkspaceOverlayApiResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    )
)]
pub async fn get_overlay(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<WorkspaceOverlayApiResponse>, AppError> {
    Ok(Json(
        WorkspaceOverlayService::get(&state.pool, auth.user_id)
            .await?
            .into(),
    ))
}

#[utoipa::path(
    put,
    path = "/api/workspace/overlay",
    request_body = UpdateWorkspaceOverlayRequest,
    responses(
        (status = 200, description = "Overlay actualizado", body = WorkspaceOverlayApiResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "CSRF inválido", body = ErrorResponse),
        (status = 409, description = "Revisión en conflicto", body = ErrorResponse),
        (status = 422, description = "Overlay inválido", body = ErrorResponse)
    )
)]
pub async fn update_overlay(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(request): Json<UpdateWorkspaceOverlayRequest>,
) -> Result<Json<WorkspaceOverlayApiResponse>, AppError> {
    Ok(Json(
        WorkspaceOverlayService::update(&state.pool, auth.user_id, request)
            .await?
            .into(),
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/workspace/overlay", get(get_overlay).put(update_overlay))
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use serde_json::{json, Value};
    use sqlx::postgres::PgPoolOptions;
    use tower::util::ServiceExt;
    use uuid::Uuid;

    use crate::config::AppConfig;
    use crate::handlers::create_router;
    use crate::services::SessionService;
    use crate::AppState;

    async fn test_state() -> AppState {
        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL es obligatorio para las pruebas HTTP del overlay");
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .expect("la base de datos de pruebas debe estar disponible");
        AppState {
            pool,
            upload_dir: "target/workspace-overlay-http-test-uploads".to_string(),
            resend_api_key: None,
            email_from: "test@example.invalid".to_string(),
            stripe_secret_key: None,
            stripe_webhook_secret: None,
            game_ticket_secret: None,
            game_ticket_store: crate::services::game_ticket::GameTicketStore::default(),
            game_ws_state: crate::services::game_ws::GameWsState::default(),
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
        let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL debe existir");
        create_router(
            state.pool.clone(),
            AppConfig {
                database_url,
                host: "127.0.0.1".to_string(),
                port: 3000,
                stripe_secret_key: None,
                stripe_webhook_secret: None,
                game_ticket_secret: None,
                upload_dir: "target/workspace-overlay-http-test-uploads".to_string(),
                resend_api_key: None,
                email_from: "test@example.invalid".to_string(),
                frontend_dist: "frontend/dist".to_string(),
            },
        )
    }

    struct TestUser {
        pool: sqlx::PgPool,
        id: Option<Uuid>,
    }

    impl TestUser {
        async fn create(state: &AppState) -> Self {
            let id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO users (id, email, password_hash)
                 VALUES ($1, $2, 'test-only-password-hash')",
            )
            .bind(id)
            .bind(format!("workspace-overlay-{id}@example.invalid"))
            .execute(&state.pool)
            .await
            .expect("debe poder crear el usuario de prueba");
            Self {
                pool: state.pool.clone(),
                id: Some(id),
            }
        }

        fn id(&self) -> Uuid {
            self.id.expect("usuario de prueba activo")
        }

        async fn cleanup(&mut self) {
            let Some(id) = self.id.take() else { return };
            sqlx::query("DELETE FROM users WHERE id = $1")
                .bind(id)
                .execute(&self.pool)
                .await
                .expect("debe poder limpiar el usuario de prueba");
        }
    }

    impl Drop for TestUser {
        fn drop(&mut self) {
            let Some(id) = self.id.take() else { return };
            let pool = self.pool.clone();
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.spawn(async move {
                    let _ = sqlx::query("DELETE FROM users WHERE id = $1")
                        .bind(id)
                        .execute(&pool)
                        .await;
                });
            }
        }
    }

    async fn session(state: &AppState, user_id: Uuid) -> (String, String) {
        let result = SessionService::create(&state.pool, user_id, None, Some("overlay-test"))
            .await
            .expect("debe poder crear sesión de prueba");
        (result.raw_token, result.csrf_token)
    }

    fn overlay_document(label: &str, requires: &str) -> Value {
        json!({
            "version": 1,
            "addedItems": {
                "folder-test": {
                    "id": "folder-test",
                    "parentId": "desktop",
                    "type": "folder",
                    "label": label,
                    "requires": requires
                }
            },
            "fieldOverrides": {},
            "tombstones": []
        })
    }

    fn overlay_request(
        session_token: &str,
        csrf_token: Option<&str>,
        overlay: Value,
        expected_revision: i32,
    ) -> Request<Body> {
        let cookie = format!(
            "session_id={session_token}; csrf_token={}",
            csrf_token.unwrap_or("missing")
        );
        let mut builder = Request::builder()
            .method("PUT")
            .uri("/api/workspace/overlay")
            .header("origin", "http://localhost:5173")
            .header("content-type", "application/json")
            .header("cookie", cookie);
        if let Some(csrf) = csrf_token {
            builder = builder.header("x-csrf-token", csrf);
        }
        builder
            .body(Body::from(
                json!({
                    "overlay": overlay,
                    "expected_revision": expected_revision
                })
                .to_string(),
            ))
            .expect("request de overlay válida")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("cuerpo HTTP legible");
        serde_json::from_slice(&bytes).expect("respuesta JSON válida")
    }

    #[tokio::test]
    async fn overlay_without_session_returns_401() {
        let state = test_state().await;
        let response = production_router(&state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/workspace/overlay")
                    .body(Body::empty())
                    .expect("request válida"),
            )
            .await
            .expect("router debe responder");
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn overlay_get_returns_empty_revision_zero_for_new_user() {
        let state = test_state().await;
        let mut user = TestUser::create(&state).await;
        let (session_token, _) = session(&state, user.id()).await;
        let response = production_router(&state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/workspace/overlay")
                    .header("cookie", format!("session_id={session_token}"))
                    .body(Body::empty())
                    .expect("request autenticada válida"),
            )
            .await
            .expect("router debe responder");
        let body = json_body(response).await;
        user.cleanup().await;
        assert_eq!(body["revision"], 0);
        assert_eq!(body["overlay"]["version"], 1);
        assert_eq!(body["overlay"]["addedItems"], json!({}));
    }

    #[tokio::test]
    async fn overlay_put_with_nonzero_revision_does_not_create_ghost_row() {
        let state = test_state().await;
        let mut user = TestUser::create(&state).await;
        let (session_token, csrf_token) = session(&state, user.id()).await;
        let response = production_router(&state)
            .oneshot(overlay_request(
                &session_token,
                Some(&csrf_token),
                overlay_document("Folder", "public"),
                7,
            ))
            .await
            .expect("router debe responder");
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM user_workspace_overlays WHERE user_id = $1")
                .bind(user.id())
                .fetch_one(&state.pool)
                .await
                .expect("debe poder comprobar la fila");
        user.cleanup().await;

        assert_eq!(response.status(), StatusCode::CONFLICT);
        assert_eq!(count.0, 0);
    }

    #[tokio::test]
    async fn overlay_put_requires_csrf_and_rejects_restricted_added_nodes() {
        let state = test_state().await;
        let mut user = TestUser::create(&state).await;
        let (session_token, csrf_token) = session(&state, user.id()).await;
        let without_csrf = production_router(&state)
            .oneshot(overlay_request(
                &session_token,
                None,
                overlay_document("Folder", "public"),
                0,
            ))
            .await
            .expect("router debe responder");
        let invalid_node = production_router(&state)
            .oneshot(overlay_request(
                &session_token,
                Some(&csrf_token),
                overlay_document("Admin", "admin"),
                0,
            ))
            .await
            .expect("router debe responder");
        user.cleanup().await;
        assert_eq!(without_csrf.status(), StatusCode::FORBIDDEN);
        assert_eq!(invalid_node.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn overlay_stale_revision_returns_409_and_does_not_overwrite() {
        let state = test_state().await;
        let mut user = TestUser::create(&state).await;
        let (session_token, csrf_token) = session(&state, user.id()).await;
        let first = production_router(&state)
            .oneshot(overlay_request(
                &session_token,
                Some(&csrf_token),
                overlay_document("Primera", "public"),
                0,
            ))
            .await
            .expect("primera escritura debe responder");
        let first_body = json_body(first).await;
        let stale = production_router(&state)
            .oneshot(overlay_request(
                &session_token,
                Some(&csrf_token),
                overlay_document("Obsoleta", "public"),
                0,
            ))
            .await
            .expect("segunda escritura debe responder");
        let stale_status = stale.status();
        let stale_body = json_body(stale).await;
        let current = production_router(&state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/workspace/overlay")
                    .header("cookie", format!("session_id={session_token}"))
                    .body(Body::empty())
                    .expect("lectura válida"),
            )
            .await
            .expect("lectura debe responder");
        let current_body = json_body(current).await;
        user.cleanup().await;

        assert_eq!(first_body["revision"], 1);
        assert_eq!(stale_status, StatusCode::CONFLICT);
        assert_eq!(stale_body["error"], "conflict");
        assert_eq!(current_body["revision"], 1);
        assert_eq!(
            current_body["overlay"]["addedItems"]["folder-test"]["label"],
            "Primera"
        );
    }
}
