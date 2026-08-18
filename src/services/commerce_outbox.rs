/* wandori.us — Commerce outbox worker
 * [018A-42] Entrega correos de grants fuera del webhook. El worker es una
 * ejecución única y acotada (`--process-commerce-outbox`), por lo que Coolify
 * o un scheduler puede repetirlo sin dejar un proceso oculto en desarrollo.
 * Los tokens solo viven en memoria durante la llamada a Resend; PostgreSQL
 * conserva únicamente su hash. */

use std::sync::Arc;

use crate::errors::AppError;
use crate::handlers::dev_mail::{DevMailMessage, DevMailbox};
use crate::repositories::commerce_repo::{
    CommerceOutboxEvent, CommerceOutboxRepository, EntitlementRepository, ProductVersionRepository,
};
use crate::repositories::product_repo::{OrderRepository, ProductRepository};
use crate::services::commerce::generate_download_token;
use crate::services::email::EmailService;
use chrono::{Duration, Utc};
use sqlx::PgPool;

const DEFAULT_BATCH_SIZE: i64 = 20;
const MAX_BACKOFF_EXPONENT: i32 = 6;

#[derive(Debug, Default, PartialEq, Eq)]
pub struct OutboxRunSummary {
    pub claimed: usize,
    pub processed: usize,
    pub retried: usize,
}

/// Backoff determinista y acotado: 30s, 60s, …, 32m.
#[must_use]
pub fn retry_delay_seconds(attempts: i32) -> i64 {
    let exponent = u32::try_from(attempts.saturating_sub(1).clamp(0, MAX_BACKOFF_EXPONENT))
        .unwrap_or_default();
    30_i64 * 2_i64.pow(exponent)
}

/// Procesa un lote y termina; no mantiene timers ni conexiones abiertas fuera
/// de las operaciones del lote. Un fallo de un evento se registra y se
/// reprograma, pero no oculta un fallo de persistencia del propio scheduler.
pub async fn process_once(
    pool: &PgPool,
    resend_api_key: Option<&str>,
    dev_mailbox: Option<&Arc<DevMailbox>>,
    email_from: &str,
    site_url: &str,
    batch_size: i64,
) -> Result<OutboxRunSummary, AppError> {
    let events = CommerceOutboxRepository::claim_pending(pool, batch_size).await?;
    let mut summary = OutboxRunSummary {
        claimed: events.len(),
        ..OutboxRunSummary::default()
    };

    for event in events {
        match deliver_event(
            pool,
            resend_api_key,
            dev_mailbox,
            email_from,
            site_url,
            &event,
        )
        .await
        {
            Ok(()) => {
                CommerceOutboxRepository::mark_processed(pool, event.id).await?;
                summary.processed += 1;
            }
            Err(error) => {
                let delay = retry_delay_seconds(event.attempts);
                CommerceOutboxRepository::reschedule(pool, event.id, delay).await?;
                tracing::error!(
                    event_id = %event.id,
                    attempts = event.attempts,
                    delay_seconds = delay,
                    error = %error,
                    "commerce outbox reprogramado"
                );
                summary.retried += 1;
            }
        }
    }

    Ok(summary)
}

async fn deliver_event(
    pool: &PgPool,
    resend_api_key: Option<&str>,
    dev_mailbox: Option<&Arc<DevMailbox>>,
    email_from: &str,
    site_url: &str,
    event: &CommerceOutboxEvent,
) -> Result<(), AppError> {
    if event.event_type != "commerce.download_grant.created" {
        tracing::warn!(event_type = %event.event_type, "evento commerce outbox no soportado");
        return Ok(());
    }

    let order_id = event.aggregate_id;
    let order = OrderRepository::find_by_id(pool, order_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Orden de outbox no encontrada: {order_id}")))?;
    /* [297A-15] Una orden ya entregada no se vuelve a procesar; una orden
     * reembolsada/disputada NO reactiva el grant ni envía el enlace (el evento
     * se descarta y se marca procesado: no hay entrega que hacer). */
    if order.delivered_at.is_some() || matches!(order.status.as_str(), "refunded" | "disputed") {
        return Ok(());
    }

    let product = ProductRepository::find_by_id(pool, order.product_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFound(format!("Producto de orden no encontrado: {order_id}"))
        })?;

    /* El webhook valida que exista archivo/version antes de encolar. Si una
     * fila legacy no tiene entitlement, se reconstruye con la versión actual
     * y se conserva el mismo order_id para no duplicar grants. */
    let product_version_id = if order.product_version_id.is_some() {
        order.product_version_id
    } else {
        ProductVersionRepository::latest_for_product(pool, product.id)
            .await?
            .map(|(id, _)| id)
    };
    let token = generate_download_token();
    let expires_at = Utc::now() + Duration::days(30);
    let refreshed =
        EntitlementRepository::refresh_token_for_order(pool, order.id, &token.hash, expires_at)
            .await?;
    if !refreshed {
        let created = EntitlementRepository::create_active(
            pool,
            order.id,
            order.product_id,
            product_version_id,
            &order.customer_email,
            &token.hash,
            expires_at,
        )
        .await?;
        if !created {
            return Err(AppError::Conflict(
                "No se pudo materializar el grant de descarga".into(),
            ));
        }
    }

    let download_url = format!(
        "{}/api/downloads/{}",
        site_url.trim_end_matches('/'),
        token.raw
    );
    /* [297A-15] Mismo patrón que auth: con Resend real se envía; sin proveedor
     * (dev) el enlace se guarda en el buzón de desarrollo y a log. Solo tras
     * éxito (real o mock) se marca la orden entregada. */
    match resend_api_key {
        Some(api_key) => {
            EmailService::send_download_link(
                api_key,
                email_from,
                &order.customer_email,
                &product.name,
                &download_url,
            )
            .await?;
        }
        None => {
            tracing::info!(
                to = %order.customer_email,
                %download_url,
                "[dev-mail] tu descarga: {}",
                product.name
            );
            if let Some(mailbox) = dev_mailbox {
                mailbox
                    .lock()
                    .map_err(|e| AppError::Internal(format!("Error escribiendo buzón dev: {e}")))?
                    .push(DevMailMessage::new(
                        &order.customer_email,
                        &format!("tu descarga: {}", product.name),
                        &download_url,
                    ));
            }
        }
    }
    OrderRepository::mark_delivered(pool, order.id).await?;
    tracing::info!(order_id = %order.id, "grant de descarga entregado por outbox");
    Ok(())
}

pub async fn process_default_batch(
    pool: &PgPool,
    resend_api_key: Option<&str>,
    dev_mailbox: Option<&Arc<DevMailbox>>,
    email_from: &str,
    site_url: &str,
) -> Result<OutboxRunSummary, AppError> {
    process_once(
        pool,
        resend_api_key,
        dev_mailbox,
        email_from,
        site_url,
        DEFAULT_BATCH_SIZE,
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::{retry_delay_seconds, OutboxRunSummary};

    #[test]
    fn backoff_crece_y_se_acota() {
        assert_eq!(retry_delay_seconds(0), 30);
        assert_eq!(retry_delay_seconds(1), 30);
        assert_eq!(retry_delay_seconds(2), 60);
        assert_eq!(retry_delay_seconds(7), 1_920);
        assert_eq!(retry_delay_seconds(99), 1_920);
    }

    #[test]
    fn resumen_inicial_no_reporta_trabajo_falso() {
        assert_eq!(OutboxRunSummary::default().claimed, 0);
        assert_eq!(OutboxRunSummary::default().processed, 0);
        assert_eq!(OutboxRunSummary::default().retried, 0);
    }
}
