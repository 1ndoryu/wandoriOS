use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use uuid::Uuid;

use crate::errors::AppError;
use crate::middleware::AdminUser;
use crate::models::project::{
    CreateProjectRequest, ProjectAdminResponse, ProjectPublicResponse, UpdateProjectRequest,
};
use crate::services::project_svc::ProjectService;
use crate::AppState;

/// Crear proyecto (admin)
/* [018A-21] Este dominio mantiene sus rutas admin explícitas en OpenAPI para
 * que el cliente generado no confunda el catálogo público con el editor. */
#[utoipa::path(
    post,
    path = "/api/admin/projects",
    request_body = CreateProjectRequest,
    responses(
        (status = 201, description = "Proyecto creado", body = ProjectAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_project(
    State(state): State<AppState>,
    _auth: AdminUser,
    Json(req): Json<CreateProjectRequest>,
) -> Result<(StatusCode, Json<ProjectAdminResponse>), AppError> {
    let project = ProjectService::create(&state.pool, req).await?;
    Ok((
        StatusCode::CREATED,
        Json(ProjectAdminResponse::from(&project)),
    ))
}

/// Listar proyectos (publico — solo visibles)
#[utoipa::path(
    get,
    path = "/api/projects",
    responses((status = 200, description = "Proyectos visibles", body = [ProjectPublicResponse]))
)]
pub async fn list_projects(
    State(state): State<AppState>,
) -> Result<Json<Vec<ProjectPublicResponse>>, AppError> {
    let projects = ProjectService::list_visible(&state.pool).await?;
    Ok(Json(
        projects.iter().map(ProjectPublicResponse::from).collect(),
    ))
}

/// Listar todos los proyectos (admin)
#[utoipa::path(
    get,
    path = "/api/admin/projects",
    responses(
        (status = 200, description = "Todos los proyectos", body = [ProjectAdminResponse]),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_all_projects(
    State(state): State<AppState>,
    _auth: AdminUser,
) -> Result<Json<Vec<ProjectAdminResponse>>, AppError> {
    let projects = ProjectService::list_all(&state.pool).await?;
    Ok(Json(
        projects.iter().map(ProjectAdminResponse::from).collect(),
    ))
}

/// Obtener un proyecto por ID (admin)
#[utoipa::path(
    get,
    path = "/api/admin/projects/{id}",
    params(("id" = Uuid, Path, description = "ID del proyecto")),
    responses(
        (status = 200, description = "Proyecto encontrado", body = ProjectAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_project(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<Json<ProjectAdminResponse>, AppError> {
    let project = ProjectService::get_by_id(&state.pool, id).await?;
    Ok(Json(ProjectAdminResponse::from(&project)))
}

/// Actualizar proyecto (admin)
#[utoipa::path(
    put,
    path = "/api/admin/projects/{id}",
    params(("id" = Uuid, Path, description = "ID del proyecto")),
    request_body = UpdateProjectRequest,
    responses(
        (status = 200, description = "Proyecto actualizado", body = ProjectAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_project(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateProjectRequest>,
) -> Result<Json<ProjectAdminResponse>, AppError> {
    let project = ProjectService::update(&state.pool, id, req).await?;
    Ok(Json(ProjectAdminResponse::from(&project)))
}

/// Eliminar proyecto (admin)
#[utoipa::path(
    delete,
    path = "/api/admin/projects/{id}",
    params(("id" = Uuid, Path, description = "ID del proyecto")),
    responses(
        (status = 204, description = "Proyecto eliminado"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn delete_project(
    State(state): State<AppState>,
    _auth: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    ProjectService::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        /* Públicos */
        .route("/projects", get(list_projects))
        /* Admin */
        .route(
            "/admin/projects",
            get(list_all_projects).post(create_project),
        )
        .route(
            "/admin/projects/:id",
            get(get_project).put(update_project).delete(delete_project),
        )
}
