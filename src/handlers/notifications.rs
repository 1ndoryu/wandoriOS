use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::routing::{delete, get, patch, post};
use axum::{Json, Router};
use uuid::Uuid;

use crate::errors::AppError;
use crate::middleware::{AdminUser, AuthUser};
use crate::models::notification::{
    CreateNotificationRequest, NotificationAccountList, NotificationAdminList,
    NotificationAdminResponse, NotificationPublicList, UpdateNotificationStatusRequest,
};
use crate::services::notification_svc::NotificationService;
use crate::AppState;

#[utoipa::path(
    get,
    path = "/api/notifications",
    responses((status = 200, description = "Novedades públicas", body = NotificationPublicList))
)]
/* [018A-23] Notificaciones, settings y analytics comparten el contrato
 * tipado; los servicios siguen siendo la autoridad y el dispatcher solo mide. */
pub async fn list_public(
    State(state): State<AppState>,
) -> Result<Json<NotificationPublicList>, AppError> {
    Ok(Json(NotificationService::list_public(&state.pool).await?))
}

#[utoipa::path(
    get,
    path = "/api/me/notifications",
    responses(
        (status = 200, description = "Novedades de la cuenta", body = NotificationAccountList),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_mine(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<NotificationAccountList>, AppError> {
    Ok(Json(
        NotificationService::list_for_user(&state.pool, auth.user_id).await?,
    ))
}

#[utoipa::path(
    post,
    path = "/api/notifications/{id}/read",
    params(("id" = Uuid, Path, description = "ID de la novedad")),
    responses(
        (status = 204, description = "Novedad marcada como leída"),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn mark_read(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    NotificationService::mark_read(&state.pool, auth.user_id, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/admin/notifications",
    responses(
        (status = 200, description = "Novedades administrables", body = NotificationAdminList),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_admin(
    State(state): State<AppState>,
    _admin: AdminUser,
) -> Result<Json<NotificationAdminList>, AppError> {
    Ok(Json(NotificationService::list_admin(&state.pool).await?))
}

#[utoipa::path(
    post,
    path = "/api/admin/notifications",
    request_body = CreateNotificationRequest,
    responses(
        (status = 200, description = "Novedad creada", body = NotificationAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_admin(
    State(state): State<AppState>,
    admin: AdminUser,
    Json(request): Json<CreateNotificationRequest>,
) -> Result<Json<NotificationAdminResponse>, AppError> {
    let notification = NotificationService::create(&state.pool, request, admin.user_id).await?;
    Ok(Json(NotificationAdminResponse::from(&notification)))
}

#[utoipa::path(
    patch,
    path = "/api/admin/notifications/{id}/status",
    params(("id" = Uuid, Path, description = "ID de la novedad")),
    request_body = UpdateNotificationStatusRequest,
    responses(
        (status = 200, description = "Estado actualizado", body = NotificationAdminResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_status_admin(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
    Json(request): Json<UpdateNotificationStatusRequest>,
) -> Result<Json<NotificationAdminResponse>, AppError> {
    let notification = NotificationService::update_status(&state.pool, id, request).await?;
    Ok(Json(NotificationAdminResponse::from(&notification)))
}

#[utoipa::path(
    delete,
    path = "/api/admin/notifications/{id}",
    params(("id" = Uuid, Path, description = "ID de la novedad")),
    responses(
        (status = 204, description = "Novedad eliminada"),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "No encontrado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn delete_notification(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    NotificationService::delete(&state.pool, id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/notifications", get(list_public))
        .route("/me/notifications", get(list_mine))
        .route("/notifications/:id/read", post(mark_read))
        .route("/admin/notifications", get(list_admin).post(create_admin))
        .route(
            "/admin/notifications/:id/status",
            patch(update_status_admin),
        )
        .route("/admin/notifications/:id", delete(delete_notification))
}
