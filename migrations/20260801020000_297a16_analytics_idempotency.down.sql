DROP INDEX IF EXISTS idx_analytics_events_event_id;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS event_id;
