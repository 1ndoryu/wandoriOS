use sqlx::{PgPool, Postgres, Transaction};

use crate::models::game_audit::GameAuditEvent;

pub struct GameAuditRepository;

impl GameAuditRepository {
    /// Inserta un evento dentro de la transacción del cambio que audita: si la
    /// operación falla, el evento se descarta junto con ella (nunca huérfano).
    pub async fn insert(
        tx: &mut Transaction<'_, Postgres>,
        actor_id: Option<uuid::Uuid>,
        actor_kind: &str,
        action: &str,
        entity_kind: &str,
        entity_id: &str,
        payload: &serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO game_audit_events
                (actor_id, actor_kind, action, entity_kind, entity_id, payload)
             VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(actor_id)
        .bind(actor_kind)
        .bind(action)
        .bind(entity_kind)
        .bind(entity_id)
        .bind(payload)
        .execute(&mut **tx)
        .await?;
        Ok(())
    }

    /// Listado acotado, más reciente primero. `entity_id` opcional filtra la
    /// entidad; el `entity_kind` lo fija el consumidor (nunca el cliente).
    pub async fn list_by_entity(
        pool: &PgPool,
        entity_kind: &str,
        entity_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<GameAuditEvent>, sqlx::Error> {
        sqlx::query_as::<_, GameAuditEvent>(
            "SELECT id, actor_id, actor_kind, action, entity_kind, entity_id, payload, created_at
             FROM game_audit_events
             WHERE entity_kind = $1 AND ($2::text IS NULL OR entity_id = $2)
             ORDER BY created_at DESC, id DESC
             LIMIT $3",
        )
        .bind(entity_kind)
        .bind(entity_id)
        .bind(limit)
        .fetch_all(pool)
        .await
    }
}
