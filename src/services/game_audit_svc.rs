use sqlx::{PgPool, Postgres, Transaction};

use crate::errors::AppError;
use crate::models::game_audit::{
    GameAuditEventResponse, ACTION_MAP_PUBLISHED, GAME_AUDIT_DEFAULT_LIMIT,
    GAME_AUDIT_MAX_LIST_LIMIT,
};
use crate::repositories::game_audit_repo::GameAuditRepository;

pub struct GameAuditService;

impl GameAuditService {
    /// Registra un cambio del catálogo dentro de la transacción del cambio.
    /// La acción es allowlisted: el caller solo puede pedir las constantes del
    /// modelo, nunca un string arbitrario del cliente.
    pub async fn record_character_change(
        tx: &mut Transaction<'_, Postgres>,
        actor_id: uuid::Uuid,
        action: &str,
        character_id: &str,
        payload: &serde_json::Value,
    ) -> Result<(), AppError> {
        GameAuditRepository::insert(
            tx,
            Some(actor_id),
            "admin",
            action,
            "character",
            character_id,
            payload,
        )
        .await?;
        Ok(())
    }

    /// Eventos de auditoría del catálogo para el panel admin; el límite nunca
    /// excede el máximo definido aunque el cliente pida más.
    pub async fn list_character_events(
        pool: &PgPool,
        entity_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<GameAuditEventResponse>, AppError> {
        let limit = limit
            .unwrap_or(GAME_AUDIT_DEFAULT_LIMIT)
            .clamp(1, GAME_AUDIT_MAX_LIST_LIMIT);
        Ok(
            GameAuditRepository::list_by_entity(pool, "character", entity_id, limit)
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }

    /// [297A-60] Registra un cambio del catálogo de assets dentro de la
    /// transacción del cambio (mismo patrón que el catálogo de personajes):
    /// si el cambio falla, el evento se descarta con él.
    pub async fn record_asset_change(
        tx: &mut Transaction<'_, Postgres>,
        actor_id: uuid::Uuid,
        action: &str,
        asset_id: &str,
        payload: &serde_json::Value,
    ) -> Result<(), AppError> {
        GameAuditRepository::insert(
            tx,
            Some(actor_id),
            "admin",
            action,
            "asset",
            asset_id,
            payload,
        )
        .await?;
        Ok(())
    }

    /// [297A-60] Eventos de auditoría del catálogo de assets para el panel
    /// admin; mismo contrato acotado que el catálogo, con `entity_kind` `asset`.
    pub async fn list_asset_events(
        pool: &PgPool,
        entity_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<GameAuditEventResponse>, AppError> {
        let limit = limit
            .unwrap_or(GAME_AUDIT_DEFAULT_LIMIT)
            .clamp(1, GAME_AUDIT_MAX_LIST_LIMIT);
        Ok(
            GameAuditRepository::list_by_entity(pool, "asset", entity_id, limit)
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }

    /// [297A-58] Registra una publicación de mapa dentro de la transacción de
    /// la publicación: si el publish falla, el evento se descarta con él.
    pub async fn record_map_publish(
        tx: &mut Transaction<'_, Postgres>,
        actor_id: uuid::Uuid,
        map_id: &str,
        payload: &serde_json::Value,
    ) -> Result<(), AppError> {
        GameAuditRepository::insert(
            tx,
            Some(actor_id),
            "admin",
            ACTION_MAP_PUBLISHED,
            "map",
            map_id,
            payload,
        )
        .await?;
        Ok(())
    }

    /// [297A-58] Eventos de publicación de mapas para el panel admin; mismo
    /// contrato acotado que el catálogo, con `entity_kind` fijado en `map`.
    pub async fn list_map_events(
        pool: &PgPool,
        entity_id: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<GameAuditEventResponse>, AppError> {
        let limit = limit
            .unwrap_or(GAME_AUDIT_DEFAULT_LIMIT)
            .clamp(1, GAME_AUDIT_MAX_LIST_LIMIT);
        Ok(
            GameAuditRepository::list_by_entity(pool, "map", entity_id, limit)
                .await?
                .into_iter()
                .map(Into::into)
                .collect(),
        )
    }
}
