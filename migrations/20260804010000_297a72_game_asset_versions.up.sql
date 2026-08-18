-- GAME-01 / 297A-72: versiones inmutables de assets del Bosque (Assets 3D).
-- Cada versión referencia un GLB almacenado por hash (content-addressed bajo
-- upload_dir/assets/{hash}.glb); una publicación antigua de un mapa conserva
-- su versión aunque el asset original se edite. Solo `is_active` cambia tras
-- la creación: activar una versión desactiva las demás y la congela.
CREATE TABLE game_asset_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id VARCHAR(48) NOT NULL REFERENCES game_assets(id) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    content_hash VARCHAR(128) NOT NULL,
    storage_path VARCHAR(256) NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 16777216),
    kind VARCHAR(16) NOT NULL DEFAULT 'glb' CHECK (kind = 'glb'),
    category VARCHAR(16) NOT NULL CHECK (category IN ('terrain', 'tree', 'rock', 'water', 'character', 'generic')),
    proxy JSONB,
    scale DOUBLE PRECISION NOT NULL DEFAULT 1.0 CHECK (scale > 0 AND scale <= 4),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT game_asset_versions_asset_version_uq UNIQUE (asset_id, version),
    CONSTRAINT game_asset_versions_proxy_kind_ck CHECK (
        proxy IS NULL OR proxy->>'kind' IN ('circle', 'aabb')
    )
);

CREATE INDEX idx_game_asset_versions_asset_version
    ON game_asset_versions (asset_id, version DESC);

CREATE INDEX idx_game_asset_versions_storage_path
    ON game_asset_versions (storage_path);

CREATE UNIQUE INDEX game_asset_versions_one_active_per_asset
    ON game_asset_versions (asset_id)
    WHERE is_active = TRUE;

-- Una versión publicada (activa) es inmutable: ni metadata ni borrado. Las
-- versiones AÚN NO activas pueden editar su metadata (proxy/scale) y ser
-- borradas por la herramienta de pruebas, pero el snapshot (hash/storage/
-- categoría/creador) nunca cambia y activar desactiva las demás.
CREATE FUNCTION protect_game_asset_version_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    /* La versión activa es inmutable: ni metadata, ni borrado, ni cambio de
     * snapshot. Las inactivas solo pueden editar metadata y borrarse. */
    IF OLD.is_active THEN
        IF TG_OP = 'DELETE'
            OR NEW.proxy IS DISTINCT FROM OLD.proxy
            OR NEW.scale IS DISTINCT FROM OLD.scale THEN
            RAISE EXCEPTION 'la versión de asset activa es inmutable';
        END IF;
    END IF;
    IF TG_OP = 'UPDATE'
        AND (NEW.id IS DISTINCT FROM OLD.id
            OR NEW.asset_id IS DISTINCT FROM OLD.asset_id
            OR NEW.version IS DISTINCT FROM OLD.version
            OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
            OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
            OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
            OR NEW.kind IS DISTINCT FROM OLD.kind
            OR NEW.category IS DISTINCT FROM OLD.category
            OR NEW.created_by IS DISTINCT FROM OLD.created_by
            OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
        RAISE EXCEPTION 'el snapshot de game_asset_versions es inmutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER protect_game_asset_version_snapshot_trigger
BEFORE UPDATE OR DELETE ON game_asset_versions
FOR EACH ROW EXECUTE FUNCTION protect_game_asset_version_snapshot();
