-- GAME-01 / 297A-28: snapshots publicados e inmutables de mapas del bosque.
-- La publicación admin se implementará en un bloque posterior; esta migración
-- solo establece el boundary de lectura y las invariantes de almacenamiento.
CREATE TABLE game_map_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    map_id VARCHAR(128) NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    content_hash VARCHAR(256) NOT NULL,
    document JSONB NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT game_map_versions_document_size_ck
        CHECK (octet_length(document::text) <= 4194304),
    CONSTRAINT game_map_versions_map_version_uq UNIQUE (map_id, version)
);

CREATE INDEX idx_game_map_versions_map_version
    ON game_map_versions (map_id, version DESC);

CREATE UNIQUE INDEX game_map_versions_one_active_per_map
    ON game_map_versions (map_id)
    WHERE is_active = TRUE;

-- Un snapshot publicado es inmutable. La futura publicación solo podrá cambiar
-- `is_active` para activar una versión ya validada dentro de una transacción.
CREATE FUNCTION protect_game_map_version_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'game_map_versions es inmutable';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
        OR NEW.map_id IS DISTINCT FROM OLD.map_id
        OR NEW.version IS DISTINCT FROM OLD.version
        OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
        OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
        OR NEW.document IS DISTINCT FROM OLD.document
        OR NEW.published_at IS DISTINCT FROM OLD.published_at
        OR NEW.published_by IS DISTINCT FROM OLD.published_by THEN
        RAISE EXCEPTION 'el snapshot de game_map_versions es inmutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_game_map_version_snapshot_trigger
BEFORE UPDATE OR DELETE ON game_map_versions
FOR EACH ROW EXECUTE FUNCTION protect_game_map_version_snapshot();
