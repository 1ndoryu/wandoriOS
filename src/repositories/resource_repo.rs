use sqlx::PgPool;
use uuid::Uuid;

use crate::models::resource::{
    CreateResourceParams, EditorialState, PublicContent, Resource, ResourceKind, VisibilityState,
};

pub struct ResourceRepository;

impl ResourceRepository {
    /// Insertar un recurso envelope (llamar dentro de transacción).
    #[allow(clippy::explicit_auto_deref)]
    pub async fn create(
        tx: &mut sqlx::PgConnection,
        params: CreateResourceParams<'_>,
    ) -> Result<Resource, sqlx::Error> {
        sqlx::query_as::<_, Resource>(
            "INSERT INTO resources (id, kind, title, editorial, visibility, lifecycle) \
             VALUES ($1, $2, $3, $4, $5, 'active') \
             RETURNING id, kind, title, editorial, visibility, lifecycle, deleted_at, created_at, updated_at",
        )
        .bind(params.id)
        .bind(params.kind)
        .bind(params.title)
        .bind(params.editorial)
        .bind(params.visibility)
        .fetch_one(&mut *tx)
        .await
    }

    /// Buscar recurso por ID.
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Resource>, sqlx::Error> {
        sqlx::query_as::<_, Resource>(
            "SELECT id, kind, title, editorial, visibility, lifecycle, deleted_at, created_at, updated_at \
             FROM resources WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Actualizar editorial/visibility de un recurso.
    pub async fn update_state(
        pool: &PgPool,
        id: Uuid,
        editorial: Option<EditorialState>,
        visibility: Option<VisibilityState>,
    ) -> Result<Option<Resource>, sqlx::Error> {
        sqlx::query_as::<_, Resource>(
            "UPDATE resources SET \
                editorial = COALESCE($1, editorial), \
                visibility = COALESCE($2, visibility), \
                updated_at = NOW() \
             WHERE id = $3 \
             RETURNING id, kind, title, editorial, visibility, lifecycle, deleted_at, created_at, updated_at",
        )
        .bind(editorial)
        .bind(visibility)
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Sincronizar título, visibilidad y estado editorial del envelope dentro de su
    /// transacción. [018A-83] El estado editorial se sincroniza con la visibilidad
    /// pública del tipo (proyectos): visible => ready, oculto => draft. Los tipos
    /// que no publican via visibilidad pasan None y conservan su editorial.
    pub async fn update_resource_metadata(
        conn: &mut sqlx::PgConnection,
        id: Uuid,
        kind: ResourceKind,
        title: Option<&str>,
        is_visible: Option<bool>,
        editorial: Option<EditorialState>,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE resources SET \
                title = COALESCE($1, title), \
                visibility = CASE \
                    WHEN $2 IS NULL THEN visibility \
                    WHEN $2 THEN 'public'::visibility_state \
                    ELSE 'private'::visibility_state \
                END, \
                editorial = COALESCE($5, editorial), \
                updated_at = NOW() \
             WHERE id = $3 AND kind = $4",
        )
        .bind(title)
        .bind(is_visible)
        .bind(id)
        .bind(kind)
        .bind(editorial)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft delete dentro de una transacción: conserva el envelope para restauración.
    pub async fn soft_delete_kind_tx(
        conn: &mut sqlx::PgConnection,
        id: Uuid,
        kind: ResourceKind,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE resources SET lifecycle = 'trashed', deleted_at = NOW(), updated_at = NOW() \
             WHERE id = $1 AND kind = $2 AND lifecycle = 'active'",
        )
        .bind(id)
        .bind(kind)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Soft delete: mover a trashed.
    pub async fn soft_delete(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE resources SET lifecycle = 'trashed', deleted_at = NOW(), updated_at = NOW() \
             WHERE id = $1 AND lifecycle = 'active'",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Restaurar de trashed a active.
    pub async fn restore(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE resources SET lifecycle = 'active', deleted_at = NULL, updated_at = NOW() \
             WHERE id = $1 AND lifecycle = 'trashed'",
        )
        .bind(id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// [028A-12] Restaurar el envelope dentro de una transacción (espejo de
    /// `soft_delete_kind_tx`): usado por el restore de artículos para que la
    /// fila de `resources` y el artículo vuelvan juntos.
    pub async fn restore_kind_tx(
        conn: &mut sqlx::PgConnection,
        id: Uuid,
        kind: ResourceKind,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE resources SET lifecycle = 'active', deleted_at = NULL, updated_at = NOW() \
             WHERE id = $1 AND kind = $2 AND lifecycle = 'trashed'",
        )
        .bind(id)
        .bind(kind)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// [297A-14 F4] Restaurar de trashed a active verificando el kind.
    /// Evita restaurar un recurso de otro tipo mediante el endpoint de media.
    pub async fn restore_kind(
        pool: &PgPool,
        id: Uuid,
        kind: ResourceKind,
    ) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE resources SET lifecycle = 'active', deleted_at = NULL, updated_at = NOW() \
             WHERE id = $1 AND kind = $2 AND lifecycle = 'trashed'",
        )
        .bind(id)
        .bind(kind)
        .execute(pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// [028A-11] Devuelve los ids que NO son publicables: no existen o no están
    /// `active + ready + public`. Usado por `WorkspaceService::publish` para
    /// rechazar releases con refs de recursos rotos (422 con detalle).
    pub async fn find_broken_public_refs(
        pool: &PgPool,
        ids: &[Uuid],
    ) -> Result<Vec<Uuid>, sqlx::Error> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let public_ids: Vec<Uuid> = sqlx::query_scalar(
            "SELECT id FROM resources \
             WHERE id = ANY($1) \
               AND lifecycle = 'active' AND editorial = 'ready' AND visibility = 'public'",
        )
        .bind(ids)
        .fetch_all(pool)
        .await?;
        Ok(ids
            .iter()
            .filter(|id| !public_ids.contains(id))
            .copied()
            .collect())
    }

    /// [038A-2] Contenido publicado que el escritorio debe mostrar SIEMPRE,
    /// cualquier versión de release activa: artículos y medios con
    /// `editorial='ready' AND visibility='public' AND lifecycle='active'`.
    /// JOIN con `articles` (slug) y `media` (`file_type`) para que
    /// `materialize_content_nodes` pueda construir los nodos con el contrato
    /// del frontend (publicLocator reader / subcarpeta de Documentos). Es la
    /// fuente de la release efectiva: el contenido no depende del overlay
    /// local del admin ni de la foto de la release; solo desaparece al
    /// eliminarlo de verdad (trashed) o despublicarlo.
    pub async fn find_public_content(pool: &PgPool) -> Result<Vec<PublicContent>, sqlx::Error> {
        sqlx::query_as::<_, PublicContent>(
            "SELECT r.id, r.kind, r.title, a.slug, m.file_type \
             FROM resources r \
             LEFT JOIN articles a ON a.id = r.id AND r.kind = 'article' \
             LEFT JOIN media m ON m.id = r.id AND r.kind = 'media' \
             WHERE r.kind IN ('article', 'media') \
               AND r.lifecycle = 'active' AND r.editorial = 'ready' AND r.visibility = 'public' \
             ORDER BY r.updated_at DESC",
        )
        .fetch_all(pool)
        .await
    }
}
