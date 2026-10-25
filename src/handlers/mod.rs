#![allow(clippy::needless_for_each)] // Generado por utoipa OpenApi derive

pub mod articles;
pub mod auth;
pub mod auth_totp;
pub mod dev_mail;
pub mod download_handler;
mod health;
pub mod media_handler;
mod notes;
pub mod notifications;
pub mod orders_handler;
pub mod preferences_handler;
pub mod products_handler;
pub mod projects_handler;
pub mod seo;
pub mod settings_handler;
pub mod stripe_webhook;
pub mod workspace_handler;
pub mod workspace_overlay_handler;

use std::path::PathBuf;

use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::routing::any;
use axum::Router;
use tower::ServiceBuilder;
use tower_http::cors::{AllowOrigin, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};
use tower_http::trace::TraceLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::AppState;

/// Define el esquema de seguridad de la sesión opaca para Swagger UI.
struct SecurityAddon;

impl utoipa::Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        /* components existe porque el derive ya registra schemas */
        if let Some(components) = openapi.components.as_mut() {
            /* [018A-19] La cookie HttpOnly es la autoridad única; documentarla
             * como ApiKey de cookie evita que Swagger y los clientes generados
             * vuelvan a ofrecer un Bearer JWT retirado. CSRF se envía como
             * header en mutaciones y no se modela como autorización separada. */
            components.add_security_scheme(
                "session_cookie",
                utoipa::openapi::security::SecurityScheme::ApiKey(
                    utoipa::openapi::security::ApiKey::Cookie(
                        utoipa::openapi::security::ApiKeyValue::new("session_id"),
                    ),
                ),
            );
        }
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        health::health_check,
        auth::register,
        auth::login,
        auth::verify_email,
        auth::request_password_reset,
        auth::reset_password,
        auth::me,
        auth::logout,
        auth::list_sessions,
        auth::revoke_session,
        auth_totp::totp_status,
        auth_totp::totp_setup,
        auth_totp::totp_confirm,
        auth_totp::totp_disable,
        auth_totp::mfa_verify,
        dev_mail::list_dev_mail,
        preferences_handler::get_preferences,
        preferences_handler::update_preferences,
        workspace_overlay_handler::get_overlay,
        workspace_overlay_handler::update_overlay,
        articles::create_article,
        articles::get_article,
        articles::get_article_by_slug,
        articles::list_articles,
        articles::list_articles_admin,
        articles::update_article,
        articles::delete_article,
        articles::get_article_by_alias,
        articles::set_article_alias,
        projects_handler::create_project,
        projects_handler::list_projects,
        projects_handler::list_all_projects,
        projects_handler::get_project,
        projects_handler::update_project,
        projects_handler::delete_project,
        products_handler::create_product,
        products_handler::get_product,
        products_handler::list_all_products,
        products_handler::list_products_by_article,
        products_handler::list_public_products,
        products_handler::update_product,
        products_handler::delete_product,
        products_handler::checkout,
        notifications::list_public,
        notifications::list_mine,
        notifications::mark_read,
        notifications::list_admin,
        notifications::create_admin,
        notifications::update_status_admin,
        notifications::delete_notification,
        settings_handler::get_settings,
        settings_handler::update_settings,
        settings_handler::track_events,
        settings_handler::purge_analytics,
        settings_handler::get_analytics_stats,
        workspace_handler::get_active_release,
        workspace_handler::get_release_by_version,
        workspace_handler::list_releases,
        workspace_handler::publish_release,
        workspace_handler::get_workspace_control,
        workspace_handler::validate_release,
        workspace_handler::activate_release,
        media_handler::upload_media,
        media_handler::list_media,
        media_handler::list_admin_media,
        media_handler::list_trashed_media,
        media_handler::delete_media,
        media_handler::restore_media,
        media_handler::preview_media,
        media_handler::preview_admin_media,
        download_handler::download,
        stripe_webhook::stripe_webhook,
        orders_handler::my_orders,
        orders_handler::my_downloads,
        orders_handler::refund_order,
        notes::create_note,
        notes::get_note,
        notes::list_notes,
        notes::update_note,
        notes::delete_note,
    ),
    components(schemas(
        health::HealthResponse,
        crate::models::RegisterRequest,
        crate::models::LoginRequest,
        crate::models::RegistrationResponse,
        crate::models::VerifyEmailRequest,
        crate::models::PasswordResetRequest,
        crate::models::ConfirmPasswordResetRequest,
        crate::models::LoginMfaRequired,
        crate::models::MfaVerifyRequest,
        crate::models::TotpCodeRequest,
        crate::models::TotpSetupResponse,
        crate::models::TotpStatusResponse,
        crate::handlers::dev_mail::DevMailMessage,
        crate::models::preferences::UserPreferences,
        crate::models::preferences::UpdateUserPreferencesRequest,
        crate::handlers::preferences_handler::UserPreferencesResponse,
        crate::models::workspace_overlay::WorkspaceOverlayDocument,
        crate::models::workspace_overlay::UpdateWorkspaceOverlayRequest,
        crate::handlers::workspace_overlay_handler::WorkspaceOverlayApiResponse,
        crate::models::article::Article,
        crate::models::article::ArticlePublic,
        crate::models::article::CreateArticleRequest,
        crate::models::article::UpdateArticleRequest,
        crate::models::article::PaginatedArticles,
        crate::models::article::PaginatedArticlesPublic,
        crate::handlers::articles::SetAliasRequest,
        crate::models::project::ProjectAdminResponse,
        crate::models::project::ProjectPublicResponse,
        crate::models::project::CreateProjectRequest,
        crate::models::project::UpdateProjectRequest,
        crate::models::project::ProjectUrlUpdate,
        crate::models::product::ProductAdminResponse,
        crate::models::product::ProductPublicResponse,
        crate::models::product::CreateProductRequest,
        crate::models::product::UpdateProductRequest,
        crate::models::product::CheckoutRequest,
        crate::handlers::products_handler::CheckoutResponse,
        crate::models::product::OrderHistoryItem,
        crate::models::product::DownloadHistoryItem,
        crate::models::product::RefundResponse,
        crate::models::notification::NotificationAccountList,
        crate::models::notification::NotificationAccountResponse,
        crate::models::notification::NotificationAdminList,
        crate::models::notification::NotificationAdminResponse,
        crate::models::notification::NotificationPublicList,
        crate::models::notification::NotificationPublicResponse,
        crate::models::notification::CreateNotificationRequest,
        crate::models::notification::UpdateNotificationStatusRequest,
        crate::models::settings::UpdateSettingsRequest,
        crate::models::settings::TrackEventsRequest,
        crate::models::settings::TrackEvent,
        crate::models::settings::AnalyticsRetentionRequest,
        crate::models::settings::AnalyticsRetentionResponse,
        crate::models::settings::AnalyticsStats,
        crate::models::settings::TopArticle,
        crate::models::settings::RecentEvent,
        crate::models::user::UserResponse,
        crate::models::user::UserRole,
        crate::services::session::Session,
        crate::models::workspace::WorkspaceRelease,
        crate::models::workspace::WorkspaceReleasePublic,
        crate::models::workspace::PublishReleaseRequest,
        crate::models::workspace::ReleaseListItem,
        crate::models::workspace::ReleaseControlResponse,
        crate::models::workspace::ReleaseValidationResponse,
        crate::models::workspace::BrokenResourceRef,
        crate::models::workspace::ReleaseTreeIssue,
        crate::handlers::workspace_handler::ActivateReleaseQuery,
        crate::handlers::workspace_handler::ReleaseListResponse,
        crate::models::media::MediaAdminResponse,
        crate::models::media::MediaPublicResponse,
        crate::models::media::MediaUploadResponse,
        crate::models::media::AssetProcessingState,
        crate::models::Note,
        crate::models::CreateNoteRequest,
        crate::models::UpdateNoteRequest,
        crate::models::PaginatedNotes,
        crate::errors::ErrorResponse,
    )),
    modifiers(&SecurityAddon),
    info(
        title = "Glory RS API",
        version = "0.1.0",
        description = "Template API — Rust + Axum + OpenAPI"
    )
)]
#[allow(clippy::needless_for_each)]
pub struct ApiDoc;

