-- 297A-50: Catálogo allowlisted y selección de personaje base.
-- El catálogo es pequeño y público; su edición administrativa pertenece a Fase 7.

CREATE TABLE game_character_definitions (
    id VARCHAR(32) PRIMARY KEY,
    display_name VARCHAR(48) NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 48),
    body_tone VARCHAR(16) NOT NULL CHECK (body_tone IN ('ink', 'middle', 'paper')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO game_character_definitions (id, display_name, body_tone)
VALUES
    ('forest-scout', 'Explorador', 'ink'),
    ('forest-ranger', 'Guardabosques', 'middle'),
    ('forest-spirit', 'Espíritu', 'paper')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE user_game_profiles
    ADD COLUMN character_id VARCHAR(32) NOT NULL DEFAULT 'forest-scout'
        REFERENCES game_character_definitions(id) ON DELETE RESTRICT;

CREATE INDEX game_character_definitions_active_idx
    ON game_character_definitions (is_active, id);

CREATE INDEX user_game_profiles_character_idx
    ON user_game_profiles (character_id);
