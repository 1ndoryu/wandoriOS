use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::game_map::{
    canonicalize_document, document_content_hash, document_json_bytes, GameMapDraftPublic,
    GameMapVersionPublic, MapVersion, PublishMapRequest, SaveDraftRequest,
    MAP_VERSION_MAX_JSON_BYTES,
};
use crate::repositories::game_map_repo::{GameMapDraftRow, GameMapRepository, GameMapVersionRow};
use crate::services::game_audit_svc::GameAuditService;

pub struct GameMapService;

impl GameMapService {
    /// Obtiene el mapa activo y vuelve a validar el JSON antes de servirlo.
    /// Un snapshot corrupto nunca se convierte en una respuesta parcial.
    pub async fn get_active(pool: &PgPool, map_id: &str) -> Result<GameMapVersionPublic, AppError> {
        if map_id.trim().is_empty() || map_id.chars().count() > 128 {
            return Err(AppError::BadRequest(
                "Identificador de mapa no válido".into(),
            ));
        }

        let row = GameMapRepository::get_active(pool, map_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Mapa publicado no encontrado".into()))?;

        Self::validate_stored_row(&row)?;
        Ok(Self::to_public(row))
    }

    /// Publica un snapshot validado como nueva versión activa del mapa.
    /// La autorización ya fue resuelta por el extractor `AdminUser` del handler.
    /// [297A-58] La publicación y su evento de auditoría comparten transacción;
    /// el payload del evento solo lleva metadata (versión, schema, hash), nunca
    /// el documento ni coordenadas.
    pub async fn publish(
        pool: &PgPool,
        published_by: Uuid,
        request: PublishMapRequest,
    ) -> Result<GameMapVersionPublic, AppError> {
        request
            .validate_metadata()
            .map_err(|message| AppError::Validation(message.into()))?;

        let canonical_document = canonicalize_document(&request.document);
        let document_bytes = document_json_bytes(&canonical_document)
            .ok_or_else(|| AppError::Validation("El documento no es serializable".into()))?;
        let document = MapVersion::from_bounded_json(&document_bytes, MAP_VERSION_MAX_JSON_BYTES)
            .map_err(|message| {
            AppError::Validation(format!("MapVersion inválido: {message}"))
        })?;
        let map_id = document.id.clone();

        if let Some(requested_map_id) = &request.map_id {
            if requested_map_id != &map_id {
                return Err(AppError::Validation(
                    "mapId debe coincidir con document.id".into(),
                ));
            }
        }

        let content_hash = document_content_hash(&canonical_document)
            .ok_or_else(|| AppError::Validation("No se pudo calcular el hash del mapa".into()))?;
        let schema_version = i32::from(document.schema_version);

        let mut tx = pool.begin().await?;
        let row = GameMapRepository::publish(
            &mut tx,
            &map_id,
            request.expected_version,
            schema_version,
            &content_hash,
            &canonical_document,
            published_by,
        )
        .await?
        .ok_or_else(|| {
            AppError::Conflict("La versión activa cambió; vuelve a leer el mapa".into())
        })?;

        /* [297A-71] La publicación invalida el borrador: la versión publicada
         * pasa a ser la nueva base y el draft queda obsoleto. Se borra en la
         * misma transacción (nunca un borrador huérfano que confunda al editor). */
        GameMapRepository::delete_draft(&mut tx, &row.map_id).await?;

        let payload = serde_json::json!({
            "version": row.version,
            "schemaVersion": row.schema_version,
            "contentHash": row.content_hash,
        });
        GameAuditService::record_map_publish(&mut tx, published_by, &row.map_id, &payload).await?;
        tx.commit().await?;

        Ok(Self::to_public(row))
    }

    /// Obtiene el borrador editable y vuelve a validar el JSON antes de servirlo.
    /// [297A-71] Solo admin; el documento corrupto nunca se convierte en una
    /// respuesta parcial.
    pub async fn get_draft(pool: &PgPool, map_id: &str) -> Result<GameMapDraftPublic, AppError> {
        if map_id.trim().is_empty() || map_id.chars().count() > 128 {
            return Err(AppError::BadRequest(
                "Identificador de mapa no válido".into(),
            ));
        }

        let row = GameMapRepository::get_draft(pool, map_id)
            .await?
            .ok_or_else(|| AppError::NotFound("No hay borrador para este mapa".into()))?;

        Self::validate_draft_row(&row)?;
        Ok(Self::to_draft_public(row))
    }

    /// Guarda el borrador con revisión optimista. `expectedRevision` debe
    /// coincidir con la revisión actual del servidor (0 para el primer guardado).
    /// [297A-71] La autorización ya fue resuelta por el extractor `AdminUser`;
    /// el guardado valida el documento completo como una publicación.
    pub async fn save_draft(
        pool: &PgPool,
        updated_by: Uuid,
        request: SaveDraftRequest,
    ) -> Result<GameMapDraftPublic, AppError> {
        request
            .validate_metadata()
            .map_err(|message| AppError::Validation(message.into()))?;

        let canonical_document = canonicalize_document(&request.document);
        let document_bytes = document_json_bytes(&canonical_document)
            .ok_or_else(|| AppError::Validation("El documento no es serializable".into()))?;
        let document = MapVersion::from_bounded_json(&document_bytes, MAP_VERSION_MAX_JSON_BYTES)
            .map_err(|message| {
            AppError::Validation(format!("MapVersion inválido: {message}"))
        })?;
        let map_id = document.id.clone();

        if let Some(requested_map_id) = &request.map_id {
            if requested_map_id != &map_id {
                return Err(AppError::Validation(
                    "mapId debe coincidir con document.id".into(),
                ));
            }
        }

        let content_hash = document_content_hash(&canonical_document)
            .ok_or_else(|| AppError::Validation("No se pudo calcular el hash del mapa".into()))?;
        let schema_version = i32::from(document.schema_version);

        let mut tx = pool.begin().await?;
        let row = GameMapRepository::save_draft(
            &mut tx,
            &map_id,
            request.expected_revision,
            schema_version,
            &content_hash,
            &canonical_document,
            updated_by,
        )
        .await?
        .ok_or_else(|| {
            AppError::Conflict(
                "El borrador cambió en el servidor; recarga y vuelve a editar".into(),
            )
        })?;
        tx.commit().await?;

        Ok(Self::to_draft_public(row))
    }

    fn validate_draft_row(row: &GameMapDraftRow) -> Result<(), AppError> {
        let document_size = usize::try_from(row.document_bytes).map_err(|_| {
            AppError::Internal("El tamaño del borrador del mapa no es válido".into())
        })?;
        if document_size > MAP_VERSION_MAX_JSON_BYTES {
            return Err(AppError::Internal(
                "El borrador del mapa supera el tamaño permitido".into(),
            ));
        }
        let document_bytes = document_json_bytes(&row.document)
            .ok_or_else(|| AppError::Internal("El borrador del mapa no es serializable".into()))?;
        let document = MapVersion::from_bounded_json(&document_bytes, MAP_VERSION_MAX_JSON_BYTES)
            .map_err(|_| {
            AppError::Internal("El borrador almacenado del mapa no es válido".into())
        })?;
        let computed_hash = document_content_hash(&row.document).ok_or_else(|| {
            AppError::Internal("No se pudo verificar el hash del borrador".into())
        })?;
        if computed_hash != row.content_hash {
            return Err(AppError::Internal(
                "La integridad del borrador del mapa no se pudo verificar".into(),
            ));
        }
        if document.id != row.map_id || i32::from(document.schema_version) != row.schema_version {
            return Err(AppError::Internal(
                "La metadata del borrador no coincide con su documento".into(),
            ));
        }
        Ok(())
    }

    fn validate_stored_row(row: &GameMapVersionRow) -> Result<(), AppError> {
        let document_size = usize::try_from(row.document_bytes).map_err(|_| {
            AppError::Internal("El tamaño del snapshot del mapa no es válido".into())
        })?;
        if document_size > MAP_VERSION_MAX_JSON_BYTES {
            return Err(AppError::Internal(
                "El snapshot del mapa supera el tamaño permitido".into(),
            ));
        }
        let document_bytes = document_json_bytes(&row.document)
            .ok_or_else(|| AppError::Internal("El snapshot del mapa no es serializable".into()))?;
        let document = MapVersion::from_bounded_json(&document_bytes, MAP_VERSION_MAX_JSON_BYTES)
            .map_err(|_| {
            AppError::Internal("El snapshot publicado del mapa no es válido".into())
        })?;
        let computed_hash = document_content_hash(&row.document)
            .ok_or_else(|| AppError::Internal("No se pudo verificar el hash del mapa".into()))?;
        if computed_hash != row.content_hash {
            return Err(AppError::Internal(
                "La integridad del snapshot del mapa no se pudo verificar".into(),
            ));
        }
        if document.id != row.map_id || i32::from(document.schema_version) != row.schema_version {
            return Err(AppError::Internal(
                "La metadata del snapshot no coincide con su documento".into(),
            ));
        }
        Ok(())
    }

    fn to_public(row: GameMapVersionRow) -> GameMapVersionPublic {
        GameMapVersionPublic {
            map_id: row.map_id,
            version: row.version,
            schema_version: row.schema_version,
            content_hash: row.content_hash,
            published_at: row.published_at,
            document: row.document,
        }
    }

    fn to_draft_public(row: GameMapDraftRow) -> GameMapDraftPublic {
        GameMapDraftPublic {
            map_id: row.map_id,
            revision: row.revision,
            schema_version: row.schema_version,
            content_hash: row.content_hash,
            updated_at: row.updated_at,
            document: row.document,
        }
    }
}