/// Crea el router principal con CORS, tracing, Swagger UI y todas las rutas.
pub fn create_router(pool: sqlx::PgPool, config: crate::config::AppConfig) -> Router {
    let site_url = std::env::var("SITE_URL").unwrap_or_else(|_| "https://wandori.us".to_string());

    let state = AppState {
        pool,
        upload_dir: config.upload_dir,
        resend_api_key: config.resend_api_key,
        email_from: config.email_from,
        stripe_secret_key: config.stripe_secret_key,
        stripe_webhook_secret: config.stripe_webhook_secret,
        site_url,
        login_rate_limit: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        auth_action_rate_limit: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        api_rate_limit: std::sync::Arc::new(
            std::sync::Mutex::new(std::collections::HashMap::new()),
        ),
        dev_mailbox: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
    };
    /* [16AA-18] Modo build: el front vive en `frontend/dist` y lo sirve este
     * backend, como en produccion (en dev lo sirve vite). Solo se activa si el
     * `index.html` existe, asi que en dev el router es exactamente el de antes. */
    let router = create_router_with_state(state);
    let dist = PathBuf::from(&config.frontend_dist);
    if dist.join("index.html").is_file() {
        tracing::info!("Sirviendo el front estatico de {}", dist.display());
        router.fallback_service(spa_de(&dist))
    } else {
        router
    }
}

