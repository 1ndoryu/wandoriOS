// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
use chrono::{DateTime, Utc};
use serde_json::Value as JsonValue;
use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct WorkspaceOverlayRow {
    pub user_id: Uuid,
    pub overlay: JsonValue,
    pub revision: i32,
    pub updated_at: DateTime<Utc>,
}

pub struct WorkspaceOverlayRepository;

impl WorkspaceOverlayRepository {
    pub async fn get(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Option<WorkspaceOverlayRow>, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceOverlayRow>(
            "SELECT user_id, overlay, revision, updated_at
             FROM user_workspace_overlays
             WHERE user_id = $1",
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn update_if_revision(
        pool: &PgPool,
        user_id: Uuid,
        overlay: &JsonValue,
        expected_revision: i32,
    ) -> Result<Option<WorkspaceOverlayRow>, sqlx::Error> {
        let mut tx: Transaction<'_, Postgres> = pool.begin().await?;
        let updated =
            Self::update_if_revision_tx(&mut tx, user_id, overlay, expected_revision).await?;
        tx.commit().await?;
        Ok(updated)
    }

    async fn update_if_revision_tx(
        tx: &mut Transaction<'_, Postgres>,
        user_id: Uuid,
        overlay: &JsonValue,
        expected_revision: i32,
    ) -> Result<Option<WorkspaceOverlayRow>, sqlx::Error> {
        /* La fila inicial solo puede crearse con revisión esperada 0. Si llega
         * una revisión > 0 para una cuenta sin fila, no materializamos una fila
         * fantasma antes de devolver el conflicto. */
        if expected_revision == 0 {
            sqlx::query(
                "INSERT INTO user_workspace_overlays (user_id, overlay, revision)
                 VALUES ($1, $2, 0)
                 ON CONFLICT (user_id) DO NOTHING",
            )
            .bind(user_id)
            .bind(overlay)
            .execute(&mut **tx)
            .await?;
        }

        sqlx::query_as::<_, WorkspaceOverlayRow>(
            "UPDATE user_workspace_overlays
             SET overlay = $1, revision = revision + 1, updated_at = NOW()
             WHERE user_id = $2 AND revision = $3
             RETURNING user_id, overlay, revision, updated_at",
        )
        .bind(overlay)
        .bind(user_id)
        .bind(expected_revision)
        .fetch_optional(&mut **tx)
        .await
    }
}
