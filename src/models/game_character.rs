use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

pub const GAME_CHARACTER_ID_MAX_CHARS: usize = 32;
pub const GAME_CHARACTER_DISPLAY_NAME_MAX_CHARS: usize = 48;

/// Opción visual del catálogo; no incluye storage keys ni scripts.
/// `is_active` y `created_at` son metadata administrativa interna.
#[derive(Debug, Clone, FromRow)]
pub struct GameCharacterDefinition {
    pub id: String,
    pub display_name: String,
    pub body_tone: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

/// Contrato público: solo la identidad visual necesaria para renderizar.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameCharacterPublicResponse {
    pub id: String,
    pub display_name: String,
    pub body_tone: String,
}

impl From<GameCharacterDefinition> for GameCharacterPublicResponse {
    fn from(character: GameCharacterDefinition) -> Self {
        Self {
            id: character.id,
            display_name: character.display_name,
            body_tone: character.body_tone,
        }
    }
}

/// Contrato administrativo: incluye el estado y la fecha para gestionar el catálogo.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameCharacterAdminResponse {
    pub id: String,
    pub display_name: String,
    pub body_tone: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<GameCharacterDefinition> for GameCharacterAdminResponse {
    fn from(character: GameCharacterDefinition) -> Self {
        Self {
            id: character.id,
            display_name: character.display_name,
            body_tone: character.body_tone,
            is_active: character.is_active,
            created_at: character.created_at,
        }
    }
}

/// Alta de una nueva opción allowlisted del catálogo (admin).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateGameCharacterRequest {
    pub id: String,
    pub display_name: String,
    pub body_tone: String,
}

/// Actualización completa de una opción del catálogo (admin).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateGameCharacterRequest {
    pub display_name: String,
    pub body_tone: String,
    pub is_active: bool,
}

impl GameCharacterDefinition {
    /// El ID de una opción del catálogo solo contiene minúsculas ASCII, dígitos y guiones.
    #[must_use]
    pub fn is_valid_id(id: &str) -> bool {
        !id.is_empty()
            && id.chars().count() <= GAME_CHARACTER_ID_MAX_CHARS
            && id
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    }

    /// Etiqueta visible de una opción: sin controles, entre 1 y 48 caracteres.
    pub fn validate_display_name(value: &str) -> Result<String, &'static str> {
        let trimmed = value.trim();
        let count = trimmed.chars().count();
        if trimmed.is_empty() || count > GAME_CHARACTER_DISPLAY_NAME_MAX_CHARS {
            return Err("La etiqueta debe tener entre 1 y 48 caracteres");
        }
        if trimmed.chars().any(char::is_control) {
            return Err("La etiqueta contiene caracteres no permitidos");
        }
        Ok(trimmed.to_string())
    }

    /// Tono visual permitido por el catálogo allowlisted.
    #[must_use]
    pub fn is_valid_body_tone(value: &str) -> bool {
        matches!(value, "ink" | "middle" | "paper")
    }
}
