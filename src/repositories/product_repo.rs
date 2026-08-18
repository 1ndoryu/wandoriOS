use sqlx::PgPool;
use uuid::Uuid;

use crate::models::product::{Order, Product};

pub struct ProductRepository;

/** Parámetros tipados para crear un producto dentro de una transacción. */
pub struct ProductCreateParams<'a> {
    pub id: Uuid,
    pub article_id: Option<Uuid>,
    pub name: &'a str,
    pub description: &'a str,
    pub price_cents: i32,
    pub currency: &'a str,
    pub download_path: Option<&'a str>,
    pub is_active: bool,
}

/** Parámetros tipados para una actualización parcial de producto. */
pub struct ProductUpdateParams<'a> {
    pub id: Uuid,
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub price_cents: Option<i32>,
    pub currency: Option<&'a str>,
    pub is_active: Option<bool>,
}

impl ProductRepository {
    /// [297A-10] Crear producto dentro de una transacción. `article_id` es opcional.
    pub async fn create(
        conn: &mut sqlx::PgConnection,
        params: ProductCreateParams<'_>,
    ) -> Result<Product, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "INSERT INTO products (id, article_id, name, description, price_cents, currency, download_path, is_active) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) \
             RETURNING id, article_id, name, description, price_cents, currency, stripe_product_id, stripe_price_id, download_path, is_active, created_at",
        )
        .bind(params.id)
        .bind(params.article_id)
        .bind(params.name)
        .bind(params.description)
        .bind(params.price_cents)
        .bind(params.currency)
        .bind(params.download_path)
        .bind(params.is_active)
        .fetch_one(&mut *conn)
        .await
    }

    /// Listar productos activos según su envelope (admin: incluye inactivos).
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Product>, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "SELECT p.id, p.article_id, p.name, p.description, p.price_cents, p.currency, \
                    p.stripe_product_id, p.stripe_price_id, p.download_path, p.is_active, p.created_at \
             FROM products p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE r.lifecycle = 'active'::lifecycle_state \
             ORDER BY p.created_at DESC",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Product>, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "SELECT p.id, p.article_id, p.name, p.description, p.price_cents, p.currency, \
                    p.stripe_product_id, p.stripe_price_id, p.download_path, p.is_active, p.created_at \
             FROM products p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE p.id = $1 AND r.lifecycle = 'active'::lifecycle_state",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Producto público comprable: envelope active + public e `is_active`.
    /// [297A-14] El checkout usa esta consulta (no `find_by_id`) para que la
    /// superficie pública dependa solo de SQL y no de la invariante `is_active`↔`visibility`.
    pub async fn find_public_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<Product>, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "SELECT p.id, p.article_id, p.name, p.description, p.price_cents, p.currency, \
                    p.stripe_product_id, p.stripe_price_id, p.download_path, p.is_active, p.created_at \
             FROM products p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE p.id = $1 \
               AND r.lifecycle = 'active'::lifecycle_state \
               AND r.visibility = 'public'::visibility_state \
               AND p.is_active = true",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_article(
        pool: &PgPool,
        article_id: Uuid,
    ) -> Result<Vec<Product>, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "SELECT p.id, p.article_id, p.name, p.description, p.price_cents, p.currency, \
                    p.stripe_product_id, p.stripe_price_id, p.download_path, p.is_active, p.created_at \
             FROM products p \
             INNER JOIN resources r ON r.id = p.id \
             WHERE p.article_id = $1 \
               AND r.lifecycle = 'active'::lifecycle_state \
               AND r.visibility = 'public'::visibility_state \
               AND p.is_active = true \
             ORDER BY p.created_at DESC",
        )
        .bind(article_id)
        .fetch_all(pool)
        .await
    }

    /// Catálogo público de la Tienda. La visibilidad se resuelve en SQL para
    /// no filtrar borradores o productos privados por error.
    pub async fn list_public(pool: &PgPool) -> Result<Vec<Product>, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "SELECT p.id, p.article_id, p.name, p.description, p.price_cents, p.currency,
                    p.stripe_product_id, p.stripe_price_id, p.download_path, p.is_active, p.created_at
             FROM products p
             INNER JOIN resources r ON r.id = p.id
             WHERE r.lifecycle = 'active'::lifecycle_state
               AND r.visibility = 'public'::visibility_state
               AND p.is_active = true
             ORDER BY p.created_at DESC LIMIT 100",
        )
        .fetch_all(pool)
        .await
    }

    pub async fn update(
        conn: &mut sqlx::PgConnection,
        params: ProductUpdateParams<'_>,
    ) -> Result<Option<Product>, sqlx::Error> {
        sqlx::query_as::<_, Product>(
            "UPDATE products SET \
                name = COALESCE($1, name), \
                description = COALESCE($2, description), \
                price_cents = COALESCE($3, price_cents), \
                currency = COALESCE($4, currency), \
                is_active = COALESCE($5, is_active) \
             WHERE id = $6 \
             RETURNING id, article_id, name, description, price_cents, currency, stripe_product_id, stripe_price_id, download_path, is_active, created_at",
        )
        .bind(params.name)
        .bind(params.description)
        .bind(params.price_cents)
        .bind(params.currency)
        .bind(params.is_active)
        .bind(params.id)
        .fetch_optional(&mut *conn)
        .await
    }

    pub async fn update_stripe_ids(
        pool: &PgPool,
        id: Uuid,
        stripe_product_id: &str,
        stripe_price_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE products SET stripe_product_id = $1, stripe_price_id = $2 WHERE id = $3",
        )
        .bind(stripe_product_id)
        .bind(stripe_price_id)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }
}

