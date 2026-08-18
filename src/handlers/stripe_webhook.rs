/* wandori.us — Stripe Webhook Handler
 * Verifica la firma HMAC-SHA256 de Stripe y procesa eventos de pago.
 * Evento principal: checkout.session.completed → marca orden como pagada y
 * encola la entrega; el correo se procesa fuera del request. */

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::post;
use axum::Router;
use hmac::{Hmac, Mac};
use sha2::Sha256;

use crate::errors::AppError;
use crate::models::product::Order;
use crate::repositories::commerce_repo::{
    CommerceOutboxRepository, EntitlementRepository, ProductVersionRepository,
    StripeEventRepository,
};
use crate::repositories::product_repo::{OrderRepository, ProductRepository};
use crate::services::commerce::generate_download_token;
use crate::AppState;

type HmacSha256 = Hmac<Sha256>;

/// Verifica la firma del webhook de Stripe usando HMAC-SHA256.
/// Formato del header: `t=timestamp,v1=signature`
fn verify_stripe_signature(
    payload: &str,
    signature_header: &str,
    webhook_secret: &str,
) -> Result<(), AppError> {
    let mut timestamp = "";
    let mut signature = "";

    for part in signature_header.split(',') {
        if let Some(t) = part.strip_prefix("t=") {
            timestamp = t;
        } else if let Some(v) = part.strip_prefix("v1=") {
            signature = v;
        }
    }

    if timestamp.is_empty() || signature.is_empty() {
        return Err(AppError::BadRequest("Firma de Stripe invalida".into()));
    }

    /* Verificar que el timestamp no sea muy viejo (5 min max) */
    let now = chrono::Utc::now().timestamp();
    let ts: i64 = timestamp
        .parse()
        .map_err(|_| AppError::BadRequest("Timestamp invalido".into()))?;

    if (now - ts).unsigned_abs() > 300 {
        return Err(AppError::BadRequest(
            "Webhook timestamp demasiado viejo".into(),
        ));
    }

    /* Calcular HMAC */
    let signed_payload = format!("{timestamp}.{payload}");
    let mut mac = HmacSha256::new_from_slice(webhook_secret.as_bytes())
        .map_err(|e| AppError::Internal(format!("Error inicializando HMAC: {e}")))?;
    mac.update(signed_payload.as_bytes());

    let expected_hex = hex::encode(mac.finalize().into_bytes());

    if expected_hex != signature {
        return Err(AppError::BadRequest("Firma de webhook invalida".into()));
    }

    Ok(())
}

async fn handle_completed(state: &AppState, session: &serde_json::Value) -> Result<(), AppError> {
    let order_id_raw = session["metadata"]["order_id"].as_str().unwrap_or("");
    if order_id_raw.is_empty() {
        tracing::warn!("Webhook sin order_id en metadata");
        return Ok(());
    }
    let Ok(order_id) = uuid::Uuid::parse_str(order_id_raw) else {
        tracing::warn!("order_id invalido: {order_id_raw}");
        return Ok(());
    };

    let payment_intent = session["payment_intent"].as_str();
    OrderRepository::mark_paid(&state.pool, order_id, payment_intent).await?;
    let Some(order) = OrderRepository::find_by_id(&state.pool, order_id).await? else {
        tracing::warn!("Orden pagada no encontrada: {order_id}");
        return Ok(());
    };
    let Some(product) = ProductRepository::find_by_id(&state.pool, order.product_id).await? else {
        tracing::warn!("Producto de orden no encontrado: {}", order.product_id);
        return Ok(());
    };

    /* Un webhook reintentado no rota un grant que ya podría estar en un correo
     * en tránsito. Los reintentos de entrega quedan para el worker outbox, que
     * puede emitir un nuevo grant de forma explícita. */
    if order.delivered_at.is_some() {
        return Ok(());
    }

    let (version_id, _file_path) = if let Some((id, path)) =
        ProductVersionRepository::latest_for_product(&state.pool, product.id).await?
    {
        (Some(id), path)
    } else {
        let Some(path) = product.download_path.clone() else {
            return Err(AppError::Internal(
                "Producto pagado sin archivo descargable".into(),
            ));
        };
        (None, path)
    };
    let _created = create_download_grant(state, &order, version_id).await?;
    Ok(())
}

async fn create_download_grant(
    state: &AppState,
    order: &Order,
    product_version_id: Option<uuid::Uuid>,
) -> Result<bool, AppError> {
    let token = generate_download_token();
    let expires_at = chrono::Utc::now() + chrono::Duration::days(30);
    let created = EntitlementRepository::create_active(
        &state.pool,
        order.id,
        order.product_id,
        product_version_id,
        &order.customer_email,
        &token.hash,
        expires_at,
    )
    .await?;
    if !created {
        return Ok(false);
    }
    CommerceOutboxRepository::enqueue(
        &state.pool,
        "commerce.download_grant.created",
        order.id,
        &format!("grant:{}", order.id),
        &serde_json::json!({ "order_id": order.id, "product_version_id": product_version_id }),
    )
    .await?;
    Ok(true)
}

async fn handle_expired(state: &AppState, session: &serde_json::Value) -> Result<(), AppError> {
    let Some(order_id_raw) = session["metadata"]["order_id"].as_str() else {
        tracing::warn!("Webhook expirado sin order_id");
        return Ok(());
    };
    let Ok(order_id) = uuid::Uuid::parse_str(order_id_raw) else {
        tracing::warn!("order_id expirado invalido: {order_id_raw}");
        return Ok(());
    };
    OrderRepository::mark_failed(&state.pool, order_id).await?;
    tracing::info!("Orden {order_id} expirada");
    Ok(())
}

