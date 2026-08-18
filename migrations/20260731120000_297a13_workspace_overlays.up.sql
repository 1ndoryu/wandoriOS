-- 297A-13: overlay privado del workspace por cuenta.
-- Solo persiste la intención del usuario; no guarda ResolvedWorkspace ni ventanas de sesión.
CREATE TABLE user_workspace_overlays (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    overlay JSONB NOT NULL,
    revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_workspace_overlays_updated_at
    ON user_workspace_overlays(updated_at DESC);
