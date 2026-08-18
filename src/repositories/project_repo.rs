use sqlx::PgPool;
use uuid::Uuid;

use crate::models::project::Project;

pub struct ProjectRepository;

/** Parámetros tipados para crear un proyecto. */
pub struct ProjectCreateParams<'a> {
    pub id: Uuid,
    pub title: &'a str,
    pub description: &'a str,
    pub url: Option<&'a str>,
    pub cover_image: Option<&'a str>,
    pub sort_order: i32,
    pub is_visible: bool,
}

/** Parámetros tipados para una actualización parcial de proyecto. */
pub struct ProjectUpdateParams<'a> {
    pub id: Uuid,
    pub title: Option<&'a str>,
    pub description: Option<&'a str>,
    pub url: Option<&'a str>,
    pub clear_url: bool,
    pub cover_image: Option<&'a str>,
    pub clear_cover: bool,
    pub sort_order: Option<i32>,
    pub is_visible: Option<bool>,
}

impl ProjectRepository {
    /// [297A-10] Crear proyecto dentro de una transacción.
    pub async fn create(
        conn: &mut sqlx::PgConnection,
        params: ProjectCreateParams<'_>,
    ) -> Result<Project, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "INSERT INTO projects (id, title, description, url, cover_image, sort_order, is_visible) \
             VALUES ($1, $2, $3, $4, $5, $6, $7) \
             RETURNING id, title, description, url, cover_image, sort_order, is_visible, created_at",
        )
        .bind(params.id)
        .bind(params.title)
        .bind(params.description)
        .bind(params.url)
        .bind(params.cover_image)
        .bind(params.sort_order)
        .bind(params.is_visible)
        .fetch_one(&mut *conn)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT p.id, p.title, p.description, p.url, p.cover_image, p.sort_order, p.is_visible, p.created_at \
             FROM projects p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE p.id = $1 AND r.lifecycle = 'active'::lifecycle_state",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn list_all(pool: &PgPool) -> Result<Vec<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT p.id, p.title, p.description, p.url, p.cover_image, p.sort_order, p.is_visible, p.created_at \
             FROM projects p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE r.lifecycle = 'active'::lifecycle_state \
             ORDER BY p.sort_order ASC, p.created_at DESC",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn list_visible(pool: &PgPool) -> Result<Vec<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "SELECT p.id, p.title, p.description, p.url, p.cover_image, p.sort_order, p.is_visible, p.created_at \
             FROM projects p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE p.is_visible = true \
               AND r.editorial = 'ready'::editorial_state \
               AND r.visibility = 'public'::visibility_state \
               AND r.lifecycle = 'active'::lifecycle_state \
             ORDER BY p.sort_order ASC, p.created_at DESC",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update(
        conn: &mut sqlx::PgConnection,
        params: ProjectUpdateParams<'_>,
    ) -> Result<Option<Project>, sqlx::Error> {
        sqlx::query_as::<_, Project>(
            "UPDATE projects SET \
                title = COALESCE($1, title), \
                description = COALESCE($2, description), \
                url = CASE WHEN $4 THEN NULL WHEN $3 IS NOT NULL THEN $3 ELSE url END, \
                cover_image = CASE WHEN $6 THEN NULL WHEN $5 IS NOT NULL THEN $5 ELSE cover_image END, \
                sort_order = COALESCE($7, sort_order), \
                is_visible = COALESCE($8, is_visible) \
             WHERE id = $9 \
             RETURNING id, title, description, url, cover_image, sort_order, is_visible, created_at",
        )
        .bind(params.title)
        .bind(params.description)
        .bind(params.url)
        .bind(params.clear_url)
        .bind(params.cover_image)
        .bind(params.clear_cover)
        .bind(params.sort_order)
        .bind(params.is_visible)
        .bind(params.id)
        .fetch_optional(&mut *conn)
        .await
    }
}
