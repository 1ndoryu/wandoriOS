// sentinel-disable-file sqlx-query-sin-macro sqlx-query-as-sin-macro
// [por que] sqlx 0.8 sin feature "macros" y sin DB en compile-time (sin
// .sqlx cache ni DATABASE_URL de build): convertir a query!/query_as!
// romperia el build. Restriccion documentada en PLAN-corregir-1408.md §5.
//! Tests de integración del comercio seguro (297A-15).
//! Cubren el ciclo E2E completo en MODO MOCK (sin claves reales de Stripe,
//! mismo patrón que Resend/DevMailbox: real solo en producción):
//!
//! checkout invitado → (idempotencia) → webhook checkout.session.completed →
//! entitlement + outbox → worker entrega el grant → descarga privada →
//! reembolso admin / chargeback → grant revocado (descarga 403) → historial
//! por cuenta. Los reintentos del proveedor no duplican órdenes, grants ni
//! entregas, y un evento `livemode: true` sin secreto es rechazado (fail-closed).
//! Necesitan `DATABASE_URL` apuntando a la BD local.

mod common;
use common::*;

use axum::http::StatusCode;
use serde_json::{json, Value};
use tower::util::ServiceExt;
use uuid::Uuid;

use glory_backend::services::commerce_outbox;
use glory_backend::AppState;

