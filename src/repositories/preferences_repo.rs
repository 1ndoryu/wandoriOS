use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::models::preferences::UserPreferences;

pub struct PreferencesRepository;

impl PreferencesRepository {
    pub async fn get(pool: &PgPool, user_id: Uuid) -> Result<Option<UserPreferences>, sqlx::Error> {
        sqlx::query_as::<_, UserPreferences>(
            "SELECT user_id, theme, revision, updated_at
             FROM user_preferences
             WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    /// Actualiza la preferencia solo si `expected_revision` coincide.
    /// La primera escritura crea la fila en revisión 0 y la actualiza a 1
    /// dentro de la misma transacción, evitando carreras entre dispositivos.
    pub async fn update_if_revision(
        pool: &PgPool,
        user_id: Uuid,
        theme: &str,
        expected_revision: i32,
    ) -> Result<Option<UserPreferences>, sqlx::Error> {
        let mut tx: Transaction<'_, Postgres> = pool.begin().await?;

        sqlx::query(
            "INSERT INTO user_preferences (user_id, theme, revision)
             VALUES ($1, 'system', 0)
             ON CONFLICT (user_id) DO NOTHING",
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await?;

        let updated = sqlx::query_as::<_, UserPreferences>(
            "UPDATE user_preferences
             SET theme = $1, revision = revision + 1, updated_at = NOW()
             WHERE user_id = $2 AND revision = $3
             RETURNING user_id, theme, revision, updated_at",
        )
        .bind(theme)
        .bind(user_id)
        .bind(expected_revision)
        .fetch_optional(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(updated)
    }
}
