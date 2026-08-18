-- GAME-01 / 297A-30: la autoría de un snapshot publicado también es inmutable.
-- Reemplaza el SET NULL inicial, incompatible con el trigger de inmutabilidad,
-- por RESTRICT para conservar published_by y la trazabilidad del autor.
ALTER TABLE game_map_versions
    DROP CONSTRAINT game_map_versions_published_by_fkey;

ALTER TABLE game_map_versions
    ADD CONSTRAINT game_map_versions_published_by_fkey
    FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE RESTRICT;
