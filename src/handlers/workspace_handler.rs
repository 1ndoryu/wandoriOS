use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::workspace::{
    PublishReleaseRequest, ReleaseControlResponse, ReleaseListItem, ReleaseValidationResponse,
    WorkspaceRelease, WorkspaceReleasePublic,
};
use crate::services::workspace_svc::WorkspaceService;
use crate::AppState;

/// Response del historial de releases (admin) en DTO ligero.
/// [028A-13] Ya no envía el `tree` completo: solo metadatos + resumen.
#[derive(Serialize, ToSchema)]
pub struct ReleaseListResponse {
    pub items: Vec<ReleaseListItem>,
}

/// Query de activación de una release.
/// [028A-13] `force=true` salta el guard de estructura/refs rotas.
#[derive(Debug, Deserialize, ToSchema)]
pub struct ActivateReleaseQuery {
    pub force: Option<bool>,
}

/// Obtener el release activo del workspace (público).
#[utoipa::path(
    get,
    path = "/api/workspace/release",
    responses(
        (status = 200, description = "Release activo", body = WorkspaceReleasePublic),
        (status = 404, description = "No hay releases", body = ErrorResponse)
    )
)]
pub async fn get_active_release(
    State(state): State<AppState>,
) -> Result<Json<WorkspaceReleasePublic>, AppError> {
    let release = WorkspaceService::get_active_release(&state.pool).await?;
    Ok(Json(release))
}

/// Obtener un release por versión (admin — rollback).
#[utoipa::path(
    get,
    path = "/api/admin/workspace/releases/{version}",
    params(("version" = i32, Path, description = "Versión del release")),
    responses(
        (status = 200, description = "Release encontrado", body = WorkspaceReleasePublic),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_release_by_version(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(version): Path<i32>,
) -> Result<Json<WorkspaceReleasePublic>, AppError> {
    let release = WorkspaceService::get_release_by_version(&state.pool, version).await?;
    Ok(Json(release))
}

/// Listar todos los releases (admin — historial).
#[utoipa::path(
    get,
    path = "/api/admin/workspace/releases",
    responses(
        (status = 200, description = "Historial de releases", body = ReleaseListResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_releases(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<ReleaseListResponse>, AppError> {
    let releases = WorkspaceService::list_releases(&state.pool).await?;
    Ok(Json(ReleaseListResponse { items: releases }))
}

/// Publicar un nuevo release del workspace (admin).
/// [297A-11 §9.2] Publicación transaccional a release inmutable.
#[utoipa::path(
    post,
    path = "/api/admin/workspace/publish",
    request_body = PublishReleaseRequest,
    responses(
        (status = 201, description = "Release publicado", body = WorkspaceRelease),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 403, description = "Prohibido", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn publish_release(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(req): Json<PublishReleaseRequest>,
) -> Result<(axum::http::StatusCode, Json<WorkspaceRelease>), AppError> {
    let release = WorkspaceService::publish(&state.pool, req.tree, admin.user_id).await?;
    Ok((axum::http::StatusCode::CREATED, Json(release)))
}

/// Estado actual de la gobernanza del workspace (admin — dashboard).
/// [028A-13] Activa vs. última publicada: permite detectar el caso de una
/// foto incompleta que quedó vigente sin que el admin lo notara.
#[utoipa::path(
    get,
    path = "/api/admin/workspace/control",
    responses(
        (status = 200, description = "Estado de la gobernanza", body = ReleaseControlResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_workspace_control(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<ReleaseControlResponse>, AppError> {
    let control = WorkspaceService::control(&state.pool).await?;
    Ok(Json(control))
}

/// Validación dry-run de una release publicada (admin).
/// [028A-13] Mismo guard que publish, sin escribir: el panel lo usa para
/// comprobar "qué pasaría si activo esta versión".
#[utoipa::path(
    post,
    path = "/api/admin/workspace/releases/{version}/validate",
    params(("version" = i32, Path, description = "Versión del release")),
    responses(
        (status = 200, description = "Resultado de la validación", body = ReleaseValidationResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn validate_release(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(version): Path<i32>,
) -> Result<Json<ReleaseValidationResponse>, AppError> {
    let validation = WorkspaceService::validate_version(&state.pool, version).await?;
    Ok(Json(validation))
}

/// Activar una release existente (admin).
/// [028A-13] Sin `?force=true` valida estructura y refs; el 422 devuelve el
/// detalle. Con force se activa igual, auditado por el propio admin.
#[utoipa::path(
    post,
    path = "/api/admin/workspace/releases/{version}/activate",
    params(
        ("version" = i32, Path, description = "Versión del release"),
        ("force" = Option<bool>, Query, description = "Activar aunque haya issues/refs rotas")
    ),
    responses(
        (status = 200, description = "Release activada", body = WorkspaceRelease),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse),
        (status = 422, description = "Problemas de validación", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn activate_release(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(version): Path<i32>,
    Query(query): Query<ActivateReleaseQuery>,
) -> Result<Json<WorkspaceRelease>, AppError> {
    let release =
        WorkspaceService::activate_version(&state.pool, version, query.force.unwrap_or(false))
            .await?;
    Ok(Json(release))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/workspace/release", get(get_active_release))
        .route("/admin/workspace/control", get(get_workspace_control))
        .route("/admin/workspace/releases", get(list_releases))
        .route(
            "/admin/workspace/releases/:version",
            get(get_release_by_version),
        )
        .route(
            "/admin/workspace/releases/:version/validate",
            post(validate_release),
        )
        .route(
            "/admin/workspace/releases/:version/activate",
            post(activate_release),
        )
        .route("/admin/workspace/publish", post(publish_release))
}
