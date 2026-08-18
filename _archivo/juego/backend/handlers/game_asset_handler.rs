use axum::body::Body;
use axum::extract::{DefaultBodyLimit, Multipart, Path, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::Response;
use axum::routing::{get, put};
use axum::{Json, Router};

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::game_asset::{
    CreateGameAssetRequest, GameAssetAdminResponse, GameAssetPublicResponse,
    GameAssetVersionAdminResponse, GameAssetVersionPublicResponse, UpdateGameAssetRequest,
    UpdateGameAssetVersionRequest, GAME_ASSET_GLB_MAX_BYTES,
};
use crate::services::game_asset_svc::GameAssetService;
use crate::AppState;

/// Catálogo activo de assets allowlisted para el Editor de mapa y el runtime.
#[utoipa::path(
    get,
    path = "/api/game/assets",
    responses(
        (status = 200, description = "Catálogo de assets", body = [GameAssetPublicResponse]),
        (status = 500, description = "Catálogo no disponible", body = ErrorResponse)
    )
)]
pub async fn list_game_assets(
    State(state): State<AppState>,
) -> Result<Json<Vec<GameAssetPublicResponse>>, AppError> {
    Ok(Json(
        GameAssetService::list_active(&state.pool)
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
    path = "/api/admin/game/assets",
    responses(
        (status = 200, description = "Catálogo completo (activas e inactivas)", body = [GameAssetAdminResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_admin_game_assets(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<Vec<GameAssetAdminResponse>>, AppError> {
    Ok(Json(
        GameAssetService::list_all(&state.pool)
            .await?
            .into_iter()
            .map(Into::into)
            .collect(),
    ))
}

/// Alta de un asset allowlisted del catálogo (admin).
#[utoipa::path(
    post,
    path = "/api/admin/game/assets",
    request_body = CreateGameAssetRequest,
    responses(
        (status = 200, description = "Asset creado", body = GameAssetAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 409, description = "Ya existe un asset con ese id", body = ErrorResponse),
        (status = 422, description = "Datos inválidos", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_game_asset(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(request): Json<CreateGameAssetRequest>,
) -> Result<Json<GameAssetAdminResponse>, AppError> {
    Ok(Json(
        GameAssetService::create(&state.pool, admin.user_id, request)
            .await?
            .into(),
    ))
}

/// Actualización completa de un asset, incluida su desactivación (admin).
#[utoipa::path(
    put,
    path = "/api/admin/game/assets/{id}",
    params(("id" = String, Path, description = "Identificador del asset")),
    request_body = UpdateGameAssetRequest,
    responses(
        (status = 200, description = "Asset actualizado", body = GameAssetAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "Asset no encontrado", body = ErrorResponse),
        (status = 422, description = "Datos inválidos", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_game_asset(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<String>,
    Json(request): Json<UpdateGameAssetRequest>,
) -> Result<Json<GameAssetAdminResponse>, AppError> {
    Ok(Json(
        GameAssetService::update(&state.pool, admin.user_id, &id, request)
            .await?
            .into(),
    ))
}

/// Importar un GLB como nueva versión (inactiva) de un asset (admin).
#[utoipa::path(
    post,
    path = "/api/admin/game/assets/{id}/versions",
    params(("id" = String, Path, description = "Identificador del asset")),
    responses(
        (status = 200, description = "Versión importada", body = GameAssetVersionAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "Asset no encontrado", body = ErrorResponse),
        (status = 413, description = "El GLB supera el tamaño permitido"),
        (status = 422, description = "GLB inválido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn import_game_asset_version(
    State(state): State<AppState>,
    admin: AdminUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<GameAssetVersionAdminResponse>, AppError> {
    let mut bytes: Option<Vec<u8>> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Error leyendo multipart: {e}")))?
    {
        if field.name().unwrap_or("") == "file" {
            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(format!("Error leyendo archivo: {e}")))?;
            bytes = Some(data.to_vec());
        }
    }
    let bytes = bytes.ok_or_else(|| AppError::BadRequest("Campo file requerido".into()))?;
    Ok(Json(
        GameAssetService::import_version(
            &state.pool,
            &state.upload_dir,
            admin.user_id,
            &id,
            &bytes,
        )
        .await?,
    ))
}

/// Lista las versiones de un asset (admin, sin storage paths).
#[utoipa::path(
    get,
    path = "/api/admin/game/assets/{id}/versions",
    params(("id" = String, Path, description = "Identificador del asset")),
    responses(
        (status = 200, description = "Versiones del asset", body = [GameAssetVersionAdminResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "Asset no encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_game_asset_versions(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<String>,
) -> Result<Json<Vec<GameAssetVersionAdminResponse>>, AppError> {
    Ok(Json(
        GameAssetService::list_versions(&state.pool, &id).await?,
    ))
}

/// Versión activa de un asset para el editor y el runtime (público).
#[utoipa::path(
    get,
    path = "/api/game/assets/{id}/active",
    params(("id" = String, Path, description = "Identificador del asset")),
    responses(
        (status = 200, description = "Versión activa", body = GameAssetVersionPublicResponse),
        (status = 404, description = "Sin versión activa", body = ErrorResponse),
        (status = 422, description = "Identificador inválido", body = ErrorResponse)
    )
)]
pub async fn get_active_game_asset_version(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<GameAssetVersionPublicResponse>, AppError> {
    Ok(Json(
        GameAssetService::get_active_version(&state.pool, &id).await?,
    ))
}

/// Actualiza proxy/scale de una versión AÚN NO ACTIVA (admin).
#[utoipa::path(
    put,
    path = "/api/admin/game/assets/{id}/versions/{version}",
    params(
        ("id" = String, Path, description = "Identificador del asset"),
        ("version" = i32, Path, description = "Número de versión")
    ),
    request_body = UpdateGameAssetVersionRequest,
    responses(
        (status = 200, description = "Versión actualizada", body = GameAssetVersionAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 409, description = "La versión ya está activa (inmutable)", body = ErrorResponse),
        (status = 422, description = "Metadata inválida", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_game_asset_version(
    State(state): State<AppState>,
    admin: AdminUser,
    Path((id, version)): Path<(String, i32)>,
    Json(request): Json<UpdateGameAssetVersionRequest>,
) -> Result<Json<GameAssetVersionAdminResponse>, AppError> {
    Ok(Json(
        GameAssetService::update_version_metadata(
            &state.pool,
            admin.user_id,
            &id,
            version,
            request,
        )
        .await?,
    ))
}

/// Activa una versión (desactiva las demás; queda inmutable).
#[utoipa::path(
    put,
    path = "/api/admin/game/assets/{id}/versions/{version}/activate",
    params(
        ("id" = String, Path, description = "Identificador del asset"),
        ("version" = i32, Path, description = "Número de versión")
    ),
    responses(
        (status = 200, description = "Versión activada", body = GameAssetVersionAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "Versión no encontrada", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn activate_game_asset_version(
    State(state): State<AppState>,
    admin: AdminUser,
    Path((id, version)): Path<(String, i32)>,
) -> Result<Json<GameAssetVersionAdminResponse>, AppError> {
    Ok(Json(
        GameAssetService::activate_version(&state.pool, admin.user_id, &id, version).await?,
    ))
}

/// Devuelve el GLB binario de una versión para el preview 3D (admin).
#[utoipa::path(
    get,
    path = "/api/admin/game/assets/{id}/versions/{version}/file",
    params(
        ("id" = String, Path, description = "Identificador del asset"),
        ("version" = i32, Path, description = "Número de versión")
    ),
    responses(
        (status = 200, description = "GLB binario de la versión", content_type = "model/gltf-binary"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse),
        (status = 404, description = "Versión no encontrada", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn read_game_asset_version_file(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path((id, version)): Path<(String, i32)>,
) -> Result<Response, AppError> {
    let bytes =
        GameAssetService::read_version_file(&state.pool, &state.upload_dir, &id, version).await?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "model/gltf-binary")
        .header(
            header::CONTENT_DISPOSITION,
            HeaderValue::from_str(&format!("inline; filename=\"{id}-v{version}.glb\""))
                .map_err(|_| AppError::Internal("Nombre de archivo inválido".into()))?,
        )
        .body(Body::from(bytes))
        .map_err(|error| AppError::Internal(format!("Error preparando el GLB: {error}")))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/game/assets", get(list_game_assets))
        .route(
            "/admin/game/assets",
            get(list_admin_game_assets).post(create_game_asset),
        )
        .route("/admin/game/assets/:id", put(update_game_asset))
        .route(
            "/admin/game/assets/:id/versions",
            get(list_game_asset_versions)
                .post(import_game_asset_version)
                .layer(DefaultBodyLimit::max(GAME_ASSET_GLB_MAX_BYTES + 1024)),
        )
        .route(
            "/game/assets/:id/active",
            get(get_active_game_asset_version),
        )
        .route(
            "/admin/game/assets/:id/versions/:version",
            put(update_game_asset_version),
        )
        .route(
            "/admin/game/assets/:id/versions/:version/file",
            get(read_game_asset_version_file),
        )
        .route(
            "/admin/game/assets/:id/versions/:version/activate",
            put(activate_game_asset_version),
        )
}
