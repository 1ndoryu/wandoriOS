// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
use sqlx::{PgPool, QueryBuilder};
use uuid::Uuid;

use crate::models::media::Media;

pub struct MediaRepository;

/// Columnas compartidas de los listados (m = media, join resources r).
const LIST_COLS: &str = "m.id, m.article_id, m.file_path, m.file_type, m.file_size, m.alt_text, m.created_at, m.asset_state";

impl MediaRepository {
    /// [297A-10] Crear media dentro de una transacción.
    pub async fn create(
        conn: &mut sqlx::PgConnection,
        id: Uuid,
        article_id: Option<Uuid>,
        file_path: &str,
        file_type: &str,
        file_size: i64,
        alt_text: &str,
    ) -> Result<Media, sqlx::Error> {
        sqlx::query_as::<_, Media>(
            "INSERT INTO media (id, article_id, file_path, file_type, file_size, alt_text) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             RETURNING id, article_id, file_path, file_type, file_size, alt_text, created_at, asset_state",
        )
        .bind(id)
        .bind(article_id)
        .bind(file_path)
        .bind(file_type)
        .bind(file_size)
        .bind(alt_text)
        .fetch_one(&mut *conn)
        .await
    }

    /// Buscar un asset público ya procesado. El join con `resources` evita
    /// servir media privada, en borrador o enviada a la papelera aunque se
    /// conozca su UUID.
    pub async fn find_public_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Media>, sqlx::Error> {
        sqlx::query_as::<_, Media>(&format!(
            "SELECT {LIST_COLS} FROM media m \
             INNER JOIN resources r ON r.id = m.id \
             WHERE m.id = $1 \
               AND r.kind = 'media'::resource_kind \
               AND r.lifecycle = 'active'::lifecycle_state \
               AND r.visibility = 'public'::visibility_state \
               AND m.asset_state = 'clean'::asset_processing_state"
        ))
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Buscar un asset activo para la vista administrativa. El storage sigue
    /// siendo interno; la ruta solo se consume dentro del handler de preview.
    pub async fn find_admin_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Media>, sqlx::Error> {
        sqlx::query_as::<_, Media>(&format!(
            "SELECT {LIST_COLS} FROM media m \
             INNER JOIN resources r ON r.id = m.id \
             WHERE m.id = $1 \
               AND r.kind = 'media'::resource_kind \
               AND r.lifecycle = 'active'::lifecycle_state"
        ))
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Listado público: solo envelope active + public + asset clean.
    /// [297A-14 F4] El público nunca recibe processing/rejected/private/trashed.
    pub async fn list_public(
        pool: &PgPool,
        file_type: Option<&str>,
        article_id: Option<Uuid>,
    ) -> Result<Vec<Media>, sqlx::Error> {
        let mut qb = QueryBuilder::new(format!(
            "SELECT {LIST_COLS} FROM media m \
             INNER JOIN resources r ON r.id = m.id \
             WHERE r.lifecycle = 'active'::lifecycle_state \
               AND r.visibility = 'public'::visibility_state \
               AND m.asset_state = 'clean'::asset_processing_state"
        ));
        if let Some(ft) = file_type {
            qb.push(" AND m.file_type = ").push_bind(ft);
        }
        if let Some(aid) = article_id {
            qb.push(" AND m.article_id = ").push_bind(aid);
        }
        qb.push(" ORDER BY m.created_at DESC");
        qb.build_query_as::<Media>().fetch_all(pool).await
    }

    /// Listado admin: envelope activo, incluye processing/rejected.
    pub async fn list_admin(
        pool: &PgPool,
        file_type: Option<&str>,
        article_id: Option<Uuid>,
        asset_state: Option<&str>,
    ) -> Result<Vec<Media>, sqlx::Error> {
        let mut qb = QueryBuilder::new(format!(
            "SELECT {LIST_COLS} FROM media m \
             INNER JOIN resources r ON r.id = m.id \
             WHERE r.lifecycle = 'active'::lifecycle_state"
        ));
        if let Some(ft) = file_type {
            qb.push(" AND m.file_type = ").push_bind(ft);
        }
        if let Some(aid) = article_id {
            qb.push(" AND m.article_id = ").push_bind(aid);
        }
        if let Some(state) = asset_state {
            qb.push(" AND m.asset_state = ")
                .push_bind(state)
                .push("::asset_processing_state");
        }
        qb.push(" ORDER BY m.created_at DESC");
        qb.build_query_as::<Media>().fetch_all(pool).await
    }

    /// Listado de la papelera: envelope trashed (restauración).
    pub async fn list_trashed(pool: &PgPool) -> Result<Vec<Media>, sqlx::Error> {
        sqlx::query_as::<_, Media>(&format!(
            "SELECT {LIST_COLS} FROM media m \
             INNER JOIN resources r ON r.id = m.id \
             WHERE r.lifecycle = 'trashed'::lifecycle_state \
             ORDER BY m.created_at DESC"
        ))
        .fetch_all(pool)
        .await
    }
}
