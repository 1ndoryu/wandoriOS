-- 297A-60: Catálogo allowlisted de assets del Bosque.
-- El contrato de mapa referencia instancias por assetVersionId (Fase 7); este
-- catálogo define los assets base (categoría allowlisted) que el Editor de mapa
-- colocará y que Assets 3D ampliará con versiones inmutables y storage por hash.

CREATE TABLE game_assets (
    id VARCHAR(48) PRIMARY KEY,
    display_name VARCHAR(64) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 64),
    category VARCHAR(16) NOT NULL CHECK (category IN ('terrain', 'tree', 'rock', 'water', 'character', 'generic')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO game_assets (id, display_name, category)
VALUES
    ('terrain', 'Terreno', 'terrain'),
    ('tree', 'Árbol', 'tree'),
    ('rock', 'Roca', 'rock'),
    ('water', 'Agua', 'water')
ON CONFLICT (id) DO NOTHING;

CREATE INDEX game_assets_active_idx ON game_assets (is_active, id);
