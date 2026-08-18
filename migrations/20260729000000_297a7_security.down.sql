-- 297A-7 rollback: revertir cambios de seguridad inmediata

-- Eliminar feature flag de registro
DELETE FROM site_settings WHERE key = 'registration_enabled';

-- Eliminar columnas de role y status
ALTER TABLE users DROP COLUMN IF EXISTS status;
ALTER TABLE users DROP COLUMN IF EXISTS role;

-- Eliminar tipos enum
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS user_role;
