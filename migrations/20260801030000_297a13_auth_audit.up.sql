-- 297A-13: auditoría mínima de autenticación sin guardar credenciales.
CREATE TABLE auth_audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL,
    ip_hash VARCHAR(64),
    succeeded BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_audit_created_at ON auth_audit_events(created_at DESC);
CREATE INDEX idx_auth_audit_user ON auth_audit_events(user_id, created_at DESC);
