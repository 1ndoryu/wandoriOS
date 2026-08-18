use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use validator::Validate;

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::settings::{
    AnalyticsRetentionRequest, AnalyticsRetentionResponse, AnalyticsStats, TrackEventsRequest,
    UpdateSettingsRequest,
};
use crate::services::settings_svc::{AnalyticsService, SettingsService};
use crate::AppState;

/// Obtener solo settings de presentación pública.
#[utoipa::path(
    get,
    path = "/api/settings",
    responses((status = 200, description = "Configuración pública clave-valor"))
)]
pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<HashMap<String, String>>, AppError> {
    let settings = SettingsService::get_public(&state.pool).await?;
    Ok(Json(settings))
}

/// Actualizar settings (admin)
#[utoipa::path(
    post,
    path = "/api/admin/settings",
    request_body = UpdateSettingsRequest,
    responses(
        (status = 204, description = "Configuración actualizada"),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_settings(
    State(state): State<AppState>,
    _auth: AdminUser,
    Json(req): Json<UpdateSettingsRequest>,
) -> Result<StatusCode, AppError> {
    SettingsService::update_batch(&state.pool, &req.settings).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Registrar eventos de analytics (publico)
#[utoipa::path(
    post,
    path = "/api/analytics/events",
    request_body = TrackEventsRequest,
    responses((status = 204, description = "Eventos aceptados o ignorados por consentimiento"))
)]
pub async fn track_events(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(req): Json<TrackEventsRequest>,
) -> Result<StatusCode, AppError> {
    /* El servidor es la última frontera: sin consentimiento explícito no
     * almacena nada aunque un cliente manipule su JavaScript. */
    let consent_granted = headers
        .get("x-analytics-consent")
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value == "granted");
    if !consent_granted {
        return Ok(StatusCode::NO_CONTENT);
    }

    req.validate()
        .map_err(|error| AppError::Validation(error.to_string()))?;
    for event in &req.events {
        event
            .validate()
            .map_err(|error| AppError::Validation(error.to_string()))?;
    }
    let ip_hash = headers
        .get("x-forwarded-for")
        .or_else(|| headers.get("x-real-ip"))
        .and_then(|v| v.to_str().ok())
        .map(|ip| hex::encode(Sha256::digest(ip.as_bytes())));

    let user_agent = headers
        .get("user-agent")
        .and_then(|v| v.to_str().ok())
        .map(|value| hex::encode(Sha256::digest(value.as_bytes())));

    AnalyticsService::track_events(
        &state.pool,
        &req.events,
        ip_hash.as_deref(),
        user_agent.as_deref(),
        consent_granted,
    )
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Purga eventos más antiguos que la política elegida por el administrador.
#[utoipa::path(
    post,
    path = "/api/admin/analytics/retention",
    request_body = AnalyticsRetentionRequest,
    responses(
        (status = 200, description = "Retención aplicada", body = AnalyticsRetentionResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn purge_analytics(
    State(state): State<AppState>,
    _auth: AdminUser,
    Json(req): Json<AnalyticsRetentionRequest>,
) -> Result<Json<AnalyticsRetentionResponse>, AppError> {
    req.validate()
        .map_err(|error| AppError::Validation(error.to_string()))?;
    let (deleted, cutoff) =
        AnalyticsService::purge_older_than(&state.pool, req.max_age_days).await?;
    Ok(Json(AnalyticsRetentionResponse { deleted, cutoff }))
}

/// Obtener estadisticas (admin)
#[utoipa::path(
    get,
    path = "/api/admin/analytics/stats",
    responses(
        (status = 200, description = "Estadísticas agregadas", body = AnalyticsStats),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_analytics_stats(
    State(state): State<AppState>,
    _auth: AdminUser,
) -> Result<Json<AnalyticsStats>, AppError> {
    let analytics = AnalyticsService::get_stats(&state.pool).await?;
    Ok(Json(analytics))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        /* Públicos */
        .route("/settings", get(get_settings))
        .route("/analytics/events", post(track_events))
        /* Admin */
        .route("/admin/settings", post(update_settings))
        .route("/admin/analytics/retention", post(purge_analytics))
        .route("/admin/analytics/stats", get(get_analytics_stats))
}
