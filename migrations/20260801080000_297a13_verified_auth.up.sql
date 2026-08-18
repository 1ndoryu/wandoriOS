-- [297A-13] Verificación y recuperación usan tokens opacos de un solo uso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- Las cuentas existentes fueron creadas antes de este flujo y se consideran
-- verificadas; las nuevas quedan pendientes hasta consumir su token.
UPDATE users SET email_verified_at = created_at WHERE email_verified_at IS NULL;

CREATE TABLE auth_action_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose VARCHAR(32) NOT NULL CHECK (purpose IN ('email_verification', 'password_reset')),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_action_tokens_lookup_idx
    ON auth_action_tokens (purpose, token_hash)
    WHERE used_at IS NULL;
CREATE INDEX auth_action_tokens_user_idx
    ON auth_action_tokens (user_id, purpose, created_at DESC);
