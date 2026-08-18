use axum::extract::{DefaultBodyLimit, Path, State};
use axum::routing::get;
use axum::{Json, Router};

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::game_map::{
    GameMapDraftPublic, GameMapVersionPublic, PublishMapRequest, SaveDraftRequest,
    MAP_VERSION_MAX_JSON_BYTES,
};
use crate::services::game_map_svc::GameMapService;
use crate::services::game_ws::GAME_RESTART_GRACE_SECONDS;
use crate::AppState;

/// Publicar una nueva versión activa de un mapa del juego (admin).
#[utoipa::path(
    post,
    path = "/api/admin/game/maps",
    request_body = PublishMapRequest,
    responses(
        (status = 200, description = "Mapa publicado", body = GameMapVersionPublic),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 409, description = "La versión activa cambió", body = ErrorResponse),
        (status = 413, description = "El documento supera el tamaño permitido"),
        (status = 422, description = "MapVersion inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn publish_map(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(request): Json<PublishMapRequest>,
) -> Result<Json<GameMapVersionPublic>, AppError> {
    let published = GameMapService::publish(&state.pool, admin.user_id, request).await?;
    /* [Decisión 8] Publicación exitosa ⇒ migración coordinada: difunde el
     * aviso de reinicio, espera la cuenta atrás y drena las salas (el
     * cliente reconecta y recarga la versión nueva). Fire-and-forget. */
    state
        .game_ws_state
        .schedule_restart("publicación de versión nueva", GAME_RESTART_GRACE_SECONDS);
    Ok(Json(published))
}

/// Obtener el snapshot publicado activo de un mapa del juego.
#[utoipa::path(
    get,
    path = "/api/game/maps/{map_id}",
    params(("map_id" = String, Path, description = "Identificador público del mapa")),
    responses(
        (status = 200, description = "Mapa publicado", body = GameMapVersionPublic),
        (status = 400, description = "Identificador inválido", body = ErrorResponse),
        (status = 404, description = "Mapa no encontrado", body = ErrorResponse),
        (status = 500, description = "Snapshot inválido", body = ErrorResponse)
    )
)]
pub async fn get_active_map(
    State(state): State<AppState>,
    Path(map_id): Path<String>,
) -> Result<Json<GameMapVersionPublic>, AppError> {
    Ok(Json(
        GameMapService::get_active(&state.pool, &map_id).await?,
    ))
}

/// Obtener el borrador editable de un mapa del juego (admin).
#[utoipa::path(
    get,
    path = "/api/admin/game/maps/{map_id}/draft",
    params(("map_id" = String, Path, description = "Identificador público del mapa")),
    responses(
        (status = 200, description = "Borrador del mapa", body = GameMapDraftPublic),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "No hay borrador", body = ErrorResponse),
        (status = 500, description = "Borrador inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_map_draft(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(map_id): Path<String>,
) -> Result<Json<GameMapDraftPublic>, AppError> {
    /* [SNT-11] `_admin` conserva el extractor (auth) aunque la lectura del
     * borrador no use el id del actor. */
    Ok(Json(GameMapService::get_draft(&state.pool, &map_id).await?))
}

/// Guardar el borrador editable de un mapa del juego con revisión optimista (admin).
#[utoipa::path(
    put,
    path = "/api/admin/game/maps/{map_id}/draft",
    request_body = SaveDraftRequest,
    responses(
        (status = 200, description = "Borrador guardado", body = GameMapDraftPublic),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 409, description = "El borrador cambió en el servidor", body = ErrorResponse),
        (status = 413, description = "El documento supera el tamaño permitido"),
        (status = 422, description = "MapVersion inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn save_map_draft(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(map_id): Path<String>,
    Json(request): Json<SaveDraftRequest>,
) -> Result<Json<GameMapDraftPublic>, AppError> {
    /* [297A-71] El path y el body deben referirse al mismo mapa; el service ya
     * exige que `mapId` opcional coincida con `document.id`, y aquí además se
     * exige la igualdad con el path para que la ruta sea coherente. */
    if request.map_id.as_deref() != Some(map_id.as_str()) {
        return Err(AppError::Validation(
            "mapId debe coincidir con la ruta del borrador".into(),
        ));
    }
    Ok(Json(
        GameMapService::save_draft(&state.pool, admin.user_id, request).await?,
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/game/maps/:map_id", get(get_active_map))
        .route(
            "/admin/game/maps",
            axum::routing::post(publish_map)
                .layer(DefaultBodyLimit::max(MAP_VERSION_MAX_JSON_BYTES)),
        )
        .route(
            "/admin/game/maps/:map_id/draft",
            get(get_map_draft)
                .put(save_map_draft)
                .layer(DefaultBodyLimit::max(MAP_VERSION_MAX_JSON_BYTES)),
        )
}
