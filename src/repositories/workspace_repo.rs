// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::workspace::WorkspaceRelease;

pub struct WorkspaceRepository;

impl WorkspaceRepository {
    /// Listar todos los releases ordenados de más nuevo a más viejo (admin).
    /// [028A-13] Incluye `is_active` para que el panel admin marque la activa.
    pub async fn list_releases(pool: &PgPool) -> Result<Vec<WorkspaceRelease>, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceRelease>(
            "SELECT id, version, tree, published_at, published_by, summary, diff_from, is_active \
             FROM workspace_releases \
             ORDER BY version DESC",
        )
        .fetch_all(pool)
        .await
    }

    /// Obtener la release activa (la vigente para todo el mundo).
    /// [028A-13] El índice único parcial garantiza una sola fila con
    /// `is_active = true`; el ORDER BY version DESC es defensivo.
    pub async fn get_active(pool: &PgPool) -> Result<Option<WorkspaceRelease>, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceRelease>(
            "SELECT id, version, tree, published_at, published_by, summary, diff_from, is_active \
             FROM workspace_releases \
             WHERE is_active = true \
             ORDER BY version DESC \
             LIMIT 1",
        )
        .fetch_optional(pool)
        .await
    }

    /// Obtener el release más reciente (historial / fallback de activo).
    pub async fn get_latest(pool: &PgPool) -> Result<Option<WorkspaceRelease>, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceRelease>(
            "SELECT id, version, tree, published_at, published_by, summary, diff_from, is_active \
             FROM workspace_releases \
             ORDER BY version DESC \
             LIMIT 1",
        )
        .fetch_optional(pool)
        .await
    }

    /// Obtener un release por versión específica.
    pub async fn get_by_version(
        pool: &PgPool,
        version: i32,
    ) -> Result<Option<WorkspaceRelease>, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceRelease>(
            "SELECT id, version, tree, published_at, published_by, summary, diff_from, is_active \
             FROM workspace_releases \
             WHERE version = $1",
        )
        .bind(version)
        .fetch_optional(pool)
        .await
    }

    /// Obtener la versión más alta actual (dentro de transacción).
    #[allow(clippy::explicit_auto_deref)]
    pub async fn get_max_version(tx: &mut sqlx::PgConnection) -> Result<i32, sqlx::Error> {
        let row: (i32,) =
            sqlx::query_as("SELECT COALESCE(MAX(version), 0) FROM workspace_releases")
                .fetch_one(&mut *tx)
                .await?;
        Ok(row.0)
    }

    /// Publicar un nuevo release (dentro de transacción).
    /// [028A-11] `summary` es el diff auditable contra la release anterior y
    /// `diff_from` su versión (NULL para la primera release).
    /// [028A-13] La nueva release nace con `is_active = false`; la activación
    /// explícita la hace `activate_version` (publish decide si la auto-activa).
    #[allow(clippy::explicit_auto_deref)]
    pub async fn create(
        tx: &mut sqlx::PgConnection,
        version: i32,
        tree: &serde_json::Value,
        published_by: Option<Uuid>,
        summary: &serde_json::Value,
        diff_from: Option<i32>,
    ) -> Result<WorkspaceRelease, sqlx::Error> {
        sqlx::query_as::<_, WorkspaceRelease>(
            "INSERT INTO workspace_releases (version, tree, published_by, summary, diff_from) \
             VALUES ($1, $2, $3, $4, $5) \
             RETURNING id, version, tree, published_at, published_by, summary, diff_from, is_active",
        )
        .bind(version)
        .bind(tree)
        .bind(published_by)
        .bind(summary)
        .bind(diff_from)
        .fetch_one(&mut *tx)
        .await
    }

    /// Activar una release y desactivar el resto (dentro de transacción).
    /// [028A-13] Todas las demás pasan a `false` y la `version` indicada a
    /// `true`, respetando el índice único parcial. Devuelve la release activa.
    #[allow(clippy::explicit_auto_deref)]
    pub async fn activate_version(
        tx: &mut sqlx::PgConnection,
        version: i32,
    ) -> Result<WorkspaceRelease, sqlx::Error> {
        sqlx::query("UPDATE workspace_releases SET is_active = false WHERE is_active = true")
            .execute(&mut *tx)
            .await?;
        sqlx::query_as::<_, WorkspaceRelease>(
            "UPDATE workspace_releases SET is_active = true WHERE version = $1 \
             RETURNING id, version, tree, published_at, published_by, summary, diff_from, is_active",
        )
        .bind(version)
        .fetch_one(&mut *tx)
        .await
    }
}
