-- 297A-13: el reto de segundo factor usa el mismo almacén de tokens de acción.
-- El CHECK original solo admitía verificación y recuperación; se amplía.
ALTER TABLE auth_action_tokens DROP CONSTRAINT IF EXISTS auth_action_tokens_purpose_check;
ALTER TABLE auth_action_tokens ADD CONSTRAINT auth_action_tokens_purpose_check
    CHECK (purpose IN ('email_verification', 'password_reset', 'totp_challenge'));
