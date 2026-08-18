-- 297A-55: Auditoría persistente de cambios sensibles del juego.
-- Separada de analytics: registra quién (kind) hizo qué sobre qué entidad,
-- sin tokens, coordenadas precisas ni datos privados. La retención operativa
-- prevista es de 90 días; la purga se hará en un bloque de operación futuro
-- (Fase 8), no en esta migración.

CREATE TABLE game_audit_events (
    id BIGSERIAL PRIMARY KEY,
    actor_id UUID NULL,
    actor_kind VARCHAR(16) NOT NULL CHECK (actor_kind IN ('admin', 'account', 'system')),
    action VARCHAR(48) NOT NULL,
    entity_kind VARCHAR(32) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX game_audit_events_entity_idx
    ON game_audit_events (entity_kind, entity_id, created_at DESC);

CREATE INDEX game_audit_events_created_idx
    ON game_audit_events (created_at DESC);
