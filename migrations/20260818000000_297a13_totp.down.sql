-- 297A-13 down: revertir registro habilitado y columnas TOTP.
ALTER TABLE users DROP COLUMN IF EXISTS totp_confirmed_at;
ALTER TABLE users DROP COLUMN IF EXISTS totp_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS totp_secret;
UPDATE site_settings SET value = 'false' WHERE key = 'registration_enabled';
