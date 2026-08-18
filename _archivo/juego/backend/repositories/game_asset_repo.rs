use sqlx::{PgPool, Postgres, Transaction};

use crate::models::game_asset::{GameAssetDefinition, GameAssetVersionRow};

const VERSION_SELECT: &str = "SELECT id, asset_id, version, content_hash, storage_path,
            byte_size, kind, category, proxy, scale, is_active, created_at
     FROM game_asset_versions";

pub struct GameAssetRepository;

impl GameAssetRepository {
    /// Todas las opciones del catálogo (activas e inactivas) para el panel
    /// admin: permite ver y re-activar opciones desactivadas. Ordenadas por
    /// estado (activas primero) y luego por id, determinista.
    pub async fn list_all(pool: &PgPool) -> Result<Vec<GameAssetDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetDefinition>(
            "SELECT id, display_name, category, is_active, created_at
             FROM game_assets
             ORDER BY is_active DESC, id",
        )
        .fetch_all(pool)
        .await
    }

    /// Opciones activas del catálogo, ordenadas por id para respuestas deterministas.
    pub async fn list_active(pool: &PgPool) -> Result<Vec<GameAssetDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetDefinition>(
            "SELECT id, display_name, category, is_active, created_at
             FROM game_assets
             WHERE is_active = TRUE
             ORDER BY id",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn get(pool: &PgPool, id: &str) -> Result<Option<GameAssetDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetDefinition>(
            "SELECT id, display_name, category, is_active, created_at
             FROM game_assets
             WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// [297A-72] Lista las versiones de un asset (metadata, sin storage paths)
    /// ordenadas de más reciente a más antigua, determinista.
    pub async fn list_versions(
        pool: &PgPool,
        asset_id: &str,
    ) -> Result<Vec<GameAssetVersionRow>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetVersionRow>(&format!(
            "{VERSION_SELECT} WHERE asset_id = $1 ORDER BY version DESC"
        ))
        .bind(asset_id)
        .fetch_all(pool)
        .await
    }

    /// Obtiene una versión concreta por número.
    pub async fn get_version(
        pool: &PgPool,
        asset_id: &str,
        version: i32,
    ) -> Result<Option<GameAssetVersionRow>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetVersionRow>(&format!(
            "{VERSION_SELECT} WHERE asset_id = $1 AND version = $2"
        ))
        .bind(asset_id)
        .bind(version)
        .fetch_optional(pool)
        .await
    }

    /// Versión activa de un asset para el contrato público (editor/runtime).
    pub async fn get_active_version(
        pool: &PgPool,
        asset_id: &str,
    ) -> Result<Option<GameAssetVersionRow>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetVersionRow>(&format!(
            "{VERSION_SELECT} WHERE asset_id = $1 AND is_active = TRUE LIMIT 1"
        ))
        .bind(asset_id)
        .fetch_optional(pool)
        .await
    }

    /// Crea la siguiente versión de un asset dentro de la transacción del
    /// servicio (advisory lock por asset para numerar sin carreras).
    /// [297A-72] El GLB ya fue almacenado por hash y validado; aquí solo se
    /// registra la metadata inmutable de la versión.
    pub async fn create_version(
        tx: &mut Transaction<'_, Postgres>,
        asset_id: &str,
        content_hash: &str,
        storage_path: &str,
        byte_size: i32,
        category: &str,
        created_by: uuid::Uuid,
    ) -> Result<GameAssetVersionRow, sqlx::Error> {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
            .bind(asset_id)
            .execute(&mut **tx)
            .await?;

        let next_version: i32 = sqlx::query_scalar(
            "SELECT COALESCE(MAX(version), 0) + 1
             FROM game_asset_versions
             WHERE asset_id = $1",
        )
        .bind(asset_id)
        .fetch_one(&mut **tx)
        .await?;

        sqlx::query_as::<_, GameAssetVersionRow>(
            "INSERT INTO game_asset_versions
                (asset_id, version, content_hash, storage_path, byte_size, kind, category, created_by)
             VALUES ($1, $2, $3, $4, $5, 'glb', $6, $7)
             RETURNING id, asset_id, version, content_hash, storage_path,
                       byte_size, kind, category, proxy, scale, is_active, created_at",
        )
        .bind(asset_id)
        .bind(next_version)
        .bind(content_hash)
        .bind(storage_path)
        .bind(byte_size)
        .bind(category)
        .bind(created_by)
        .fetch_one(&mut **tx)
        .await
    }

    /// Actualiza proxy/scale de una versión AÚN NO ACTIVA; `None` si la
    /// versión no existe o ya está activa (inmutable).
    pub async fn update_version_metadata(
        tx: &mut Transaction<'_, Postgres>,
        asset_id: &str,
        version: i32,
        proxy: Option<serde_json::Value>,
        scale: f64,
    ) -> Result<Option<GameAssetVersionRow>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetVersionRow>(
            "UPDATE game_asset_versions
             SET proxy = $3, scale = $4
             WHERE asset_id = $1 AND version = $2 AND is_active = FALSE
             RETURNING id, asset_id, version, content_hash, storage_path,
                       byte_size, kind, category, proxy, scale, is_active, created_at",
        )
        .bind(asset_id)
        .bind(version)
        .bind(proxy)
        .bind(scale)
        .fetch_optional(&mut **tx)
        .await
    }

    /// Activa una versión y desactiva el resto dentro de la transacción.
    /// `None` si la versión no existe.
    pub async fn activate_version(
        tx: &mut Transaction<'_, Postgres>,
        asset_id: &str,
        version: i32,
    ) -> Result<Option<GameAssetVersionRow>, sqlx::Error> {
        sqlx::query(
            "UPDATE game_asset_versions
             SET is_active = FALSE
             WHERE asset_id = $1 AND is_active = TRUE",
        )
        .bind(asset_id)
        .execute(&mut **tx)
        .await?;

        sqlx::query_as::<_, GameAssetVersionRow>(
            "UPDATE game_asset_versions
             SET is_active = TRUE
             WHERE asset_id = $1 AND version = $2
             RETURNING id, asset_id, version, content_hash, storage_path,
                       byte_size, kind, category, proxy, scale, is_active, created_at",
        )
        .bind(asset_id)
        .bind(version)
        .fetch_optional(&mut **tx)
        .await
    }

    /// [297A-60] Las mutaciones se ejecutan dentro de una transacción para que
    /// el evento de auditoría se escriba (o se descarte) con el mismo cambio.
    pub async fn create(
        tx: &mut Transaction<'_, Postgres>,
        id: &str,
        display_name: &str,
        category: &str,
    ) -> Result<GameAssetDefinition, sqlx::Error> {
        sqlx::query_as::<_, GameAssetDefinition>(
            "INSERT INTO game_assets (id, display_name, category)
             VALUES ($1, $2, $3)
             RETURNING id, display_name, category, is_active, created_at",
        )
        .bind(id)
        .bind(display_name)
        .bind(category)
        .fetch_one(&mut **tx)
        .await
    }

    /// `None` significa que el id no existe en el catálogo.
    pub async fn update(
        tx: &mut Transaction<'_, Postgres>,
        id: &str,
        display_name: &str,
        category: &str,
        is_active: bool,
    ) -> Result<Option<GameAssetDefinition>, sqlx::Error> {
        sqlx::query_as::<_, GameAssetDefinition>(
            "UPDATE game_assets
             SET display_name = $2, category = $3, is_active = $4
             WHERE id = $1
             RETURNING id, display_name, category, is_active, created_at",
        )
        .bind(id)
        .bind(display_name)
        .bind(category)
        .bind(is_active)
        .fetch_optional(&mut **tx)
        .await
    }
}