/* Prefijos que NO son rutas del SPA: bajo ellos un 404 se queda en 404.
 * [por que] Si el fallback devolviera el `index.html` con un 200 para
 * `/uploads/x.png`, una imagen ausente seria un HTML con 200 (verde fingido), y
 * ese 404 lo fija un test (`media_handler::tests`). */
const RESERVED: [&str; 4] = ["/api", "/uploads", "/swagger-ui", "/api-docs"];

async fn no_encontrado() -> StatusCode {
    StatusCode::NOT_FOUND
}

/* Sirve `dist` y, para lo que no sea un archivo, el `index.html` (rutas del
 * cliente: `/admin/articulos/1`). `ServeDir` ya trae tipos MIME, rangos y
 * cacheo; lo unico propio son los 404 de los prefijos reservados, que van como
 * rutas de este router en vez de envolver el servicio: envolverlo obligaria al
 * future a retener la respuesta de `ServeDir`, que no es `Send`. */
fn spa_de(dist: &std::path::Path) -> Router {
    let mut spa = Router::new();
    for prefijo in RESERVED {
        spa = spa.route(&format!("{prefijo}/*resto"), any(no_encontrado));
    }
    /* [por que] `not_found_service` fuerza un 404 sobre la respuesta del fallback (sirve para
     * una pagina 404 propia): con el, una ruta del cliente como `/admin/articulos/1` seria el
     * `index.html` con 404. `.fallback` conserva el 200 del `index.html`. */
    spa.fallback_service(
        ServeDir::new(dist).fallback(ServeFile::new(dist.join("index.html"))),
    )
}

/// Crea el router usando un estado ya construido.
pub fn create_router_with_state(state: AppState) -> Router {
    /* [297A-7] CORS con allowlist de orígenes */
    let allowed_origins: Vec<HeaderValue> = std::env::var("CORS_ORIGINS")
        .unwrap_or_else(|_| {
            "https://wandori.us,http://localhost:5173,http://localhost:3000".to_string()
        })
        .split(',')
        .map(|s| s.trim().parse())
        .filter_map(Result::ok)
        .collect();

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_credentials(true)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::PATCH,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::HeaderName::from_static("x-csrf-token"),
        ]);

    Router::new()
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .nest("/api", api_routes())
        .layer(
            ServiceBuilder::new()
                .layer(TraceLayer::new_for_http())
                .layer(cors)
                .layer(DefaultBodyLimit::max(20 * 1024 * 1024)) /* 20MB para uploads de media */
                .into_inner(),
        )
        .with_state(state)
}