pub struct OrderRepository;

impl OrderRepository {
    pub async fn create(
        pool: &PgPool,
        product_id: Uuid,
        customer_email: &str,
        stripe_session_id: Option<&str>,
    ) -> Result<Order, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as::<_, Order>(
            "INSERT INTO orders (id, product_id, customer_email, stripe_session_id) \
             VALUES ($1, $2, $3, $4) \
             RETURNING id, product_id, product_version_id, user_id, stripe_session_id, stripe_payment_intent, customer_email, idempotency_key, status, paid_at, delivered_at, created_at",
        )
        .bind(id)
        .bind(product_id)
        .bind(customer_email)
        .bind(stripe_session_id)
        .fetch_one(pool)
        .await
    }

    /// Crear una orden con clave de idempotencia. Un reintento del mismo
    /// cliente/producto devuelve la orden original y nunca crea un segundo
    /// cobro. La clave sigue siendo opcional para conservar compatibilidad con
    /// órdenes legacy; el endpoint público siempre genera o acepta una.
    pub async fn create_with_idempotency(
        pool: &PgPool,
        product_id: Uuid,
        customer_email: &str,
        idempotency_key: &str,
    ) -> Result<Order, sqlx::Error> {
        let id = Uuid::new_v4();
        sqlx::query_as::<_, Order>(
            "INSERT INTO orders (id, product_id, customer_email, idempotency_key) \
             VALUES ($1, $2, $3, $4) \
             ON CONFLICT (customer_email, idempotency_key) \
             WHERE idempotency_key IS NOT NULL DO UPDATE SET product_id = orders.product_id \
             RETURNING id, product_id, product_version_id, user_id, stripe_session_id, stripe_payment_intent, customer_email, idempotency_key, status, paid_at, delivered_at, created_at",
        )
        .bind(id)
        .bind(product_id)
        .bind(customer_email)
        .bind(idempotency_key)
        .fetch_one(pool)
        .await
    }

    pub async fn find_by_session(
        pool: &PgPool,
        session_id: &str,
    ) -> Result<Option<Order>, sqlx::Error> {
        sqlx::query_as::<_, Order>(
            "SELECT id, product_id, product_version_id, user_id, stripe_session_id, stripe_payment_intent, customer_email, idempotency_key, status, paid_at, delivered_at, created_at \
             FROM orders WHERE stripe_session_id = $1",
        )
        .bind(session_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn mark_paid(
        pool: &PgPool,
        id: Uuid,
        payment_intent: Option<&str>,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE orders SET status = 'paid', paid_at = NOW(), stripe_payment_intent = $1 WHERE id = $2",
        )
        .bind(payment_intent)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn mark_delivered(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE orders SET status = 'delivered', delivered_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Marcar orden como fallida (webhook expirado)
    pub async fn mark_failed(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE orders SET status = 'failed' WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Buscar orden por ID
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Order>, sqlx::Error> {
        sqlx::query_as::<_, Order>(
            "SELECT id, product_id, product_version_id, user_id, stripe_session_id, stripe_payment_intent, \
             customer_email, idempotency_key, status, paid_at, delivered_at, created_at \
             FROM orders WHERE id = $1",
        )
        .bind(id)
        .fetch_optional(pool)
        .await
    }

    /// Actualizar `stripe_session_id` de una orden
    pub async fn update_stripe_session(
        pool: &PgPool,
        id: Uuid,
        stripe_session_id: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE orders SET stripe_session_id = $1 WHERE id = $2")
            .bind(stripe_session_id)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
