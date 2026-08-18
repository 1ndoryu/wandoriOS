use sqlx::PgPool;
use uuid::Uuid;

use crate::errors::AppError;
use crate::models::product::{CreateProductRequest, Product, UpdateProductRequest};
use crate::models::resource::{
    CreateResourceParams, EditorialState, ResourceKind, VisibilityState,
};
use crate::repositories::product_repo::{
    ProductCreateParams, ProductRepository, ProductUpdateParams,
};
use crate::repositories::resource_repo::ResourceRepository;

pub struct ProductService;

impl ProductService {
    /// [297A-10] Crear producto con resource envelope en transacción.
    /// [297A-14] Nace inactivo + private por defecto; editorial queda independiente.
    pub async fn create(pool: &PgPool, req: CreateProductRequest) -> Result<Product, AppError> {
        let id = Uuid::new_v4();

        let mut tx = pool.begin().await?;

        /* 1. Insertar resource envelope (producto: draft + private/inactive por defecto) */
        ResourceRepository::create(
            &mut tx,
            CreateResourceParams {
                id,
                kind: ResourceKind::Product,
                title: &req.name,
                editorial: EditorialState::Draft,
                visibility: if req.is_active {
                    VisibilityState::Public
                } else {
                    VisibilityState::Private
                },
            },
        )
        .await?;

        /* 2. Insertar producto */
        let product = ProductRepository::create(
            &mut tx,
            ProductCreateParams {
                id,
                article_id: req.article_id,
                name: &req.name,
                description: &req.description,
                price_cents: req.price_cents,
                currency: &req.currency,
                download_path: req.download_path.as_deref(),
                is_active: req.is_active,
            },
        )
        .await?;

        tx.commit().await?;
        Ok(product)
    }

    pub async fn get(pool: &PgPool, id: Uuid) -> Result<Product, AppError> {
        ProductRepository::find_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::NotFound("Producto no encontrado".into()))
    }

    /// [297A-14] Producto público comprable: envelope active + public e `is_active` (SQL).
    pub async fn get_public(pool: &PgPool, id: Uuid) -> Result<Product, AppError> {
        ProductRepository::find_public_by_id(pool, id)
            .await?
            .ok_or_else(|| AppError::NotFound("Producto no disponible".into()))
    }

    /// Listar todos los productos (admin).
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Product>, AppError> {
        Ok(ProductRepository::list_all(pool).await?)
    }

    /// Listar productos activos de un artículo (público).
    /// [297A-14] Solo se exponen productos con envelope active + public e `is_active`;
    /// la superficie pública se decide en SQL (`find_by_article`), no en memoria.
    pub async fn list_by_article(
        pool: &PgPool,
        article_id: Uuid,
    ) -> Result<Vec<Product>, AppError> {
        Ok(ProductRepository::find_by_article(pool, article_id).await?)
    }

    pub async fn list_public(pool: &PgPool) -> Result<Vec<Product>, AppError> {
        Ok(ProductRepository::list_public(pool).await?)
    }

    /// [297A-14] Actualiza producto y envelope juntos para evitar estados divergentes.
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        req: UpdateProductRequest,
    ) -> Result<Product, AppError> {
        let mut tx = pool.begin().await?;
        let product = ProductRepository::update(
            &mut tx,
            ProductUpdateParams {
                id,
                name: req.name.as_deref(),
                description: req.description.as_deref(),
                price_cents: req.price_cents,
                currency: req.currency.as_deref(),
                is_active: req.is_active,
            },
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Producto no encontrado".into()))?;

        let envelope_updated = ResourceRepository::update_resource_metadata(
            &mut tx,
            id,
            ResourceKind::Product,
            req.name.as_deref(),
            req.is_active,
            None,
        )
        .await?;
        if !envelope_updated {
            return Err(AppError::NotFound(
                "Envelope de producto no encontrado".into(),
            ));
        }

        tx.commit().await?;
        Ok(product)
    }

    /// [297A-14] Eliminación con lifecycle: el envelope pasa a trashed sin quedar huérfano.
    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), AppError> {
        let mut tx = pool.begin().await?;
        let trashed =
            ResourceRepository::soft_delete_kind_tx(&mut tx, id, ResourceKind::Product).await?;
        if !trashed {
            return Err(AppError::NotFound("Producto no encontrado".into()));
        }
        tx.commit().await?;
        Ok(())
    }
}
