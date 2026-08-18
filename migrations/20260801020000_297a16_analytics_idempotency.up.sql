-- 297A-16: deduplicación de lotes de analytics.
-- El cliente puede reintentar un lote sin inflar las métricas.
ALTER TABLE analytics_events ADD COLUMN event_id UUID;
CREATE UNIQUE INDEX idx_analytics_events_event_id
    ON analytics_events(event_id)
    WHERE event_id IS NOT NULL;
