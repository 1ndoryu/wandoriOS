-- 297A-15: rollback de reembolsos y chargebacks.
DROP INDEX IF EXISTS idx_orders_payment_intent;
ALTER TABLE orders DROP COLUMN IF EXISTS refunded_at;
