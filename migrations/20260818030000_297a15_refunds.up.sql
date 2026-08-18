-- 297A-15: reembolsos y chargebacks.
-- La autoridad de reembolso permanece server-side; el grant se revoca y la
-- orden pasa a 'refunded'/'disputed' de forma idempotente (los reintentos del
-- proveedor no duplican la revocación ni re-activan la descarga).

ALTER TABLE orders ADD COLUMN refunded_at TIMESTAMPTZ;

-- El webhook de reembolso/chargeback llega por payment_intent, no por session.
CREATE INDEX idx_orders_payment_intent
    ON orders(stripe_payment_intent)
    WHERE stripe_payment_intent IS NOT NULL;
