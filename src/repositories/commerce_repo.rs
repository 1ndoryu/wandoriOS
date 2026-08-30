// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
/* wandori.us — Commerce repositories
 * Persistencia de idempotencia, eventos de Stripe, entitlements y outbox.
 * La autoridad de acceso permanece en PostgreSQL; ningún token se decide en
 * el navegador. [297A-15] */

use chrono::{DateTime, Utc};
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, sqlx::FromRow)]
pub struct DownloadGrant {
    pub file_path: Option<String>,
    pub product_name: String,
    pub status: String,
    pub expires_at: DateTime<Utc>,
}

pub struct StripeEventRepository;

impl StripeEventRepository {
    /// Reclama un evento del proveedor. Un evento procesado previamente se
    /// ignora; uno fallido (`processed_at` NULL) puede reintentarse.
    pub async fn begin(
        pool: &PgPool,
        provider_event_id: &str,
        event_type: &str,
        payload: &Value,
    ) -> Result<bool, sqlx::Error> {
        let inserted = sqlx::query(
            "INSERT INTO stripe_events (provider_event_id, event_type, payload) \
             VALUES ($1, $2, $3) ON CONFLICT (provider_event_id) DO NOTHING",
        )
        .bind(provider_event_id)
        .bind(event_type)
        .bind(payload)
        .execute(pool)
        .await?
        .rows_affected();

        if inserted > 0 {
            return Ok(true);
        }

        let processed: Option<DateTime<Utc>> = sqlx::query_scalar(
            "SELECT processed_at FROM stripe_events WHERE provider_event_id = $1",
        )
        .bind(provider_event_id)
        .fetch_optional(pool)
        .await?
        .flatten();
        Ok(processed.is_none())
    }