#[tokio::test]
async fn ciclo_e2e_comercio_mock_idempotente() {
    let state = test_state().await;
    let router = production_router(&state);

    /* Limpieza preventiva de runs anteriores que pudieran haber fallado antes
     * de su cleanup (IDs de evento fijos podrían chocar con filas residuales). */
    sqlx::query("DELETE FROM stripe_events WHERE provider_event_id LIKE 'evt_test_%'")
        .execute(&state.pool)
        .await
        .expect("limpiar eventos residuales");
    sqlx::query("DELETE FROM entitlements WHERE customer_email LIKE 'buyer-%'")
        .execute(&state.pool)
        .await
        .expect("limpiar entitlements residuales");
    sqlx::query(
        "DELETE FROM commerce_outbox WHERE aggregate_id IN (SELECT id FROM orders WHERE customer_email LIKE 'buyer-%')",
    )
    .execute(&state.pool)
    .await
    .expect("limpiar outbox residual");
    sqlx::query("DELETE FROM orders WHERE customer_email LIKE 'buyer-%'")
        .execute(&state.pool)
        .await
        .expect("limpiar órdenes residuales");
    sqlx::query(
        "DELETE FROM products WHERE id IN (SELECT id FROM resources WHERE kind = 'product' AND title = 'E2E Product')",
    )
    .execute(&state.pool)
    .await
    .expect("limpiar productos residuales");
    sqlx::query("DELETE FROM resources WHERE kind = 'product' AND title = 'E2E Product'")
        .execute(&state.pool)
        .await
        .expect("limpiar envelopes residuales");

    /* Preparar storage privado con un archivo descargable. */
    let upload_root = std::path::Path::new(&state.upload_dir);
    let _ = std::fs::remove_dir_all(upload_root);
    std::fs::create_dir_all(upload_root).expect("crear dir de uploads");
    std::fs::write(
        upload_root.join("e2e-product.zip"),
        b"contenido-e2e-secreto",
    )
    .expect("escribir archivo de prueba");

    let admin_id = create_user(&state, "admin", "admin").await.0;
    let (admin_token, admin_csrf) = session(&state, admin_id).await;
    let (buyer_id, buyer_email) = create_user(&state, "user", "buyer").await;
    let (buyer_token, buyer_csrf) = session(&state, buyer_id).await;

    /* 1. Admin crea el producto público. */
    let create = admin_request(
        "POST",
        "/api/admin/products",
        &admin_token,
        &admin_csrf,
        Some(&admin_csrf),
        Some(json!({
            "name": "E2E Product",
            "description": "producto de prueba",
            "price_cents": 1200,
            "currency": "USD",
            "download_path": "uploads/e2e-product.zip",
            "is_active": true
        })),
    );
    let response = router.clone().oneshot(create).await.unwrap();
    assert_eq!(response.status(), StatusCode::CREATED, "producto creado");
    let product: Value = body_json(response).await;
    let product_id: Uuid = serde_json::from_value(product["id"].clone()).expect("id de producto");

    /* 2. Checkout invitado en modo mock → sesión cs_test sin tocar Stripe. */
    let checkout_body = json!({ "email": buyer_email, "idempotency_key": "e2e-checkout-key-1" });
    let checkout = public_request(
        "POST",
        &format!("/api/products/{product_id}/checkout"),
        Some(checkout_body),
    );
    let response = router.clone().oneshot(checkout).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "checkout mock creado");
    let checkout_json: Value = body_json(response).await;
    let order_id: Uuid =
        serde_json::from_value(checkout_json["order_id"].clone()).expect("order_id");
    let session_id = checkout_json["session_id"]
        .as_str()
        .expect("session_id")
        .to_string();
    let checkout_url = checkout_json["checkout_url"]
        .as_str()
        .expect("checkout_url")
        .to_string();
    assert!(session_id.starts_with("cs_test_"), "sesión mock cs_test");
    assert!(checkout_url.contains("/checkout/mock"), "URL mock local");

    /* 3. Idempotencia del checkout: la misma clave no crea una segunda orden. */
    let replay = public_request(
        "POST",
        &format!("/api/products/{product_id}/checkout"),
        Some(json!({ "email": buyer_email, "idempotency_key": "e2e-checkout-key-1" })),
    );
    let response = router.clone().oneshot(replay).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let replay_json: Value = body_json(response).await;
    let replay_order: Uuid =
        serde_json::from_value(replay_json["order_id"].clone()).expect("order_id replay");
    assert_eq!(
        replay_order, order_id,
        "la misma clave devuelve la misma orden"
    );

    /* 4. Webhook checkout.session.completed (evento de prueba). */
    let run_tag = Uuid::new_v4().simple();
    let completed = test_event(
        &format!("evt_{run_tag}_completed"),
        "checkout.session.completed",
        json!({
            "id": session_id,
            "metadata": { "order_id": order_id.to_string() },
            "payment_intent": "pi_test_123456"
        }),
    );
    let webhook = public_request("POST", "/api/webhook/stripe", Some(completed.clone()));
    let response = router.clone().oneshot(webhook).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "webhook completado");
    let entitlements: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM entitlements WHERE order_id = $1")
            .bind(order_id)
            .fetch_one(&state.pool)
            .await
            .expect("count entitlements");
    assert_eq!(entitlements, 1, "un solo grant por orden");
    let outbox: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM commerce_outbox WHERE aggregate_id = $1")
            .bind(order_id)
            .fetch_one(&state.pool)
            .await
            .expect("count outbox");
    assert_eq!(outbox, 1, "un solo evento de entrega encolado");

    /* 5. Idempotencia del webhook: el replay no duplica grant ni outbox. */
    let replay = public_request("POST", "/api/webhook/stripe", Some(completed.clone()));
    let response = router.clone().oneshot(replay).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let entitlements: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM entitlements WHERE order_id = $1")
            .bind(order_id)
            .fetch_one(&state.pool)
            .await
            .expect("count entitlements 2");
    assert_eq!(entitlements, 1, "replay no duplica el grant");

    /* 6. Fail-closed: un evento livemode=true sin secreto es rechazado. */
    let live_event = json!({
        "id": format!("evt_{run_tag}_live"),
        "type": "checkout.session.completed",
        "livemode": true,
        "data": { "object": { "metadata": { "order_id": order_id.to_string() } } }
    });
    let live = public_request("POST", "/api/webhook/stripe", Some(live_event));
    let response = router.clone().oneshot(live).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::BAD_REQUEST,
        "evento live sin secreto rechazado (fail-closed)"
    );

    /* 7. Worker de outbox entrega el grant (mock: buzón dev, sin Resend). */
    let summary = commerce_outbox::process_default_batch(
        &state.pool,
        None,
        Some(&state.dev_mailbox),
        "test@example.invalid",
        "http://localhost:3000",
    )
    .await
    .expect("outbox procesado");
    assert_eq!(summary.claimed, 1);
    assert_eq!(summary.processed, 1);
    assert_eq!(summary.retried, 0);

    let delivered: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT delivered_at FROM orders WHERE id = $1")
            .bind(order_id)
            .fetch_one(&state.pool)
            .await
            .expect("delivered_at");
    assert!(
        delivered.is_some(),
        "orden entregada solo tras éxito del correo"
    );

    let mailbox = state.dev_mailbox.lock().expect("lock buzón").clone();
    assert_eq!(mailbox.len(), 1, "un correo con el enlace de descarga");
    let link = mailbox[0].link.clone();
    assert!(link.contains("/api/downloads/"), "enlace opaco de descarga");
    let token = link
        .rsplit('/')
        .next()
        .expect("token en el enlace")
        .to_string();

    /* 8. Descarga privada con el grant. */
    let download = public_request("GET", &format!("/api/downloads/{token}"), None);
    let response = router.clone().oneshot(download).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "descarga válida");
    let bytes = body_bytes(response).await;
    assert_eq!(bytes, b"contenido-e2e-secreto");

    /* 9. Historial por cuenta (comprador con sesión): orden y descarga. */
    let orders = admin_request(
        "GET",
        "/api/me/orders",
        &buyer_token,
        &buyer_csrf,
        None,
        None,
    );
    let response = router.clone().oneshot(orders).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let orders_json: Value = body_json(response).await;
    let order_entry = orders_json
        .as_array()
        .expect("lista de órdenes")
        .iter()
        .find(|item| item["id"].as_str() == Some(&order_id.to_string()))
        .expect("la orden aparece en el historial del comprador");
    assert_eq!(order_entry["status"], "delivered");
    assert!(
        order_entry.get("stripe_payment_intent").is_none(),
        "sin intents internos"
    );
    assert!(
        order_entry.get("idempotency_key").is_none(),
        "sin claves internas"
    );

    let downloads = admin_request(
        "GET",
        "/api/me/downloads",
        &buyer_token,
        &buyer_csrf,
        None,
        None,
    );
    let response = router.clone().oneshot(downloads).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let downloads_json: Value = body_json(response).await;
    assert_eq!(downloads_json.as_array().expect("lista").len(), 1);
    assert!(
        downloads_json.to_string().contains("token") == false,
        "nunca expone el token"
    );

    /* 10. Reembolso admin: revoca el grant y marca la orden refundada. */
    let refund = admin_request(
        "POST",
        &format!("/api/admin/orders/{order_id}/refund"),
        &admin_token,
        &admin_csrf,
        Some(&admin_csrf),
        None,
    );
    let response = router.clone().oneshot(refund).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "reembolso ejecutado");
    let refund_json: Value = body_json(response).await;
    assert_eq!(refund_json["status"], "refunded");
    assert!(refund_json["refunded_at"].is_string());

    let entitlement_status: String =
        sqlx::query_scalar("SELECT status FROM entitlements WHERE order_id = $1")
            .bind(order_id)
            .fetch_one(&state.pool)
            .await
            .expect("status entitlement");
    assert_eq!(
        entitlement_status, "revoked",
        "grant revocado al reembolsar"
    );

    /* 11. Idempotencia del reembolso: reintentar no duplica ni cambia. */
    let replay = admin_request(
        "POST",
        &format!("/api/admin/orders/{order_id}/refund"),
        &admin_token,
        &admin_csrf,
        Some(&admin_csrf),
        None,
    );
    let response = router.clone().oneshot(replay).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "reembolso idempotente");
    let replay_json: Value = body_json(response).await;
    assert_eq!(replay_json["status"], "refunded");
    let revoked_at_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM entitlements WHERE order_id = $1 AND status = 'revoked'",
    )
    .bind(order_id)
    .fetch_one(&state.pool)
    .await
    .expect("count revoked");
    assert_eq!(revoked_at_count, 1, "un solo grant y sigue revocado");

    /* 12. La descarga revocada devuelve 403. */
    let download = public_request("GET", &format!("/api/downloads/{token}"), None);
    let response = router.clone().oneshot(download).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::FORBIDDEN,
        "grant revocado bloquea"
    );

    /* 13. Chargeback: segunda compra → disputa → grant revocado. */
    let checkout_body = json!({ "email": buyer_email, "idempotency_key": "e2e-checkout-key-2" });
    let checkout = public_request(
        "POST",
        &format!("/api/products/{product_id}/checkout"),
        Some(checkout_body),
    );
    let response = router.clone().oneshot(checkout).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let checkout_json: Value = body_json(response).await;
    let order2: Uuid = serde_json::from_value(checkout_json["order_id"].clone()).expect("order2");
    let session2 = checkout_json["session_id"]
        .as_str()
        .expect("session2")
        .to_string();

    let completed2 = test_event(
        &format!("evt_{run_tag}_completed2"),
        "checkout.session.completed",
        json!({
            "id": session2,
            "metadata": { "order_id": order2.to_string() },
            "payment_intent": "pi_test_654321"
        }),
    );
    let webhook = public_request("POST", "/api/webhook/stripe", Some(completed2));
    let response = router.clone().oneshot(webhook).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let summary = commerce_outbox::process_default_batch(
        &state.pool,
        None,
        Some(&state.dev_mailbox),
        "test@example.invalid",
        "http://localhost:3000",
    )
    .await
    .expect("outbox 2 procesado");
    assert_eq!(summary.processed, 1);
    let mailbox = state.dev_mailbox.lock().expect("lock buzón").clone();
    assert_eq!(mailbox.len(), 2, "segundo correo de descarga");
    let token2 = mailbox[1]
        .link
        .rsplit('/')
        .next()
        .expect("token2")
        .to_string();

    let dispute = test_event(
        &format!("evt_{run_tag}_dispute"),
        "charge.dispute.created",
        json!({
            "charge": "ch_test_abc",
            "payment_intent": "pi_test_654321",
            "status": "needs_response"
        }),
    );
    let webhook = public_request("POST", "/api/webhook/stripe", Some(dispute.clone()));
    let response = router.clone().oneshot(webhook).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK, "chargeback procesado");

    let status2: String = sqlx::query_scalar("SELECT status FROM orders WHERE id = $1")
        .bind(order2)
        .fetch_one(&state.pool)
        .await
        .expect("status order2");
    assert_eq!(status2, "disputed", "chargeback marca la orden disputada");

    /* 14. Replay del dispute: idempotente, no toca nada. */
    let dispute_replay = public_request("POST", "/api/webhook/stripe", Some(dispute));
    let response = router.clone().oneshot(dispute_replay).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let revoked2: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM entitlements WHERE order_id = $1 AND status = 'revoked'",
    )
    .bind(order2)
    .fetch_one(&state.pool)
    .await
    .expect("count revoked 2");
    assert_eq!(revoked2, 1, "replay del dispute no duplica la revocación");

    let download = public_request("GET", &format!("/api/downloads/{token2}"), None);
    let response = router.clone().oneshot(download).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::FORBIDDEN,
        "descarga disputada bloqueada"
    );

    /* 15. Refund de una orden no pagada → 409 (frontera de autoridad). */
    let checkout_body = json!({ "email": buyer_email, "idempotency_key": "e2e-checkout-key-3" });
    let checkout = public_request(
        "POST",
        &format!("/api/products/{product_id}/checkout"),
        Some(checkout_body),
    );
    let response = router.clone().oneshot(checkout).await.unwrap();
    let checkout_json: Value = body_json(response).await;
    let order3: Uuid = serde_json::from_value(checkout_json["order_id"].clone()).expect("order3");
    let refund = admin_request(
        "POST",
        &format!("/api/admin/orders/{order3}/refund"),
        &admin_token,
        &admin_csrf,
        Some(&admin_csrf),
        None,
    );
    let response = router.clone().oneshot(refund).await.unwrap();
    assert_eq!(
        response.status(),
        StatusCode::CONFLICT,
        "orden pendiente no reembolsable"
    );

    /* Limpieza: filas del test y storage temporal. */
    cleanup(
        &state,
        &[order_id, order2, order3],
        &[admin_id, buyer_id],
        product_id,
    )
    .await;
}

