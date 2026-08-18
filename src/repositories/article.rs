use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::article::Article;

pub struct ArticleRepository;

pub struct CreateArticleParams<'a> {
    pub title: &'a str,
    pub slug: &'a str,
    pub content: &'a serde_json::Value,
    pub excerpt: &'a str,
    pub cover_image: Option<&'a str>,
    pub status: &'a str,
    pub is_pinned: bool,
}

pub struct UpdateArticleParams<'a> {
    pub title: Option<&'a str>,
    pub content: Option<&'a serde_json::Value>,
    pub excerpt: Option<&'a str>,
    pub cover_image: Option<&'a str>,
    pub status: Option<&'a str>,
    pub is_pinned: Option<bool>,
}

impl ArticleRepository {
    /// [297A-10] Crear artículo dentro de una transacción (el service genera el ID y lo comparte con el resource envelope).
    pub async fn create(
        conn: &mut sqlx::PgConnection,
        id: Uuid,
        params: CreateArticleParams<'_>,
    ) -> Result<Article, sqlx::Error> {
        let published_at = if params.status == "published" {
            Some(chrono::Utc::now())
        } else {
            None
        };

        sqlx::query_as::<_, Article>(
            "INSERT INTO articles (id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) \
             RETURNING id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at",
        )
        .bind(id)
        .bind(params.title)
        .bind(params.slug)
        .bind(params.content)
        .bind(params.excerpt)
        .bind(params.cover_image)
        .bind(params.status)
        .bind(params.is_pinned)
        .bind(published_at)
        .fetch_one(&mut *conn)
        .await
    }