fn api_routes() -> Router<AppState> {
    /* [297A-14] Sintaxis de rutas: este build (axum 0.7.9 + matchit 0.7.3)
     * parsea parámetros con `:param`, NO con `{param}` (el `{id}` de la doc
     * de axum 0.7 devuelve 404 silencioso). Usar SIEMPRE `:id` en `.route()`;
     * los atributos `utoipa::path` sí conservan `{id}` (formato OpenAPI). */
    Router::new()
        .merge(health::routes())
        .merge(auth::routes())
        .merge(dev_mail::routes())
        .merge(notes::routes())
        .merge(articles::routes())
        .merge(media_handler::routes())
        .merge(notifications::routes())
        .merge(download_handler::routes())
        .merge(preferences_handler::routes())
        .merge(settings_handler::routes())
        .merge(products_handler::routes())
        .merge(orders_handler::routes())
        .merge(projects_handler::routes())
        .merge(seo::routes())
        .merge(stripe_webhook::routes())
        .merge(workspace_handler::routes())
        .merge(workspace_overlay_handler::routes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::AppConfig;
    use tower::ServiceExt;

    /* [por que] `connect_lazy` no abre conexion: este test mira el router (estatico
     * vs reservado), no la base. */
    fn router_with_dist(dist: &std::path::Path) -> Router {
        let pool = sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://test:test@127.0.0.1:1/none")
            .expect("pool perezoso");
        create_router(
            pool,
            AppConfig {
                database_url: "postgres://test:test@127.0.0.1:1/none".to_string(),
                host: "127.0.0.1".to_string(),
                port: 3000,
                stripe_secret_key: None,
                stripe_webhook_secret: None,
                upload_dir: "target/spa-test-uploads".to_string(),
                resend_api_key: None,
                email_from: "test@example.invalid".to_string(),
                frontend_dist: dist.display().to_string(),
            },
        )
    }

    async fn get(router: &Router, uri: &str) -> axum::http::Response<axum::body::Body> {
        router
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri(uri)
                    .body(axum::body::Body::empty())
                    .expect("peticion"),
            )
            .await
            .expect("el router debe responder")
    }

    #[tokio::test]
    async fn modo_build_sirve_el_spa_y_respeta_los_prefijos_reservados() {
        let dir = std::env::temp_dir().join(format!("wandorius-spa-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("dist de prueba");
        std::fs::write(dir.join("index.html"), "<div id=\"root\">SPA</div>").expect("index");
        std::fs::write(dir.join("app.js"), "console.log(1)").expect("asset");
        let router = router_with_dist(&dir);

        // `/` y una ruta anidada del cliente devuelven el index.html del SPA.
        for uri in ["/", "/admin/articulos/1"] {
            let r = get(&router, uri).await;
            assert_eq!(r.status(), StatusCode::OK, "{uri}");
            let cuerpo = axum::body::to_bytes(r.into_body(), 64 * 1024)
                .await
                .expect("cuerpo");
            assert!(
                String::from_utf8_lossy(&cuerpo).contains("SPA"),
                "{uri} debe ser el index.html"
            );
        }
        // Un archivo real del dist se sirve tal cual, con su tipo.
        let r = get(&router, "/app.js").await;
        assert_eq!(r.status(), StatusCode::OK);
        assert!(r
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .contains("javascript"));

        // [por que] Sin esto, una imagen ausente o una API inexistente responderian
        // el HTML del SPA con 200: un verde fingido que ademas rompe un test existente.
        for uri in ["/uploads/nope.png", "/api/no-existe"] {
            assert_eq!(
                get(&router, uri).await.status(),
                StatusCode::NOT_FOUND,
                "{uri}"
            );
        }
        std::fs::remove_dir_all(&dir).ok();
    }

    #[tokio::test]
    async fn sin_dist_el_router_no_sirve_ningun_front() {
        let dir = std::env::temp_dir().join(format!("wandorius-spa-vacio-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("carpeta vacia");
        assert_eq!(
            get(&router_with_dist(&dir), "/").await.status(),
            StatusCode::NOT_FOUND
        );
        std::fs::remove_dir_all(&dir).ok();
    }
}
