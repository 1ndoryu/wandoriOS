use sqlx::{PgPool, Postgres, Transaction};

use crate::models::game_character::GameCharacterDefinition;

pub struct GameCharacterRepository;

impl GameCharacterRepository {
    /// Todas las opciones del catálogo (activas e inactivas) para el panel
    /// admin: permite ver y re-activar opciones desactivadas. Ordenadas por
    /// estado (activas primero) y luego por id, determinista.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<GameCharacterDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameCharacterDefinition>(
            "SELECT id, display_name, body_tone, is_active, created_at
             FROM game_character_definitions
             ORDER BY is_active DESC, id",
        )
        .fetch_all(pool)
        .await
    }

    /// Opciones activas del catálogo, ordenadas por id para respuestas deterministas.
    pub async fn list_active(pool: &PgPool) -> Result<Vec<GameCharacterDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameCharacterDefinition>(
            "SELECT id, display_name, body_tone, is_active, created_at
             FROM game_character_definitions
             WHERE is_active = TRUE
             ORDER BY id",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn get(
        pool: &PgPool,
        id: &str,
    ) -> Result<Option<GameCharacterDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameCharacterDefinition>(
            "SELECT id, display_name, body_tone, is_active, created_at
             FROM game_character_definitions
             WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// [297A-55] Las mutaciones se ejecutan dentro de una transacción para que
    /// el evento de auditoría se escriba (o se descarte) con el mismo cambio.
    pub async fn create(
        tx: &mut Transaction<'_, Postgres>,
        id: &str,
        display_name: &str,
        body_tone: &str,
    ) -> Result<GameCharacterDefinition, sqlx::Error> {
        sqlx::query_as::<_, GameCharacterDefinition>(
            "INSERT INTO game_character_definitions (id, display_name, body_tone)
             VALUES ($1, $2, $3)
             RETURNING id, display_name, body_tone, is_active, created_at",
        )
        .bind(id)
        .bind(display_name)
        .bind(body_tone)
        .fetch_one(&mut **tx)
        .await
    }

    /// `None` significa que el id no existe en el catálogo.
    pub async fn update(
        tx: &mut Transaction<'_, Postgres>,
        id: &str,
        display_name: &str,
        body_tone: &str,
        is_active: bool,
    ) -> Result<Option<GameCharacterDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameCharacterDefinition>(
            "UPDATE game_character_definitions
             SET display_name = $2, body_tone = $3, is_active = $4
             WHERE id = $1
             RETURNING id, display_name, body_tone, is_active, created_at",
        )
        .bind(id)
        .bind(display_name)
        .bind(body_tone)
        .bind(is_active)
        .fetch_optional(&mut **tx)
        .await
    }
}
