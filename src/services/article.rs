use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::article::{
    Article, CreateArticleRequest, PaginatedArticles, UpdateArticleRequest,
};
use crate::models::resource::{
    CreateResourceParams, EditorialState, ResourceKind, VisibilityState,
};
use crate::repositories::article::{CreateArticleParams, UpdateArticleParams};
use crate::repositories::resource_repo::ResourceRepository;
use crate::repositories::ArticleRepository;

pub struct ArticleService;

impl ArticleService {
    /// [297A-10] Crear artículo con resource envelope en transacción.
    #[allow(clippy::explicit_auto_deref)]
    pub async fn create(pool: &PgPool, req: CreateArticleRequest) -> Result<Article, AppError> {
        let slug = Self::generate_slug(pool, &req.title).await?;
        let id = uuid::Uuid::new_v4();

        let mut tx = pool.begin().await?;

        /* 1. Insertar resource envelope */
        ResourceRepository::create(
            &mut *tx,
            CreateResourceParams {
                id,
                kind: ResourceKind::Article,
                title: &req.title,
                editorial: EditorialState::Draft,
                visibility: VisibilityState::Private,
            },
        )
        .await?;

        /* 2. Insertar artículo */
        let article = ArticleRepository::create(
            &mut *tx,
            id,
            CreateArticleParams {
                title: &req.title,
                slug: &slug,
                content: &req.content,
                excerpt: &req.excerpt,
                cover_image: req.cover_image.as_deref(),
                status: &req.status,
                is_pinned: req.is_pinned,
            },
        )
        .await?;

        tx.commit().await?;
        Ok(article)
    }

