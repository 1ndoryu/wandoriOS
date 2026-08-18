-- 297A-50 rollback: catálogo y selección allowlisted del juego.
DROP INDEX IF EXISTS user_game_profiles_character_idx;
DROP INDEX IF EXISTS game_character_definitions_active_idx;
ALTER TABLE user_game_profiles DROP COLUMN IF EXISTS character_id;
DROP TABLE IF EXISTS game_character_definitions;
