-- 297A-15: idempotencia de compras, eventos de proveedor y grants privados.
-- Los campos legacy de products/orders se conservan para una migración segura.

ALTER TABLE orders
    ADD COLUMN idempotency_key VARCHAR(128),
    ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN product_version_id UUID REFERENCES product_versions(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX idx_orders_customer_idempotency
    ON orders(customer_email, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_product_version ON orders(product_version_id);

CREATE TABLE stripe_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stripe_events_pending ON stripe_events(processed_at)
    WHERE processed_at IS NULL;

CREATE TABLE entitlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_version_id UUID REFERENCES product_versions(id) ON DELETE RESTRICT,
    customer_email VARCHAR(255) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'revoked', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entitlements_email ON entitlements(customer_email);
CREATE INDEX idx_entitlements_expiry ON entitlements(expires_at)
    WHERE status = 'active';

CREATE TABLE commerce_outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    dedupe_key VARCHAR(255) NOT NULL UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}',
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_commerce_outbox_pending
    ON commerce_outbox(available_at)
    WHERE processed_at IS NULL;
