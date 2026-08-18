use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use utoipa::ToSchema;

use crate::errors::AppError;
use crate::middleware::AuthUser;
use crate::models::preferences::{UpdateUserPreferencesRequest, UserPreferences};
use crate::services::preferences_svc::PreferencesService;
use crate::AppState;

#[derive(Debug, serde::Serialize, ToSchema)]
pub struct UserPreferencesResponse {
    pub theme: String,
    /// Fondo de pantalla efectivo (default del admin si el usuario no lo fijó).
    pub wallpaper: Option<String>,
    /// Fuente efectiva (`system`, `pixel`, `mono`, `sans`).
    pub font: Option<String>,
    /// Escala efectiva (factor, 0.5–2.0).
    pub scale: Option<f64>,
    pub revision: i32,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

impl From<UserPreferences> for UserPreferencesResponse {
    fn from(preferences: UserPreferences) -> Self {
        Self {
            theme: preferences.theme,
            wallpaper: preferences.wallpaper,
            font: preferences.font,
            scale: preferences.scale,
            revision: preferences.revision,
            updated_at: preferences.updated_at,
        }
    }
}

/// Obtener preferencias privadas de la cuenta autenticada.
#[utoipa::path(
    get,
    path = "/api/me/preferences",
    responses(
        (status = 200, description = "Preferencias de la cuenta", body = UserPreferencesResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_preferences(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<UserPreferencesResponse>, AppError> {
    Ok(Json(
        PreferencesService::get(&state.pool, auth.user_id)
            .await?
            .into(),
    ))
}

/// Actualizar preferencias con control optimista de revisión.
#[utoipa::path(
    put,
    path = "/api/me/preferences",
    request_body = UpdateUserPreferencesRequest,
    responses(
        (status = 200, description = "Preferencias actualizadas", body = UserPreferencesResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 409, description = "Revisión en conflicto", body = ErrorResponse),
        (status = 422, description = "Preferencia inválida", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_preferences(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(request): Json<UpdateUserPreferencesRequest>,
) -> Result<Json<UserPreferencesResponse>, AppError> {
    Ok(Json(
        PreferencesService::update(&state.pool, auth.user_id, request)
            .await?
            .into(),
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/me/preferences",
        get(get_preferences).put(update_preferences),
    )
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use axum::body::{to_bytes, Body};
    use axum::http::{Request, StatusCode};
    use serde_json::json;
    use sqlx::postgres::PgPoolOptions;
    use tower::util::ServiceExt;
    use uuid::Uuid;

    use crate::config::AppConfig;
    use crate::handlers::create_router;
    use crate::services::SessionService;
    use crate::AppState;

    async fn test_state() -> AppState {
        let database_url = std::env::var("DATABASE_URL")
            .expect("DATABASE_URL es obligatorio para las pruebas HTTP de preferencias");
        let pool = PgPoolOptions::new()
            .max_connections(8)
            .connect(&database_url)
            .await
            .expect("la base de datos de pruebas debe estar disponible");

        AppState {
            pool,
            upload_dir: "target/preferences-http-test-uploads".to_string(),
            resend_api_key: None,
            email_from: "test@example.invalid".to_string(),
            stripe_secret_key: None,
            stripe_webhook_secret: None,
            site_url: "http://localhost:3000".to_string(),
            login_rate_limit: Arc::new(Mutex::new(
                HashMap::<String, (u8, std::time::Instant)>::new(),
            )),
            auth_action_rate_limit: Arc::new(Mutex::new(
                HashMap::<String, (u8, std::time::Instant)>::new(),
            )),
            dev_mailbox: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn test_config(database_url: String) -> AppConfig {
        AppConfig {
            database_url,
            host: "127.0.0.1".to_string(),
            port: 3000,
            stripe_secret_key: None,
            stripe_webhook_secret: None,
            upload_dir: "target/preferences-http-test-uploads".to_string(),
            resend_api_key: None,
            email_from: "test@example.invalid".to_string(),
            frontend_dist: "frontend/dist".to_string(),
        }
    }

    fn production_router(state: &AppState) -> axum::Router {
        create_router(
            state.pool.clone(),
            test_config(std::env::var("DATABASE_URL").expect("DATABASE_URL debe existir")),
        )
    }

    struct TestUser {
        pool: sqlx::PgPool,
        id: Option<Uuid>,
    }

    impl TestUser {
        async fn create(state: &AppState) -> Self {
            let user_id = Uuid::new_v4();
            sqlx::query(
                "INSERT INTO users (id, email, password_hash)
                 VALUES ($1, $2, 'test-only-password-hash')",
            )
            .bind(user_id)
            .bind(format!("preferences-{user_id}@example.invalid"))
            .execute(&state.pool)
            .await
            .expect("debe poder crear el usuario de prueba");
            Self {
                pool: state.pool.clone(),
                id: Some(user_id),
            }
        }

        fn id(&self) -> Uuid {
            self.id.expect("el usuario de prueba sigue activo")
        }

        async fn cleanup(&mut self) {
            let Some(user_id) = self.id.take() else {
                return;
            };
            sqlx::query("DELETE FROM users WHERE id = $1")
                .bind(user_id)
                .execute(&self.pool)
                .await
                .expect("debe poder limpiar el usuario de prueba");
        }
    }

    impl Drop for TestUser {
        fn drop(&mut self) {
            let Some(user_id) = self.id.take() else {
                return;
            };
            let pool = self.pool.clone();
            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.spawn(async move {
                    let _ = sqlx::query("DELETE FROM users WHERE id = $1")
                        .bind(user_id)
                        .execute(&pool)
                        .await;
                });
            }
        }
    }

    async fn session_cookies(state: &AppState, user_id: Uuid) -> (String, String) {
        let session =
            SessionService::create(&state.pool, user_id, None, Some("preferences-http-test"))
                .await
                .expect("debe poder crear una sesión de prueba");
        (session.raw_token, session.csrf_token)
    }

    fn update_request(
        session_token: &str,
        csrf_token: Option<&str>,
        theme: &str,
        revision: i32,
    ) -> Request<Body> {
        let cookie = format!(
            "session_id={session_token}; csrf_token={}",
            csrf_token.unwrap_or("missing")
        );
        let mut builder = Request::builder()
            .method("PUT")
            .uri("/api/me/preferences")
            .header("origin", "http://localhost:5173")
            .header("content-type", "application/json")
            .header("cookie", cookie);
        if let Some(csrf) = csrf_token {
            builder = builder.header("x-csrf-token", csrf);
        }
        builder
            .body(Body::from(
                json!({
                    "theme": theme,
                    "expected_revision": revision,
                })
                .to_string(),
            ))
            .expect("request de preferencias válida")
    }

    #[tokio::test]
    async fn preferences_without_session_returns_401_through_production_router() {
        let state = test_state().await;
        let response = production_router(&state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me/preferences")
                    .body(Body::empty())
                    .expect("request sin sesión válida"),
            )
            .await
            .expect("router debe responder");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn preferences_bearer_token_is_not_accepted() {
        /* [018A-18] La sesión opaca es la única autoridad; un Bearer legacy
         * nunca debe recuperar identidad ni saltarse CSRF/cookie. */
        let state = test_state().await;
        let response = production_router(&state)
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri("/api/me/preferences")
                    .header("authorization", "Bearer legacy-token")
                    .body(Body::empty())
                    .expect("request Bearer legacy válida"),
            )
            .await
            .expect("router debe responder");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
    }

    #[tokio::test]
    async fn preferences_mutation_without_valid_csrf_returns_403_through_production_router() {
        let state = test_state().await;
        let mut user = TestUser::create(&state).await;
        let (session_token, _csrf_token) = session_cookies(&state, user.id()).await;

        let response = production_router(&state)
            .oneshot(update_request(&session_token, None, "oscuro", 0))
            .await
            .expect("router debe responder");
        let status = response.status();

        user.cleanup().await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn preferences_preflight_allows_configured_origin_and_credentials() {
        let state = test_state().await;
        let response = production_router(&state)
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/api/me/preferences")
                    .header("origin", "http://localhost:5173")
                    .header("access-control-request-method", "PUT")
                    .header(
                        "access-control-request-headers",
                        "content-type,x-csrf-token",
                    )
                    .body(Body::empty())
                    .expect("preflight CORS válida"),
            )
            .await
            .expect("router debe responder");

        assert!(response.status().is_success());
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-origin")
                .and_then(|value| value.to_str().ok()),
            Some("http://localhost:5173")
        );
        assert_eq!(
            response
                .headers()
                .get("access-control-allow-credentials")
                .and_then(|value| value.to_str().ok()),
            Some("true")
        );
    }

    #[tokio::test]
    async fn concurrent_updates_with_same_revision_have_one_success_and_one_conflict() {
        let state = test_state().await;
        let mut user = TestUser::create(&state).await;
        let user_id = user.id();
        let (session_token, csrf_token) = session_cookies(&state, user_id).await;
        let router = production_router(&state);

        let first = router.clone().oneshot(update_request(
            &session_token,
            Some(&csrf_token),
            "claro",
            0,
        ));
        let second = router.oneshot(update_request(
            &session_token,
            Some(&csrf_token),
            "oscuro",
            0,
        ));
        let (first_response, second_response) = tokio::join!(first, second);
        let first_response = first_response.expect("primera request debe responder");
        let second_response = second_response.expect("segunda request debe responder");
        let statuses = [first_response.status(), second_response.status()];
        let first_body = to_bytes(first_response.into_body(), usize::MAX)
            .await
            .expect("cuerpo de la primera respuesta legible");
        let second_body = to_bytes(second_response.into_body(), usize::MAX)
            .await
            .expect("cuerpo de la segunda respuesta legible");
        let conflict_body = if statuses[0] == StatusCode::CONFLICT {
            &first_body
        } else {
            &second_body
        };
        let success_body = if statuses[0] == StatusCode::OK {
            &first_body
        } else {
            &second_body
        };

        let final_preferences: (i32,) =
            sqlx::query_as("SELECT revision FROM user_preferences WHERE user_id = $1")
                .bind(user_id)
                .fetch_one(&state.pool)
                .await
                .expect("la escritura ganadora debe crear preferencias");
        let conflict_json: serde_json::Value =
            serde_json::from_slice(conflict_body).expect("respuesta 409 debe ser JSON");
        let success_json: serde_json::Value =
            serde_json::from_slice(success_body).expect("respuesta 200 debe ser JSON");
        user.cleanup().await;
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
            1,
        );
        assert_eq!(final_preferences.0, 1);
        assert_eq!(success_json["revision"], 1);
        assert!(success_json["theme"] == "claro" || success_json["theme"] == "oscuro");
        assert_eq!(conflict_json["error"], "conflict");
    }
}
