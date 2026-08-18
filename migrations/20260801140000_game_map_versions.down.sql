-- GAME-01 / 297A-28: rollback del almacenamiento de mapas publicados.
DROP TABLE IF EXISTS game_map_versions;
DROP FUNCTION IF EXISTS protect_game_map_version_snapshot();
