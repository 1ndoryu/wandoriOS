-- 297A-13: habilitar registro público verificado + MFA TOTP (RFC 6238)
-- El registro pasa de deshabilitado a habilitado según decisión de producto
-- (2026-08-12); la verificación por email ya existía con token de un solo uso.

UPDATE site_settings SET value = 'true' WHERE key = 'registration_enabled';

-- Segundo factor: secreto base32 (nunca expuesto), flag habilitado y marca de
-- confirmación para auditoría local.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_confirmed_at TIMESTAMPTZ;
