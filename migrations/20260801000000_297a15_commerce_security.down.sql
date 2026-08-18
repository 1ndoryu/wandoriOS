DROP TABLE IF EXISTS commerce_outbox;
DROP TABLE IF EXISTS entitlements;
DROP TABLE IF EXISTS stripe_events;
DROP INDEX IF EXISTS idx_orders_product_version;
DROP INDEX IF EXISTS idx_orders_user_id;
DROP INDEX IF EXISTS idx_orders_customer_idempotency;
ALTER TABLE orders
    DROP COLUMN IF EXISTS product_version_id,
    DROP COLUMN IF EXISTS user_id,
    DROP COLUMN IF EXISTS idempotency_key;
