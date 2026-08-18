use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::media::{CreateMediaRequest, Media};
use crate::models::resource::{
    CreateResourceParams, EditorialState, ResourceKind, VisibilityState,
};
use crate::repositories::media_repo::MediaRepository;
use crate::repositories::resource_repo::ResourceRepository;

pub struct MediaService;

impl MediaService {
    /// [297A-10] Crear media con resource envelope en transacción. Defaults: ready, public.
    #[allow(clippy::explicit_auto_deref)]
    pub async fn create(pool: &PgPool, req: CreateMediaRequest) -> Result<Media, AppError> {
        let id = uuid::Uuid::new_v4();

        let mut tx = pool.begin().await?;

        /* 1. Insertar resource envelope (media es ready/public por defecto) */
        ResourceRepository::create(
            &mut *tx,
            CreateResourceParams {
                id,
                kind: ResourceKind::Media,
                title: if req.alt_text.is_empty() {
                    "media file"
                } else {
                    &req.alt_text
                },
                editorial: EditorialState::Ready,
                visibility: VisibilityState::Public,
            },
        )
        .await?;

        /* 2. Insertar media */
        let media = MediaRepository::create(
            &mut *tx,
            id,
            req.article_id,
            &req.file_path,
            &req.file_type,
            req.file_size,
            &req.alt_text,
        )
        .await?;

        tx.commit().await?;
        Ok(media)
    }

    /// Listado público: envelope active + public + asset clean.
    pub async fn list_public(
        pool: &PgPool,
        file_type: Option<&str>,
        article_id: Option<Uuid>,
    ) -> Result<Vec<Media>, AppError> {
        Ok(MediaRepository::list_public(pool, file_type, article_id).await?)
    }

    /// Listado admin: envelope activo, incluye processing/rejected.
    pub async fn list_admin(
        pool: &PgPool,
        file_type: Option<&str>,
        article_id: Option<Uuid>,
        asset_state: Option<&str>,
    ) -> Result<Vec<Media>, AppError> {
        Ok(MediaRepository::list_admin(pool, file_type, article_id, asset_state).await?)
    }

    /// Listado de la papelera (envelope trashed).
    pub async fn list_trashed(pool: &PgPool) -> Result<Vec<Media>, AppError> {
        Ok(MediaRepository::list_trashed(pool).await?)
    }

    /// [297A-14 F4] Eliminación blanda: el envelope pasa a trashed (restaurable).
    /// El archivo físico y la fila de media se conservan; el público deja de verlo.
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
        let mut tx = pool.begin().await?;
        let trashed =
            ResourceRepository::soft_delete_kind_tx(&mut tx, id, ResourceKind::Media).await?;
        if !trashed {
            return Err(AppError::NotFound("Media no encontrado".into()));
        }
        tx.commit().await?;
        Ok(())
    }

    /// [297A-14 F4] Restaurar desde la papelera: el envelope vuelve a active.
    pub async fn restore(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
        let restored = ResourceRepository::restore_kind(pool, id, ResourceKind::Media).await?;
        if !restored {
            return Err(AppError::NotFound("Media no encontrado".into()));
        }
        Ok(())
    }
}

/// Clasificar tipo de media por extensión — autoridad del backend.
/// `None` = extensión no soportada (se rechaza en el boundary).
#[must_use]
pub fn classify_media_type(extension: &str) -> Option<&'static str> {
    match extension.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "svg" | "avif" => Some("image"),
        "mp3" | "wav" | "ogg" | "flac" | "m4a" | "aac" => Some("audio"),
        "mp4" | "webm" | "mov" | "mkv" => Some("video"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::classify_media_type;

    #[test]
    fn classifies_known_extensions() {
        assert_eq!(classify_media_type("PNG"), Some("image"));
        assert_eq!(classify_media_type("jpeg"), Some("image"));
        assert_eq!(classify_media_type("webp"), Some("image"));
        assert_eq!(classify_media_type("mp3"), Some("audio"));
        assert_eq!(classify_media_type("wav"), Some("audio"));
        assert_eq!(classify_media_type("mp4"), Some("video"));
        assert_eq!(classify_media_type("webm"), Some("video"));
    }

    #[test]
    fn rejects_unknown_extensions() {
        assert_eq!(classify_media_type("exe"), None);
        assert_eq!(classify_media_type("html"), None);
        assert_eq!(classify_media_type(""), None);
    }
}
