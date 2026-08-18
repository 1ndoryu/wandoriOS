-- GAME-01 / 297A-71: borrador editable de un mapa del Bosque.
-- Un único borrador por mapa (clave natural map_id), con revisión optimista
-- (`revision` sube en cada guardado y el cliente la manda como expected).
-- Publicar una versión inmutable elimina el borrador en la misma transacción:
-- la versión publicada pasa a ser la nueva base y el borrador queda obsoleto.
CREATE TABLE game_map_drafts (
    map_id VARCHAR(128) PRIMARY KEY,
    revision INTEGER NOT NULL CHECK (revision > 0),
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    content_hash VARCHAR(256) NOT NULL,
    document JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT game_map_drafts_document_size_ck
        CHECK (octet_length(document::text) <= 4194304)
);

CREATE INDEX idx_game_map_drafts_updated_at
    ON game_map_drafts (updated_at DESC);
