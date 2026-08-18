-- 297A-13: Preferencias privadas por cuenta.
-- El tema es el primer valor sincronizado; revision evita sobrescrituras silenciosas.

CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme VARCHAR(16) NOT NULL DEFAULT 'system'
        CHECK (theme IN ('system', 'claro', 'oscuro')),
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
