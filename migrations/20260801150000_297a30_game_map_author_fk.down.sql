-- GAME-01 / 297A-30: rollback de la FK de autoría inmutable.
ALTER TABLE game_map_versions
    DROP CONSTRAINT game_map_versions_published_by_fkey;

ALTER TABLE game_map_versions
    ADD CONSTRAINT game_map_versions_published_by_fkey
    FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL;
