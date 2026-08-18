-- 297A-7: Seguridad inmediata — roles, estado de usuario y control de registro

-- === USERS: añadir role y status ===
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('user', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role user_role NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status user_status NOT NULL DEFAULT 'active';

-- Índice para queries de admin
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- === FEATURE FLAG: registro público ===
-- Insertar feature flag para control de registro (apagado por defecto)
INSERT INTO site_settings (key, value) VALUES ('registration_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
