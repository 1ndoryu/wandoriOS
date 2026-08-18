use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::game_audit::GameAuditEventResponse;
use crate::services::game_audit_svc::GameAuditService;
use crate::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameAuditQuery {
    /// Filtra los eventos por id de personaje.
    pub entity_id: Option<String>,
    /// Máximo de eventos devueltos; el servicio lo acota a 100.
    pub limit: Option<i64>,
}

/// Listado de eventos de auditoría del catálogo de personajes (admin).
/// Nunca expone identidades ni datos privados: solo `actor_kind`, acción,
/// entidad, payload visual y fecha.
#[utoipa::path(
    get,
    path = "/api/admin/game/audit/characters",
    params(
        ("entityId" = Option<String>, Query, description = "Filtra por id de personaje"),
        ("limit" = Option<i64>, Query, description = "Máximo de eventos (1..=100, por defecto 50)")
    ),
    responses(
        (status = 200, description = "Eventos de auditoría del catálogo", body = [GameAuditEventResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_game_audit_characters(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(params): Query<GameAuditQuery>,
) -> Result<Json<Vec<GameAuditEventResponse>>, AppError> {
    Ok(Json(
        GameAuditService::list_character_events(
            &state.pool,
            params.entity_id.as_deref(),
            params.limit,
        )
        .await?,
    ))
}

/// [297A-60] Listado de eventos del catálogo de assets (admin). Mismo contrato
/// acotado que el catálogo: nunca expone identidades ni payloads privados.
#[utoipa::path(
    get,
    path = "/api/admin/game/audit/assets",
    params(
        ("entityId" = Option<String>, Query, description = "Filtra por id de asset"),
        ("limit" = Option<i64>, Query, description = "Máximo de eventos (1..=100, por defecto 50)")
    ),
    responses(
        (status = 200, description = "Eventos del catálogo de assets", body = [GameAuditEventResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_game_audit_assets(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(params): Query<GameAuditQuery>,
) -> Result<Json<Vec<GameAuditEventResponse>>, AppError> {
    Ok(Json(
        GameAuditService::list_asset_events(&state.pool, params.entity_id.as_deref(), params.limit)
            .await?,
    ))
}

/// [297A-58] Listado de eventos de publicación de mapas (admin). Mismo contrato
/// acotado que el catálogo: nunca expone identidades, el documento ni
/// coordenadas; el payload solo lleva versión, schema y hash.
#[utoipa::path(
    get,
    path = "/api/admin/game/audit/maps",
    params(
        ("entityId" = Option<String>, Query, description = "Filtra por id de mapa"),
        ("limit" = Option<i64>, Query, description = "Máximo de eventos (1..=100, por defecto 50)")
    ),
    responses(
        (status = 200, description = "Eventos de publicación de mapas", body = [GameAuditEventResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_game_audit_maps(
    State(state): State<AppState>,
    _admin: AdminUser,
    Query(params): Query<GameAuditQuery>,
) -> Result<Json<Vec<GameAuditEventResponse>>, AppError> {
    Ok(Json(
        GameAuditService::list_map_events(&state.pool, params.entity_id.as_deref(), params.limit)
            .await?,
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/admin/game/audit/characters",
            get(list_game_audit_characters),
        )
        .route("/admin/game/audit/maps", get(list_game_audit_maps))
        .route("/admin/game/audit/assets", get(list_game_audit_assets))
}
