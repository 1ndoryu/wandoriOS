use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use utoipa::ToSchema;
use uuid::Uuid;

mod public_locator;
#[cfg(test)]
mod tests;
mod validation;

pub use public_locator::validate_public_locators_in_tree;

const OVERLAY_SCHEMA_VERSION: i32 = 1;

/// Intención persistible del usuario sobre el release del workspace.
/// No contiene ventanas abiertas, foco, z-index ni el workspace resuelto.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
pub struct WorkspaceOverlayDocument {
    pub version: i32,
    #[serde(rename = "addedItems")]
    #[schema(value_type = Object)]
    pub added_items: JsonValue,
    #[serde(rename = "fieldOverrides")]
    #[schema(value_type = Object)]
    pub field_overrides: JsonValue,
    pub tombstones: Vec<String>,
}

impl Default for WorkspaceOverlayDocument {
    fn default() -> Self {
        Self {
            version: OVERLAY_SCHEMA_VERSION,
            added_items: JsonValue::Object(serde_json::Map::new()),
            field_overrides: JsonValue::Object(serde_json::Map::new()),
            tombstones: Vec::new(),
        }
    }
}

impl WorkspaceOverlayDocument {
    pub fn validate(&self) -> Result<(), &'static str> {
        validation::validate_overlay(self)
    }
}

/// Request de actualización condicional del overlay personal.
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateWorkspaceOverlayRequest {
    pub overlay: WorkspaceOverlayDocument,
    pub expected_revision: i32,
}

impl UpdateWorkspaceOverlayRequest {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.expected_revision < 0 {
            return Err("Revisión no válida");
        }
        self.overlay.validate()
    }
}

/// Response del overlay personal con revisión server-side.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct WorkspaceOverlayResponse {
    pub user_id: Uuid,
    pub overlay: WorkspaceOverlayDocument,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}
