use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

pub const GAME_PROFILE_DEFAULT_CHARACTER_ID: &str = "forest-scout";
pub const GAME_PROFILE_DEFAULT_DISPLAY_NAME: &str = "Jugador";
pub const GAME_PROFILE_MAX_DISPLAY_NAME_CHARS: usize = 24;

/// Perfil mínimo persistente de una cuenta dentro de Bosque.
/// La identidad de invitados nunca se materializa en esta tabla.
#[derive(Debug, Clone, FromRow, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GameProfile {
    #[serde(skip_serializing)]
    pub user_id: Uuid,
    pub display_name: String,
    pub character_id: String,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}

/// Actualiza el perfil con revisión optimista.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateGameProfileRequest {
    /// Nombre visible del jugador; no es una identidad ni un permiso.
    pub display_name: String,
    /// Opción visual publicada por el catálogo allowlisted.
    pub character_id: String,
    /// Revisión que el cliente leyó antes de editar.
    pub expected_revision: i32,
}

impl UpdateGameProfileRequest {
    pub fn validate(&self) -> Result<String, &'static str> {
        if self.expected_revision < 0 {
            return Err("Revisión no válida");
        }
        if !crate::models::game_character::GameCharacterDefinition::is_valid_id(&self.character_id)
        {
            return Err("Personaje no válido");
        }
        if self
            .display_name
            .chars()
            .any(|character| character.is_control() || is_format_character(character))
        {
            return Err("El nombre del jugador contiene caracteres no permitidos");
        }
        let display_name = self.display_name.trim();
        let char_count = display_name.chars().count();
        if display_name.is_empty() || char_count > GAME_PROFILE_MAX_DISPLAY_NAME_CHARS {
            return Err("El nombre del jugador debe tener entre 1 y 24 caracteres");
        }
        Ok(display_name.to_string())
    }
}

fn is_format_character(character: char) -> bool {
    matches!(
        character,
        '\u{061C}'
            | '\u{200B}'..='\u{200F}'
            | '\u{202A}'..='\u{202E}'
            | '\u{2060}'..='\u{2064}'
            | '\u{2066}'..='\u{206F}'
            | '\u{FEFF}'
    )
}

#[cfg(test)]
mod tests {
    use super::{UpdateGameProfileRequest, GAME_PROFILE_DEFAULT_DISPLAY_NAME};

    #[test]
    fn trims_and_accepts_a_bounded_display_name() {
        let request = UpdateGameProfileRequest {
            display_name: "  Guardián  ".to_string(),
            character_id: "forest-scout".to_string(),
            expected_revision: 0,
        };
        assert_eq!(request.validate(), Ok("Guardián".to_string()));
    }

    #[test]
    fn rejects_invalid_revision_empty_long_and_control_names() {
        for request in [
            UpdateGameProfileRequest {
                display_name: "Jugador".to_string(),
                character_id: "forest-scout".to_string(),
                expected_revision: -1,
            },
            UpdateGameProfileRequest {
                display_name: " ".to_string(),
                character_id: "forest-scout".to_string(),
                expected_revision: 0,
            },
            UpdateGameProfileRequest {
                display_name: "x".repeat(25),
                character_id: "forest-scout".to_string(),
                expected_revision: 0,
            },
            UpdateGameProfileRequest {
                display_name: "Jugador\n".to_string(),
                character_id: "forest-scout".to_string(),
                expected_revision: 0,
            },
            UpdateGameProfileRequest {
                display_name: "Ju\u{200B}gador".to_string(),
                character_id: "forest-scout".to_string(),
                expected_revision: 0,
            },
        ] {
            assert!(request.validate().is_err());
        }
        assert_eq!(GAME_PROFILE_DEFAULT_DISPLAY_NAME, "Jugador");
    }
}
