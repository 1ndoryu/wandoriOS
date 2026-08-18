use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::workspace_overlay::{
    UpdateWorkspaceOverlayRequest, WorkspaceOverlayDocument, WorkspaceOverlayResponse,
};
use crate::repositories::workspace_overlay_repo::{
    WorkspaceOverlayRepository, WorkspaceOverlayRow,
};

pub struct WorkspaceOverlayService;

impl WorkspaceOverlayService {
    pub async fn get(pool: &PgPool, user_id: Uuid) -> Result<WorkspaceOverlayResponse, AppError> {
        let row = WorkspaceOverlayRepository::get(pool, user_id).await?;
        match row {
            Some(row) => Self::from_row(row),
            None => Ok(WorkspaceOverlayResponse {
                user_id,
                overlay: WorkspaceOverlayDocument::default(),
                revision: 0,
                updated_at: chrono::Utc::now(),
            }),
        }
    }

    pub async fn update(
        pool: &PgPool,
        user_id: Uuid,
        request: UpdateWorkspaceOverlayRequest,
    ) -> Result<WorkspaceOverlayResponse, AppError> {
        request
            .validate()
            .map_err(|message| AppError::Validation(message.into()))?;
        let overlay = serde_json::to_value(&request.overlay)
            .map_err(|_| AppError::Validation("Overlay inválido".into()))?;
        let row = WorkspaceOverlayRepository::update_if_revision(
            pool,
            user_id,
            &overlay,
            request.expected_revision,
        )
        .await?
        .ok_or_else(|| AppError::Conflict("El overlay cambió; vuelve a leerlo".into()))?;
        Self::from_row(row)
    }

    fn from_row(row: WorkspaceOverlayRow) -> Result<WorkspaceOverlayResponse, AppError> {
        let overlay = serde_json::from_value::<WorkspaceOverlayDocument>(row.overlay)
            .map_err(|error| AppError::Internal(format!("Overlay almacenado inválido: {error}")))?;
        overlay.validate().map_err(|message| {
            AppError::Internal(format!("Overlay almacenado inválido: {message}"))
        })?;
        Ok(WorkspaceOverlayResponse {
            user_id: row.user_id,
            overlay,
            revision: row.revision,
            updated_at: row.updated_at,
        })
    }
}
