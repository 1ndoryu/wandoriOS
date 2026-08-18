use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

/// Preferencias privadas sincronizadas por cuenta.
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct UserPreferences {
    pub user_id: Uuid,
    pub theme: String,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}

/// Request para actualización optimista de preferencias.
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateUserPreferencesRequest {
    /// `system`, `claro` u `oscuro`.
    pub theme: String,
    /// Revisión que el cliente leyó antes de editar.
    pub expected_revision: i32,
}

impl UpdateUserPreferencesRequest {
    pub fn validate(&self) -> Result<(), &'static str> {
        if !matches!(self.theme.as_str(), "system" | "claro" | "oscuro") {
            return Err("Tema no válido");
        }
        if self.expected_revision < 0 {
            return Err("Revisión no válida");
        }
        Ok(())
    }
}