    /// [028A-12] Las queries por defecto excluyen los artículos en la
    /// papelera (trashed); la Papelera admin usa `list_trashed`.
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Article>, sqlx::Error> {
        sqlx::query_as::<_, Article>(
            "SELECT id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at \
             FROM articles WHERE id = $1 AND trashed = FALSE",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_slug(pool: &PgPool, slug: &str) -> Result<Option<Article>, sqlx::Error> {
        sqlx::query_as::<_, Article>(
            "SELECT id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at \
             FROM articles WHERE slug = $1 AND trashed = FALSE",
        )
        .bind(slug)
        .fetch_optional(pool)
        .await
    }

    pub async fn list(
        pool: &PgPool,
        status: Option<&str>,
        page: i64,
        per_page: i64,
    ) -> Result<(Vec<Article>, i64), sqlx::Error> {
        let offset = (page - 1) * per_page;

        let articles = if let Some(status_filter) = status {
            sqlx::query_as::<_, Article>(
                "SELECT id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at \
                 FROM articles WHERE status = $1 AND trashed = FALSE \
                 ORDER BY is_pinned DESC, COALESCE(published_at, created_at) DESC \
                 LIMIT $2 OFFSET $3",
            )
            .bind(status_filter)
            .bind(per_page)
            .bind(offset)
            .fetch_all(pool)
            .await?
        } else {
            sqlx::query_as::<_, Article>(
                "SELECT id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at \
                 FROM articles WHERE trashed = FALSE \
                 ORDER BY is_pinned DESC, COALESCE(published_at, created_at) DESC \
                 LIMIT $1 OFFSET $2",
            )
            .bind(per_page)
            .bind(offset)
            .fetch_all(pool)
            .await?
        };

        let (total,): (i64,) = if let Some(status_filter) = status {
            sqlx::query_as("SELECT COUNT(*) FROM articles WHERE status = $1 AND trashed = FALSE")
                .bind(status_filter)
                .fetch_one(pool)
                .await?
        } else {
            sqlx::query_as("SELECT COUNT(*) FROM articles WHERE trashed = FALSE")
                .fetch_one(pool)
                .await?
        };

        Ok((articles, total))
    }

    /// [038A-2] Update dentro de una transacción (el service sincroniza el
    /// envelope `resources` en la misma tx al publicar/despublicar).
    pub async fn update(
        conn: &mut sqlx::PgConnection,
        id: Uuid,
        params: UpdateArticleParams<'_>,
    ) -> Result<Option<Article>, sqlx::Error> {
        /* Si se cambia a published y no tenia published_at, setearlo */
        let current_row: Option<(String, Option<chrono::DateTime<Utc>>)> = sqlx::query_as(
            "SELECT status, published_at FROM articles WHERE id = $1 AND trashed = FALSE",
        )
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
        let Some((current_status, current_published_at)) = current_row else {
            return Ok(None);
        };

        let new_status = params.status.unwrap_or(&current_status);
        /* [297A-14] Trazabilidad editorial: published_at refleja el momento de
         * la publicación ACTUAL. Al publicar se fija NOW() (sea la primera o
         * una republicación), al despublicar se limpia — un draft nunca
         * arrastra una fecha de publicación vieja ni la muestra como viva. */
        let published_at = if new_status == "published" {
            Some(chrono::Utc::now())
        } else {
            None
        };

        sqlx::query_as::<_, Article>(
            "UPDATE articles SET \
                title = COALESCE($1, title), \
                content = COALESCE($2, content), \
                excerpt = COALESCE($3, excerpt), \
                cover_image = COALESCE($4, cover_image), \
                status = COALESCE($5, status), \
                is_pinned = COALESCE($6, is_pinned), \
                published_at = $7, \
                updated_at = NOW() \
             WHERE id = $8 AND trashed = FALSE \
             RETURNING id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at",
        )
        .bind(params.title)
        .bind(params.content)
        .bind(params.excerpt)
        .bind(params.cover_image)
        .bind(params.status)
        .bind(params.is_pinned)
        .bind(published_at)
        .bind(id)
        .fetch_optional(&mut *conn)
        .await
    }

    /// [028A-12] Soft delete: marca la papelera sin borrar la fila. La fila
    /// del envelope `resources` se marca en el service (misma transacción).
    pub async fn delete(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE articles SET trashed = TRUE, deleted_at = NOW(), updated_at = NOW() \
             WHERE id = $1 AND trashed = FALSE",
        )
        .bind(id)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    /// [028A-12] Lista paginada de la papelera (más recientes primero).
    pub async fn list_trashed(
        pool: &PgPool,
        page: i64,
        per_page: i64,
    ) -> Result<(Vec<Article>, i64), sqlx::Error> {
        let offset = (page - 1) * per_page;
        let articles = sqlx::query_as::<_, Article>(
            "SELECT id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at \
             FROM articles WHERE trashed = TRUE \
             ORDER BY deleted_at DESC \
             LIMIT $1 OFFSET $2",
        )
        .bind(per_page)
        .bind(offset)
        .fetch_all(pool)
        .await?;
        let (total,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM articles WHERE trashed = TRUE")
            .fetch_one(pool)
            .await?;
        Ok((articles, total))
    }

    /// [028A-12] Restaura un artículo de la papelera (idempotente).
    pub async fn restore(conn: &mut sqlx::PgConnection, id: Uuid) -> Result<bool, sqlx::Error> {
        let result = sqlx::query(
            "UPDATE articles SET trashed = FALSE, deleted_at = NULL, updated_at = NOW() \
             WHERE id = $1 AND trashed = TRUE",
        )
        .bind(id)
        .execute(&mut *conn)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn slug_exists(pool: &PgPool, slug: &str) -> Result<bool, sqlx::Error> {
        let (exists,): (bool,) = sqlx::query_as(
            "SELECT EXISTS(SELECT 1 FROM articles WHERE slug = $1 AND trashed = FALSE)",
        )
        .bind(slug)
        .fetch_one(pool)
        .await?;
        Ok(exists)
    }

    /// [297A-10] Buscar artículo por alias de sistema (e.g. 'about').
    pub async fn find_by_system_alias(
        pool: &PgPool,
        alias: &str,
    ) -> Result<Option<Article>, sqlx::Error> {
        sqlx::query_as::<_, Article>(
            "SELECT id, title, slug, content, excerpt, cover_image, status, is_pinned, published_at, created_at, updated_at, system_alias, trashed, deleted_at \
             FROM articles WHERE system_alias = $1 AND trashed = FALSE",
        )
        .bind(alias)
        .fetch_optional(pool)
        .await
    }

    /// [297A-10] Asignar alias de sistema a un artículo (admin).
    pub async fn set_system_alias(
        pool: &PgPool,
        id: Uuid,
        alias: Option<&str>,
    ) -> Result<bool, sqlx::Error> {
        let result =
            sqlx::query("UPDATE articles SET system_alias = $1, updated_at = NOW() WHERE id = $2")
                .bind(alias)
                .bind(id)
                .execute(pool)
                .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Listar slugs y fechas de artículos publicados (para sitemap)
    pub async fn list_published_slugs(
        pool: &PgPool,
    ) -> Result<Vec<(String, chrono::DateTime<chrono::Utc>)>, sqlx::Error> {
        sqlx::query_as::<_, (String, chrono::DateTime<chrono::Utc>)>(
            "SELECT slug, COALESCE(published_at, created_at) as date \
             FROM articles WHERE status = 'published' ORDER BY published_at DESC",
        )
        .fetch_all(pool)
        .await
    }
}
