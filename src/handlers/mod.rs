#![allow(clippy::needless_for_each)] // Generado por utoipa OpenApi derive

pub mod articles;
pub mod auth;
pub mod dev_mail;
pub mod download_handler;
pub mod game_asset_handler;
pub mod game_audit_handler;
pub mod game_character_handler;
pub mod game_map_handler;
pub mod game_metrics_handler;
pub mod game_profile_handler;
pub mod game_ticket_handler;
pub mod game_ws_handler;
mod health;
pub mod media_handler;
mod notes;
pub mod notifications;
pub mod preferences_handler;
pub mod products_handler;
pub mod projects_handler;
pub mod seo;
pub mod settings_handler;
pub mod stripe_webhook;
pub mod workspace_handler;
pub mod workspace_overlay_handler;

use axum::extract::DefaultBodyLimit;
use axum::http::{header, HeaderValue, Method};
use axum::Router;
use tower::ServiceBuilder;
use tower_http::cors::{AllowOrigin, CorsLayer};
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
        game_character_handler::list_game_characters,
        game_character_handler::create_game_character,
        game_character_handler::update_game_character,
        game_asset_handler::list_game_assets,
        game_asset_handler::list_admin_game_assets,
        game_asset_handler::create_game_asset,
        game_asset_handler::update_game_asset,
        game_asset_handler::import_game_asset_version,
        game_asset_handler::list_game_asset_versions,
        game_asset_handler::get_active_game_asset_version,
        game_asset_handler::update_game_asset_version,
        game_asset_handler::activate_game_asset_version,
        game_asset_handler::read_game_asset_version_file,
        game_audit_handler::list_game_audit_characters,
        game_audit_handler::list_game_audit_maps,
        game_audit_handler::list_game_audit_assets,
        game_map_handler::get_active_map,
        game_map_handler::publish_map,
        game_metrics_handler::read_game_metrics,
        game_profile_handler::get_game_profile,
        game_profile_handler::update_game_profile,
        game_ticket_handler::issue_game_ticket,
        auth::register,
        auth::login,
        auth::verify_email,
        auth::request_password_reset,
        auth::reset_password,
        auth::me,
        auth::logout,
        auth::list_sessions,
        auth::revoke_session,
        auth::totp_status,
        auth::totp_setup,
        auth::totp_confirm,
        auth::totp_disable,
        auth::mfa_verify,
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
        crate::models::game_character::CreateGameCharacterRequest,
        crate::models::game_character::GameCharacterAdminResponse,
        crate::models::game_character::GameCharacterPublicResponse,
        crate::models::game_asset::CreateGameAssetRequest,
        crate::models::game_asset::GameAssetAdminResponse,
        crate::models::game_asset::GameAssetPublicResponse,
        crate::models::game_asset::GameAssetVersionAdminResponse,
        crate::models::game_asset::GameAssetVersionPublicResponse,
        crate::models::game_asset::GameAssetVersionProxy,
        crate::models::game_asset::UpdateGameAssetRequest,
        crate::models::game_asset::UpdateGameAssetVersionRequest,
        crate::models::game_audit::GameAuditEventResponse,
        crate::models::game_character::UpdateGameCharacterRequest,
        crate::models::game_map::GameMapDraftPublic,
        crate::models::game_map::GameMapVersionPublic,
        crate::models::game_map::PublishMapRequest,
        crate::models::game_map::SaveDraftRequest,
        crate::models::game_profile::GameProfile,
        crate::models::game_profile::UpdateGameProfileRequest,
        crate::handlers::game_ticket_handler::GameTicketResponse,
        crate::handlers::game_metrics_handler::GameMetricsResponse,
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
        game_ticket_secret: config.game_ticket_secret,
        game_ticket_store: crate::services::game_ticket::GameTicketStore::default(),
        game_ws_state: crate::services::game_ws::GameWsState::default(),
        site_url,
        login_rate_limit: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        auth_action_rate_limit: std::sync::Arc::new(std::sync::Mutex::new(
            std::collections::HashMap::new(),
        )),
        dev_mailbox: std::sync::Arc::new(std::sync::Mutex::new(Vec::new())),
    };
    create_router_with_state(state)
}

/// Crea el router usando un estado ya construido.
///
/// Esta frontera permite que pruebas y futuros adaptadores compartan el mismo
/// store de tickets/replay que usan los handlers, sin duplicar estado oculto.
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
        .merge(game_character_handler::routes())
        .merge(game_asset_handler::routes())
        .merge(game_audit_handler::routes())
        .merge(game_map_handler::routes())
        .merge(game_metrics_handler::routes())
        .merge(game_profile_handler::routes())
        .merge(game_ticket_handler::routes())
        .merge(game_ws_handler::routes())
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
        .merge(projects_handler::routes())
        .merge(seo::routes())
        .merge(stripe_webhook::routes())
        .merge(workspace_handler::routes())
        .merge(workspace_overlay_handler::routes())
}
