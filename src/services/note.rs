use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::{CreateNoteRequest, Note, PaginatedNotes, UpdateNoteRequest};
use crate::repositories::NoteRepository;

pub struct NoteService;

impl NoteService {
    pub async fn create(
        pool: &PgPool,
        user_id: Uuid,
        req: CreateNoteRequest,
    ) -> Result<Note, AppError> {
        let note = NoteRepository::create(pool, user_id, &req.title, &req.content).await?;
        Ok(note)
    }

    pub async fn get(pool: &PgPool, note_id: Uuid, user_id: Uuid) -> Result<Note, AppError> {
        NoteRepository::find_by_id(pool, note_id, user_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Nota no encontrada".into()))
    }

    pub async fn list(
        pool: &PgPool,
        user_id: Uuid,
        page: i64,
        per_page: i64,
    ) -> Result<PaginatedNotes, AppError> {
        let (notes, total) = NoteRepository::list(pool, user_id, page, per_page).await?;
        Ok(PaginatedNotes {
            items: notes,
            total,
            page,
            per_page,
        })
    }

    pub async fn update(
        pool: &PgPool,
        note_id: Uuid,
        user_id: Uuid,
        req: UpdateNoteRequest,
    ) -> Result<Note, AppError> {
        NoteRepository::update(
            pool,
            note_id,
            user_id,
            req.title.as_deref(),
            req.content.as_deref(),
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Nota no encontrada".into()))
    }

    pub async fn delete(pool: &PgPool, note_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
        if !NoteRepository::delete(pool, note_id, user_id).await? {
            return Err(AppError::NotFound("Nota no encontrada".into()));
        }
        Ok(())
    }
}
