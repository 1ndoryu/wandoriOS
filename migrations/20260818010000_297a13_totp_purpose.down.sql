ALTER TABLE auth_action_tokens DROP CONSTRAINT IF EXISTS auth_action_tokens_purpose_check;
ALTER TABLE auth_action_tokens ADD CONSTRAINT auth_action_tokens_purpose_check
    CHECK (purpose IN ('email_verification', 'password_reset'));