async fn cleanup(state: &AppState, order_ids: &[Uuid], user_ids: &[Uuid], product_id: Uuid) {
    for order_id in order_ids {
        sqlx::query("DELETE FROM entitlements WHERE order_id = $1")
            .bind(order_id)
            .execute(&state.pool)
            .await
            .expect("limpiar entitlements");
        sqlx::query("DELETE FROM commerce_outbox WHERE aggregate_id = $1")
            .bind(order_id)
            .execute(&state.pool)
            .await
            .expect("limpiar outbox");
    }
    sqlx::query("DELETE FROM orders WHERE product_id = $1")
        .bind(product_id)
        .execute(&state.pool)
        .await
        .expect("limpiar órdenes");
    sqlx::query("DELETE FROM stripe_events")
        .execute(&state.pool)
        .await
        .expect("limpiar eventos stripe");
    sqlx::query("DELETE FROM products WHERE id = $1")
        .bind(product_id)
        .execute(&state.pool)
        .await
        .expect("limpiar producto");
    sqlx::query("DELETE FROM resources WHERE id = $1")
        .bind(product_id)
        .execute(&state.pool)
        .await
        .expect("limpiar envelope");
    for user_id in user_ids {
        sqlx::query("DELETE FROM auth_sessions WHERE user_id = $1")
            .bind(user_id)
            .execute(&state.pool)
            .await
            .expect("limpiar sesiones");
        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&state.pool)
            .await
            .expect("limpiar usuarios");
    }
    let _ = std::fs::remove_dir_all(&state.upload_dir);
}
