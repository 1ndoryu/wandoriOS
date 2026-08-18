use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

/// Preferencias privadas sincronizadas por cuenta.
/// Los campos de apariencia son NULL cuando el usuario hereda el default
/// global del admin ([297A-29]).
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
pub struct UserPreferences {
    pub user_id: Uuid,
    pub theme: String,
    /// NULL = heredar el default global del admin.
    pub wallpaper: Option<String>,
    /// NULL = heredar el default global del admin.
    pub font: Option<String>,
    /// NULL = heredar el default global del admin.
    pub scale: Option<f64>,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}

/// Request para actualización optimista de preferencias por campo.
/// [297A-13] Merge por campo + LWW en la colisión real del mismo campo.
/// [297A-29] Los campos de apariencia son opcionales: `None` = no tocar;
/// `Some("")` en texto o `Some(0.0)` en escala = volver a heredar el default.
#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateUserPreferencesRequest {
    /// `system`, `claro` u `oscuro` (opcional: no tocar si es `None`).
    pub theme: Option<String>,
    /// URL/imagen o identificador del fondo (opcional).
    pub wallpaper: Option<String>,
    /// `system`, `pixel` u otra familia registrada (opcional).
    pub font: Option<String>,
    /// Factor de escala > 0 (opcional; 0.0 = heredar default).
    pub scale: Option<f64>,
    /// Revisión que el cliente leyó antes de editar.
    pub expected_revision: i32,
}

impl UpdateUserPreferencesRequest {
    pub fn validate(&self) -> Result<(), &'static str> {
        if let Some(theme) = &self.theme {
            if !matches!(theme.as_str(), "system" | "claro" | "oscuro") {
                return Err("Tema no válido");
            }
        }
        if let Some(font) = &self.font {
            if !font.is_empty() && !matches!(font.as_str(), "system" | "pixel" | "mono" | "sans") {
                return Err("Fuente no válida");
            }
        }
        if let Some(scale) = self.scale {
            if !(0.5..=2.0).contains(&scale) {
                return Err("Escala fuera de rango (0.5–2.0)");
            }
        }
        if self.expected_revision < 0 {
            return Err("Revisión no válida");
        }
        Ok(())
    }
}
