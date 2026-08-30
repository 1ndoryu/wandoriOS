// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
use sqlx::{PgPool, Postgres, QueryBuilder, Transaction};
use uuid::Uuid;

use crate::models::preferences::{UpdateUserPreferencesRequest, UserPreferences};

pub struct PreferencesRepository;

const COLUMNS: &str = "user_id, theme, wallpaper, font, scale, revision, updated_at";

impl PreferencesRepository {
    pub async fn get(pool: &PgPool, user_id: Uuid) -> Result<Option<UserPreferences>, sqlx::Error> {
        sqlx::query_as::<_, UserPreferences>(&format!(
            "SELECT {COLUMNS} FROM user_preferences WHERE user_id = $1"
        ))
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    /// Actualiza SOLO los campos presentes en el request y sube la revisión
    /// global. Los campos ausentes (None) no se tocan, así dos dispositivos
    /// pueden editar campos distintos sin pisarse; la colisión real del mismo
    /// campo se detecta con `expected_revision` (409 → LWW en el cliente).
    /// [297A-29] `Some("")` (texto) o `Some(0.0)` (escala) vuelve el campo a
    /// NULL = heredar el default global del admin.
    pub async fn update_if_revision(
        pool: &PgPool,
        user_id: Uuid,
        request: &UpdateUserPreferencesRequest,
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

        let mut builder: QueryBuilder<Postgres> =
            QueryBuilder::new("UPDATE user_preferences SET updated_at = NOW()");
        let mut any_field = false;

        if let Some(theme) = &request.theme {
            builder.push(", theme = ").push_bind(theme);
            any_field = true;
        }
        if let Some(wallpaper) = &request.wallpaper {
            // Some("") => NULL (heredar); Some(x) => x
            builder
                .push(", wallpaper = ")
                .push_bind(if wallpaper.is_empty() {
                    None
                } else {
                    Some(wallpaper.as_str())
                });
            any_field = true;
        }
        if let Some(font) = &request.font {
            builder.push(", font = ").push_bind(if font.is_empty() {
                None
            } else {
                Some(font.as_str())
            });
            any_field = true;
        }
        if let Some(scale) = request.scale {
            // Some(0.0) => NULL (heredar)
            builder
                .push(", scale = ")
                .push_bind(if scale == 0.0 { None } else { Some(scale) });
            any_field = true;
        }

        if !any_field {
            tx.rollback().await?;
            return PreferencesRepository::get(pool, user_id).await;
        }

        builder
            .push(", revision = revision + 1 WHERE user_id = ")
            .push_bind(user_id);
        builder
            .push(" AND revision = ")
            .push_bind(request.expected_revision);
        builder.push(" RETURNING ").push(COLUMNS);

        let updated = builder
            .build_query_as::<UserPreferences>()
            .fetch_optional(&mut *tx)
            .await?;
        tx.commit().await?;
        Ok(updated)
    }
}
