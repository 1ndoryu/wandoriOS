use axum::extract::{Path, State};
use axum::routing::{get, put};
use axum::{Json, Router};

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::game_character::{
    CreateGameCharacterRequest, GameCharacterAdminResponse, GameCharacterPublicResponse,
    UpdateGameCharacterRequest,
};
use crate::services::game_character_svc::GameCharacterService;
use crate::AppState;

/// Catálogo activo de opciones visuales allowlisted para el personaje base.
#[utoipa::path(
    get,
    path = "/api/game/characters",
    responses(
        (status = 200, description = "Catálogo de personajes", body = [GameCharacterPublicResponse]),
        (status = 500, description = "Catálogo no disponible", body = ErrorResponse)
    )
)]
pub async fn list_game_characters(
    State(state): State<AppState>,
) -> Result<Json<Vec<GameCharacterPublicResponse>>, AppError> {
    Ok(Json(
        GameCharacterService::list_active(&state.pool)
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
    ))
}

/// Listado completo del catálogo, incluidas las opciones desactivadas, para
/// el panel admin (el público nunca ve inactivas).
#[utoipa::path(
    get,
    path = "/api/admin/game/characters",
    responses(
        (status = 200, description = "Catálogo completo (activas e inactivas)", body = [GameCharacterAdminResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_admin_game_characters(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<GameCharacterAdminResponse>>, AppError> {
    Ok(Json(
        GameCharacterService::list_all(&state.pool)
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
    ))
}

/// Alta de una opción allowlisted del catálogo (admin).
#[utoipa::path(
    post,
    path = "/api/admin/game/characters",
    request_body = CreateGameCharacterRequest,
    responses(
        (status = 200, description = "Personaje creado", body = GameCharacterAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 409, description = "Ya existe un personaje con ese id", body = ErrorResponse),
        (status = 422, description = "Datos inválidos", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_game_character(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(request): Json<CreateGameCharacterRequest>,
) -> Result<Json<GameCharacterAdminResponse>, AppError> {
    Ok(Json(
        GameCharacterService::create(&state.pool, admin.user_id, request)
            .await?
            .into(),
    ))
}

/// Actualización completa de una opción, incluida su desactivación (admin).
#[utoipa::path(
    put,
    path = "/api/admin/game/characters/{id}",
    params(("id" = String, Path, description = "Identificador del personaje")),
    request_body = UpdateGameCharacterRequest,
    responses(
        (status = 200, description = "Personaje actualizado", body = GameCharacterAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "Personaje no encontrado", body = ErrorResponse),
        (status = 422, description = "Datos inválidos", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_game_character(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<String>,
    Json(request): Json<UpdateGameCharacterRequest>,
) -> Result<Json<GameCharacterAdminResponse>, AppError> {
    Ok(Json(
        GameCharacterService::update(&state.pool, admin.user_id, &id, request)
            .await?
            .into(),
    ))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/game/characters", get(list_game_characters))
        .route(
            "/admin/game/characters",
            get(list_admin_game_characters).post(create_game_character),
        )
        .route("/admin/game/characters/:id", put(update_game_character))
}
