use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use uuid::Uuid;
use validator::Validate;

use crate::errors::AppError;
use crate::middleware::AuthUser;
use crate::models::{CreateNoteRequest, Note, PaginatedNotes, PaginationParams, UpdateNoteRequest};
use crate::services::NoteService;
use crate::AppState;

/// Crear una nota
#[utoipa::path(
    post,
    path = "/api/notes",
    request_body = CreateNoteRequest,
    responses(
        (status = 201, description = "Nota creada", body = Note),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 422, description = "Error de validación", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn create_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateNoteRequest>,
) -> Result<(StatusCode, Json<Note>), AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let note = NoteService::create(&state.pool, auth.user_id, req).await?;
    Ok((StatusCode::CREATED, Json(note)))
}

/// Obtener una nota por ID
#[utoipa::path(
    get,
    path = "/api/notes/{id}",
    params(("id" = Uuid, Path, description = "ID de la nota")),
    responses(
        (status = 200, description = "Nota encontrada", body = Note),
        (status = 404, description = "Nota no encontrada", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn get_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<Json<Note>, AppError> {
    let note = NoteService::get(&state.pool, id, auth.user_id).await?;
    Ok(Json(note))
}

/// Listar notas con paginación
#[utoipa::path(
    get,
    path = "/api/notes",
    params(PaginationParams),
    responses(
        (status = 200, description = "Lista de notas", body = PaginatedNotes),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn list_notes(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<PaginationParams>,
) -> Result<Json<PaginatedNotes>, AppError> {
    let notes = NoteService::list(&state.pool, auth.user_id, params.page, params.per_page).await?;
    Ok(Json(notes))
}

/// Actualizar una nota
#[utoipa::path(
    put,
    path = "/api/notes/{id}",
    params(("id" = Uuid, Path, description = "ID de la nota")),
    request_body = UpdateNoteRequest,
    responses(
        (status = 200, description = "Nota actualizada", body = Note),
        (status = 404, description = "No encontrada", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn update_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
    Json(req): Json<UpdateNoteRequest>,
) -> Result<Json<Note>, AppError> {
    req.validate()
        .map_err(|e| AppError::Validation(e.to_string()))?;

    let note = NoteService::update(&state.pool, id, auth.user_id, req).await?;
    Ok(Json(note))
}

/// Eliminar una nota
#[utoipa::path(
    delete,
    path = "/api/notes/{id}",
    params(("id" = Uuid, Path, description = "ID de la nota")),
    responses(
        (status = 204, description = "Nota eliminada"),
        (status = 404, description = "No encontrada", body = ErrorResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn delete_note(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    NoteService::delete(&state.pool, id, auth.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/notes", post(create_note).get(list_notes))
        .route(
            "/notes/:id",
            get(get_note).put(update_note).delete(delete_note),
        )
}
