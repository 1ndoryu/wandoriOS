-- [028A-12] Rollback: eliminar columnas e índice del soft delete.

DROP INDEX IF EXISTS idx_articles_trashed_updated;

ALTER TABLE articles
    DROP COLUMN IF EXISTS trashed,
    DROP COLUMN IF EXISTS deleted_at;