    /// Buscar artículo por ID (admin — incluye borradores)
    pub async fn get(pool: &PgPool, id: Uuid) -> Result<Article, AppError> {
        ArticleRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))
    }

    /// Buscar artículo publicado por ID (público)
    pub async fn get_published(pool: &PgPool, id: Uuid) -> Result<Article, AppError> {
        let article = ArticleRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))?;

        if article.status != "published" {
            return Err(AppError::NotFound("Articulo no encontrado".into()));
        }

        Ok(article)
    }

    /// Buscar artículo por slug — solo artículos publicados para endpoints públicos
    pub async fn get_by_slug(pool: &PgPool, slug: &str) -> Result<Article, AppError> {
        let article = ArticleRepository::find_by_slug(pool, slug)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))?;

        /* [297A-7] Endpoints públicos no exponen borradores */
        if article.status != "published" {
            return Err(AppError::NotFound("Articulo no encontrado".into()));
        }

        Ok(article)
    }

    /// Buscar artículo por slug para admin — incluye borradores
    pub async fn get_by_slug_admin(pool: &PgPool, slug: &str) -> Result<Article, AppError> {
        ArticleRepository::find_by_slug(pool, slug)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))
    }

    /// [297A-10] Buscar artículo publicado por alias de sistema (público).
    pub async fn get_by_alias(pool: &PgPool, alias: &str) -> Result<Article, AppError> {
        let article = ArticleRepository::find_by_system_alias(pool, alias)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))?;
        if article.status != "published" {
            return Err(AppError::NotFound("Articulo no encontrado".into()));
        }
        Ok(article)
    }

    /// [297A-10] Buscar artículo por alias de sistema (admin — incluye borradores).
    pub async fn get_by_alias_admin(pool: &PgPool, alias: &str) -> Result<Article, AppError> {
        ArticleRepository::find_by_system_alias(pool, alias)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))
    }

    /// [297A-10] Asignar alias de sistema a un artículo (admin).
    /// Verifica que el alias no esté en uso por otro artículo.
    pub async fn set_alias(pool: &PgPool, id: Uuid, alias: Option<&str>) -> Result<(), AppError> {
        /* Verificar unicidad si se asigna un alias */
        if let Some(a) = alias {
            if let Some(existing) = ArticleRepository::find_by_system_alias(pool, a).await? {
                if existing.id != id {
                    return Err(AppError::Conflict(format!(
                        "El alias '{}' ya está asignado al artículo '{}'",
                        a, existing.title
                    )));
                }
            }
        }
        if !ArticleRepository::set_system_alias(pool, id, alias).await? {
            return Err(AppError::NotFound("Articulo no encontrado".into()));
        }
        Ok(())
    }

    pub async fn list(
        pool: &PgPool,
        status: Option<&str>,
        page: i64,
        per_page: i64,
    ) -> Result<PaginatedArticles, AppError> {
        let per_page = per_page.clamp(1, 100);
        let page = page.max(1);
        let (articles, total) = ArticleRepository::list(pool, status, page, per_page).await?;

        Ok(PaginatedArticles {
            items: articles,
            total,
            page,
            per_page,
        })
    }

    #[allow(clippy::explicit_auto_deref)]
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        req: UpdateArticleRequest,
    ) -> Result<Article, AppError> {
        /* [038A-2] El status legacy ('published'/'draft') sincroniza el envelope
         * `resources` en la misma transacción: publicar => ready/public,
         * despublicar => draft/private. None (autosave sin tocar status)
         * conserva el editorial/visibilidad actuales. Sin esta sincronización
         * el contenido publicado no calificaría para `find_public_content`
         * (release efectiva) ni para `collect_broken_resource_refs`. */
        let (is_visible, editorial) = match req.status.as_deref() {
            Some("published") => (Some(true), Some(EditorialState::Ready)),
            Some(_) => (Some(false), Some(EditorialState::Draft)),
            None => (None, None),
        };

        let mut tx = pool.begin().await?;
        let article = ArticleRepository::update(
            &mut *tx,
            id,
            UpdateArticleParams {
                title: req.title.as_deref(),
                content: req.content.as_ref(),
                excerpt: req.excerpt.as_deref(),
                cover_image: req.cover_image.as_deref(),
                status: req.status.as_deref(),
                is_pinned: req.is_pinned,
            },
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))?;

        let envelope_updated = ResourceRepository::update_resource_metadata(
            &mut *tx,
            id,
            ResourceKind::Article,
            req.title.as_deref(),
            is_visible,
            editorial,
        )
        .await?;
        if !envelope_updated {
            return Err(AppError::NotFound(
                "Envelope del articulo no encontrado".into(),
            ));
        }

        tx.commit().await?;
        Ok(article)
    }

    /// [028A-12] Soft delete transaccional: marca el artículo y su envelope
    /// `resources` (lifecycle = trashed) juntos; la fila se conserva para
    /// restaurarla desde la Papelera admin.
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
        let mut tx = pool.begin().await?;
        if !ArticleRepository::delete(&mut tx, id).await? {
            return Err(AppError::NotFound("Articulo no encontrado".into()));
        }
        ResourceRepository::soft_delete_kind_tx(&mut tx, id, ResourceKind::Article).await?;
        tx.commit().await?;
        Ok(())
    }

    /// [028A-12] Lista paginada de la papelera (admin).
    pub async fn list_trashed(
        pool: &PgPool,
        page: i64,
        per_page: i64,
    ) -> Result<PaginatedArticles, AppError> {
        let per_page = per_page.clamp(1, 100);
        let page = page.max(1);
        let (articles, total) = ArticleRepository::list_trashed(pool, page, per_page).await?;
        Ok(PaginatedArticles {
            items: articles,
            total,
            page,
            per_page,
        })
    }

    /// [028A-12] Restaura el artículo y su envelope `resources` en la misma
    /// transacción; devuelve el artículo restaurado.
    pub async fn restore(pool: &PgPool, id: Uuid) -> Result<Article, AppError> {
        let mut tx = pool.begin().await?;
        if !ArticleRepository::restore(&mut tx, id).await? {
            return Err(AppError::NotFound("Articulo no encontrado".into()));
        }
        ResourceRepository::restore_kind_tx(&mut tx, id, ResourceKind::Article).await?;
        tx.commit().await?;
        ArticleRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::NotFound("Articulo no encontrado".into()))
    }

    /// Genera un slug URL-safe unico a partir del titulo
    async fn generate_slug(pool: &PgPool, title: &str) -> Result<String, AppError> {
        let base = title
            .to_lowercase()
            .chars()
            .map(|c| {
                if c.is_alphanumeric() || c == '-' {
                    c
                } else {
                    '-'
                }
            })
            .collect::<String>()
            .split('-')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("-");

        let mut slug = base.clone();
        let mut counter = 1;

        while ArticleRepository::slug_exists(pool, &slug).await? {
            slug = format!("{base}-{counter}");
            counter += 1;
        }

        Ok(slug)
    }
}
