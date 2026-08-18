use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;
use utoipa::ToSchema;

pub const GAME_AUDIT_DEFAULT_LIMIT: i64 = 50;
pub const GAME_AUDIT_MAX_LIST_LIMIT: i64 = 100;

/// Acciones allowlisted del catálogo; el servidor nunca acepta una acción del cliente.
pub const ACTION_CHARACTER_CREATED: &str = "character.created";
pub const ACTION_CHARACTER_UPDATED: &str = "character.updated";
/// [297A-58] Publicación de una nueva versión activa de un mapa del juego.
pub const ACTION_MAP_PUBLISHED: &str = "map.published";
/// [297A-60] Cambios allowlisted del catálogo de assets del juego.
pub const ACTION_ASSET_CREATED: &str = "asset.created";
pub const ACTION_ASSET_UPDATED: &str = "asset.updated";
/// [297A-72] Importación/edición/activación de versiones inmutables de asset.
pub const ACTION_ASSET_VERSION_CREATED: &str = "asset.version.created";
pub const ACTION_ASSET_VERSION_UPDATED: &str = "asset.version.updated";
pub const ACTION_ASSET_VERSION_ACTIVATED: &str = "asset.version.activated";

/// Evento persistido de auditoría. `actor_id` se conserva en BD para trazabilidad,
/// pero no se expone en el listado admin (privacidad: solo el `actor_kind`).
#[derive(Debug, Clone, FromRow)]
pub struct GameAuditEvent {
    pub id: i64,
    pub actor_id: Option<uuid::Uuid>,
    pub actor_kind: String,
    pub action: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// Evento visible para el panel admin: sin identidades, sin tokens y sin
/// coordenadas precisas (los payloads del catálogo solo llevan estado visual).
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameAuditEventResponse {
    pub id: i64,
    pub actor_kind: String,
    pub action: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub payload: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

impl From<GameAuditEvent> for GameAuditEventResponse {
    fn from(event: GameAuditEvent) -> Self {
        Self {
            id: event.id,
            actor_kind: event.actor_kind,
            action: event.action,
            entity_kind: event.entity_kind,
            entity_id: event.entity_id,
            payload: event.payload,
            created_at: event.created_at,
        }
    }
}