/// [297A-15] Resuelve la orden de un evento de reembolso/chargeback. Los
/// eventos del proveedor referencian el `payment_intent`; el `metadata.order_id`
/// sirve de respaldo cuando el proveedor copia la metadata del checkout.
async fn resolve_order_for_money_event(
    state: &AppState,
    object: &serde_json::Value,
) -> Result<Option<uuid::Uuid>, AppError> {
    if let Some(order_id_raw) = object["metadata"]["order_id"].as_str() {
        if let Ok(order_id) = uuid::Uuid::parse_str(order_id_raw) {
            return Ok(Some(order_id));
        }
    }
    if let Some(payment_intent) = object["payment_intent"].as_str() {
        let order = OrderRepository::find_by_payment_intent(&state.pool, payment_intent).await?;
        if let Some(order) = order {
            return Ok(Some(order.id));
        }
    }
    Ok(None)
}

/// [297A-15] Reembolso: revoca el grant y marca la orden como refundada.
/// Idempotente por partida doble — `stripe_events` deduplica el evento y
/// `mark_refunded`/`revoke_for_order` son no-ops sobre un estado ya cerrado.
async fn handle_refunded(state: &AppState, object: &serde_json::Value) -> Result<(), AppError> {
    let Some(order_id) = resolve_order_for_money_event(state, object).await? else {
        tracing::warn!("Refund sin orden resoluble (payment_intent/metadata)");
        return Ok(());
    };
    crate::repositories::commerce_repo::EntitlementRepository::revoke_for_order(
        &state.pool,
        order_id,
    )
    .await?;
    OrderRepository::mark_refunded(&state.pool, order_id).await?;
    tracing::info!(order_id = %order_id, "orden reembolsada: grant revocado");
    Ok(())
}

/// [297A-15] Chargeback: misma revocación que el reembolso pero con estado
/// `disputed` para que el panel distinga la causa del dinero perdido.
async fn handle_dispute(state: &AppState, object: &serde_json::Value) -> Result<(), AppError> {
    let Some(order_id) = resolve_order_for_money_event(state, object).await? else {
        tracing::warn!("Disputa sin orden resoluble (payment_intent/metadata)");
        return Ok(());
    };
    crate::repositories::commerce_repo::EntitlementRepository::revoke_for_order(
        &state.pool,
        order_id,
    )
    .await?;
    OrderRepository::mark_disputed(&state.pool, order_id).await?;
    tracing::info!(order_id = %order_id, "chargeback: grant revocado");
    Ok(())
}

/// Endpoint del webhook de Stripe.
/// Recibe eventos y procesa `checkout.session.completed`.
/* [018A-27] El webhook se documenta como integración externa: firma en header,
 * JSON crudo y respuesta vacía. La verificación HMAC sigue siendo exclusiva
 * del backend; OpenAPI no convierte el cuerpo en una autorización. */
#[utoipa::path(
    post,
    path = "/api/webhook/stripe",
    params(("stripe-signature" = String, Header, description = "Firma HMAC de Stripe")),
    request_body(content = String, description = "Evento Stripe JSON", content_type = "application/json"),
    responses(
        (status = 200, description = "Evento aceptado"),
        (status = 400, description = "Firma o JSON inválido", body = ErrorResponse),
        (status = 500, description = "Webhook no configurado", body = ErrorResponse)
    )
)]
pub async fn stripe_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: String,
) -> Result<StatusCode, AppError> {
    let event: serde_json::Value = serde_json::from_str(&body)
        .map_err(|error| AppError::BadRequest(format!("JSON invalido: {error}")))?;

    /* [297A-15] Firma: con secreto real (producción) el HMAC es obligatorio;
     * sin secreto (dev/mock) solo se aceptan eventos de prueba (`livemode:
     * false`) para que el ciclo E2E funcione sin credenciales. Fail-closed:
     * un evento `livemode: true` sin secreto es rechazado. */
    match state.stripe_webhook_secret.as_deref() {
        Some(webhook_secret) => {
            let signature_header = headers
                .get("stripe-signature")
                .and_then(|value| value.to_str().ok())
                .ok_or_else(|| AppError::BadRequest("Missing stripe-signature header".into()))?;
            verify_stripe_signature(&body, signature_header, webhook_secret)?;
        }
        None => {
            if event["livemode"].as_bool().unwrap_or(true) {
                return Err(AppError::BadRequest(
                    "Webhook sin secreto solo acepta eventos de prueba (livemode=false)".into(),
                ));
            }
            tracing::warn!("[mock-stripe] webhook sin firma aceptado (modo dev, evento de prueba)");
        }
    }

    let event_id = event["id"]
        .as_str()
        .ok_or_else(|| AppError::BadRequest("Evento Stripe sin id".into()))?;
    let event_type = event["type"].as_str().unwrap_or("");
    if !StripeEventRepository::begin(&state.pool, event_id, event_type, &event).await? {
        tracing::debug!("Evento Stripe ya procesado: {event_id}");
        return Ok(StatusCode::OK);
    }
    let session = &event["data"]["object"];
    match event_type {
        "checkout.session.completed" => handle_completed(&state, session).await?,
        "checkout.session.expired" => handle_expired(&state, session).await?,
        "charge.refunded" => handle_refunded(&state, session).await?,
        "charge.dispute.created" => handle_dispute(&state, session).await?,
        event_type => tracing::debug!("Evento Stripe no manejado: {event_type}"),
    }
    StripeEventRepository::mark_processed(&state.pool, event_id).await?;
    Ok(StatusCode::OK)
}

pub fn routes() -> Router<AppState> {
    Router::new().route("/webhook/stripe", post(stripe_webhook))
}
