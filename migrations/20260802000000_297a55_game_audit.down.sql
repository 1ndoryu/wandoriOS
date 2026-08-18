-- 297A-55 rollback: auditoría persistente del juego.
DROP INDEX IF EXISTS game_audit_events_created_idx;
DROP INDEX IF EXISTS game_audit_events_entity_idx;
DROP TABLE IF EXISTS game_audit_events;
