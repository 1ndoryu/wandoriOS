/* wandori.us — Orders & downloads by account
 * [297A-15] Historial de compras por cuenta y reembolso con autoridad
 * server-side. Las rutas nunca exponen identificadores del proveedor
 * (session/intent), tokens de descarga ni storage keys: el comprador ve el
 * estado de su entrega y el admin reembolsa con idempotencia. */

use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};
use uuid::Uuid;

use crate::errors::AppError;
use crate::middleware::{AdminUser, AuthUser};
use crate::models::product::{DownloadHistoryItem, OrderHistoryItem, RefundResponse};
use crate::repositories::commerce_repo::EntitlementRepository;
use crate::repositories::product_repo::OrderRepository;
use crate::repositories::UserRepository;
use crate::AppState;

/// Historial de órdenes de la cuenta autenticada.
#[utoipa::path(
    get,
    path = "/api/me/orders",
    responses(
        (status = 200, description = "Órdenes de la cuenta", body = [OrderHistoryItem]),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn my_orders(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<OrderHistoryItem>>, AppError> {
    let user = UserRepository::find_by_id(&state.pool, auth.user_id)
        .await
        .map_err(|e| AppError::Internal(format!("Error buscando usuario: {e}")))?
        .ok_or(AppError::Unauthorized)?;
    let orders = OrderRepository::list_for_account(&state.pool, Some(auth.user_id), &user.email)
        .await
        .map_err(|e| AppError::Internal(format!("Error listando órdenes: {e}")))?;
    Ok(Json(orders))
}

/// Estado de los grants de descarga de la cuenta (sin tokens).
#[utoipa::path(
    get,
    path = "/api/me/downloads",
    responses(
        (status = 200, description = "Descargas de la cuenta", body = [DownloadHistoryItem]),
        (status = 401, description = "No autorizado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn my_downloads(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<Vec<DownloadHistoryItem>>, AppError> {
    let user = UserRepository::find_by_id(&state.pool, auth.user_id)
        .await
        .map_err(|e| AppError::Internal(format!("Error buscando usuario: {e}")))?
        .ok_or(AppError::Unauthorized)?;
    let grants = EntitlementRepository::list_for_account(&state.pool, &user.email)
        .await
        .map_err(|e| AppError::Internal(format!("Error listando descargas: {e}")))?;
    Ok(Json(grants))
}

/// Llama al proveedor para devolver el dinero. Solo se usa con clave real
/// (producción); en modo mock la revocación server-side es la única autoridad.
async fn call_provider_refund(
    stripe_key: &str,
    payment_intent: &str,
    order_id: Uuid,
) -> Result<(), AppError> {
    let params = [("payment_intent", payment_intent)];
    let response = reqwest::Client::new()
        .post("https://api.stripe.com/v1/refunds")
        .header("Authorization", format!("Bearer {stripe_key}"))
        .header("Idempotency-Key", format!("refund:{order_id}"))
        .form(&params)
        .send()
        .await
        .map_err(|error| AppError::Internal(format!("Error llamando al proveedor: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response
            .text()
            .await
            .unwrap_or_else(|_| "sin detalle".to_string());
        tracing::error!("Stripe refund error {status}: {detail}");
        return Err(AppError::Internal(format!(
            "Error ejecutando reembolso: {status}"
        )));
    }
    Ok(())
}

/// Reembolsa una orden (admin). Autoridad server-side e idempotente: un
/// reintento sobre una orden ya `refunded`/`disputed` devuelve el estado sin
/// volver a tocar al proveedor ni re-ejecutar la revocación.
#[utoipa::path(
    post,
    path = "/api/admin/orders/{order_id}/refund",
    params(("order_id" = Uuid, Path, description = "ID de la orden")),
    responses(
        (status = 200, description = "Orden reembolsada", body = RefundResponse),
        (status = 401, description = "No autorizado", body = ErrorResponse),
        (status = 404, description = "Orden no encontrada", body = ErrorResponse),
        (status = 409, description = "La orden no se puede reembolsar en su estado", body = ErrorResponse)
    ),
    security(("session_cookie" = []))
)]
pub async fn refund_order(
    State(state): State<AppState>,
    _admin: AdminUser,
    Path(order_id): Path<Uuid>,
) -> Result<Json<RefundResponse>, AppError> {
    let order = OrderRepository::find_by_id(&state.pool, order_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Orden no encontrada".into()))?;

    /* Idempotencia: estados terminales de dinero ya decididos. */
    if matches!(order.status.as_str(), "refunded" | "disputed") {
        return Ok(Json(RefundResponse {
            order_id,
            status: order.status,
            refunded_at: order.refunded_at,
        }));
    }
    if order.status != "paid" && order.status != "delivered" {
        return Err(AppError::Conflict(
            "La orden no está pagada y no puede reembolsarse".into(),
        ));
    }

    /* 1. Devolver el dinero en el proveedor (solo con clave real). */
    if !state.stripe_mock_enabled() {
        let stripe_key = state
            .stripe_secret_key
            .as_ref()
            .ok_or_else(|| AppError::Internal("Pasarela de pago no configurada".into()))?;
        let payment_intent = order
            .stripe_payment_intent
            .as_deref()
            .ok_or_else(|| AppError::Conflict("La orden no tiene intent de pago".into()))?;
        call_provider_refund(stripe_key, payment_intent, order_id).await?;
    }

    /* 2. Revocar el grant y cerrar la orden (idempotente por guard de estado). */
    EntitlementRepository::revoke_for_order(&state.pool, order_id).await?;
    OrderRepository::mark_refunded(&state.pool, order_id).await?;

    let updated = OrderRepository::find_by_id(&state.pool, order_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Orden no encontrada".into()))?;
    Ok(Json(RefundResponse {
        order_id,
        status: updated.status,
        refunded_at: updated.refunded_at,
    }))
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/me/orders", get(my_orders))
        .route("/me/downloads", get(my_downloads))
        .route(
            "/admin/orders/:order_id/refund",
            axum::routing::post(refund_order),
        )
}