    pub async fn mark_processed(pool: &PgPool, provider_event_id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE stripe_events SET processed_at = NOW() WHERE provider_event_id = $1")
            .bind(provider_event_id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

pub struct ProductVersionRepository;

impl ProductVersionRepository {
    pub async fn latest_for_product(
        pool: &PgPool,
        product_id: Uuid,
    ) -> Result<Option<(Uuid, String)>, sqlx::Error> {
        sqlx::query_as::<_, (Uuid, String)>(
            "SELECT id, file_path FROM product_versions \
             WHERE product_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
        )
        .bind(product_id)
        .fetch_optional(pool)
        .await
    }
}

pub struct EntitlementRepository;

impl EntitlementRepository {
    pub async fn create_active(
        pool: &PgPool,
        order_id: Uuid,
        product_id: Uuid,
        product_version_id: Option<Uuid>,
        customer_email: &str,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<bool, sqlx::Error> {
        let inserted = sqlx::query(
            "INSERT INTO entitlements \
             (order_id, product_id, product_version_id, customer_email, token_hash, expires_at) \
             VALUES ($1, $2, $3, $4, $5, $6) \
             ON CONFLICT (order_id) DO NOTHING",
        )
        .bind(order_id)
        .bind(product_id)
        .bind(product_version_id)
        .bind(customer_email)
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?
        .rows_affected();
        Ok(inserted > 0)
    }

    pub async fn find_by_token_hash(
        pool: &PgPool,
        token_hash: &str,
    ) -> Result<Option<DownloadGrant>, sqlx::Error> {
        sqlx::query_as::<_, DownloadGrant>(
            "SELECT COALESCE(pv.file_path, p.download_path) AS file_path, \
                    p.name AS product_name, e.status, e.expires_at \
             FROM entitlements e \
             INNER JOIN products p ON p.id = e.product_id \
             LEFT JOIN product_versions pv ON pv.id = e.product_version_id \
             WHERE e.token_hash = $1 LIMIT 1",
        )
        .bind(token_hash)
        .fetch_optional(pool)
        .await
    }

    pub async fn expire(pool: &PgPool, token_hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE entitlements SET status = 'expired' \
             WHERE token_hash = $1 AND status = 'active'",
        )
        .bind(token_hash)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// [297A-15] Revoca el grant de una orden (reembolso o chargeback).
    /// Idempotente: un intento ya revocado no toca la fila y conserva el
    /// `revoked_at` original. El `refresh_token_for_order` posterior (reintento
    /// del outbox) no puede reactivar un grant de una orden refundada porque
    /// el worker ahora corta por estado de la orden.
    pub async fn revoke_for_order(pool: &PgPool, order_id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE entitlements \
             SET status = 'revoked', revoked_at = COALESCE(revoked_at, NOW()) \
             WHERE order_id = $1 AND status IN ('active', 'expired')",
        )
        .bind(order_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// [297A-15] Historial de grants de una cuenta. Nunca devuelve `token_hash`:
    /// el enlace de descarga solo viaja por correo y el hash es secreto.
    pub async fn list_for_account(
        pool: &PgPool,
        customer_email: &str,
    ) -> Result<Vec<crate::models::product::DownloadHistoryItem>, sqlx::Error> {
        sqlx::query_as::<_, crate::models::product::DownloadHistoryItem>(
            "SELECT p.name AS product_name, e.status, e.expires_at, e.created_at \
             FROM entitlements e \
             INNER JOIN products p ON p.id = e.product_id \
             WHERE e.customer_email = $1 \
             ORDER BY e.created_at DESC",
        )
        .bind(customer_email)
        .fetch_all(pool)
        .await
    }

    /// Rota el secreto de un grant existente sin guardar nunca el token en
    /// claro. La restricción única por orden conserva una sola concesión
    /// activa y hace idempotente el reintento de entrega.
    pub async fn refresh_token_for_order(
        pool: &PgPool,
        order_id: Uuid,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> Result<bool, sqlx::Error> {
        let updated = sqlx::query(
            "UPDATE entitlements SET token_hash = $2, expires_at = $3, status = 'active', revoked_at = NULL WHERE order_id = $1",
        )
        .bind(order_id)
        .bind(token_hash)
        .bind(expires_at)
        .execute(pool)
        .await?
        .rows_affected();
        Ok(updated > 0)
    }
}

pub struct CommerceOutboxRepository;

#[derive(Debug, sqlx::FromRow)]
pub struct CommerceOutboxEvent {
    pub id: Uuid,
    pub event_type: String,
    pub aggregate_id: Uuid,
    pub payload: Value,
    pub attempts: i32,
}

impl CommerceOutboxRepository {
    pub async fn enqueue(
        pool: &PgPool,
        event_type: &str,
        aggregate_id: Uuid,
        dedupe_key: &str,
        payload: &Value,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "INSERT INTO commerce_outbox (event_type, aggregate_id, dedupe_key, payload) \
             VALUES ($1, $2, $3, $4) ON CONFLICT (dedupe_key) DO NOTHING",
        )
        .bind(event_type)
        .bind(aggregate_id)
        .bind(dedupe_key)
        .bind(payload)
        .execute(pool)
        .await?;
        Ok(())
    }

    /// Reclama un lote de eventos sin que dos workers procesen la misma fila.
    /// El aplazamiento inmediato cubre la caída del proceso entre claim y
    /// resultado; `reschedule` aplica el backoff específico del intento.
    pub async fn claim_pending(
        pool: &PgPool,
        limit: i64,
    ) -> Result<Vec<CommerceOutboxEvent>, sqlx::Error> {
        /* [297A-15] SQL en una sola línea: la continuación `\` de Rust en
         * strings multilínea elimina los espacios y rompía la consulta
         * (`commerce_outboxWHERE`). El claim con SKIP LOCKED sigue siendo el
         * guard de concurrencia del worker. */
        sqlx::query_as::<_, CommerceOutboxEvent>(
            "WITH claimed AS (SELECT id FROM commerce_outbox WHERE processed_at IS NULL AND available_at <= NOW() ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT $1) UPDATE commerce_outbox AS item SET attempts = item.attempts + 1, available_at = NOW() + INTERVAL '5 minutes' FROM claimed WHERE item.id = claimed.id RETURNING item.id, item.event_type, item.aggregate_id, item.payload, item.attempts",
        )
        .bind(limit.clamp(1, 100))
        .fetch_all(pool)
        .await
    }

    pub async fn mark_processed(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE commerce_outbox SET processed_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn reschedule(
        pool: &PgPool,
        id: Uuid,
        delay_seconds: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE commerce_outbox SET available_at = NOW() + ($2 * INTERVAL '1 second') WHERE id = $1 AND processed_at IS NULL",
        )
        .bind(id)
        .bind(delay_seconds.max(1))
        .execute(pool)
        .await?;
        Ok(())
    }
}
