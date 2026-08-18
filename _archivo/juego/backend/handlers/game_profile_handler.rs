use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use crate::errors::AppError;
use crate::middleware::AuthUser;
use crate::models::game_profile::{GameProfile, UpdateGameProfileRequest};
use crate::services::game_profile::GameProfileService;
use crate::AppState;

/// Obtiene el perfil persistente de la cuenta autenticada.
#[utoipa::path(
    get,
    path = "/api/game/profile",
    responses(
        (status = 200, description = "Perfil de juego", body = GameProfile),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_game_profile(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<GameProfile>, AppError> {
    Ok(Json(
        GameProfileService::get(&state.pool, auth.user_id).await?,
    ))
}

/// Actualiza el perfil con nombre allowlisted y revisión optimista.
#[utoipa::path(
    put,
    path = "/api/game/profile",
    request_body = UpdateGameProfileRequest,
    responses(
        (status = 200, description = "Perfil actualizado", body = GameProfile),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "CSRF inválido", body = ErrorResponse),
        (status = 409, description = "Revisión en conflicto", body = ErrorResponse),
        (status = 422, description = "Perfil inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_game_profile(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(request): Json<UpdateGameProfileRequest>,
) -> Result<Json<GameProfile>, AppError> {
    Ok(Json(
        GameProfileService::update(&state.pool, auth.user_id, request).await?,
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new().route(
        "/game/profile",
        get(get_game_profile).put(update_game_profile),
    )
}
