-- wandori.us — Migration rollback: quitar activación explícita de releases
-- [028A-13] Revertir el mecanismo de activación: se vuelve a MAX(version).

DROP INDEX IF EXISTS idx_workspace_releases_active;

ALTER TABLE workspace_releases
    DROP COLUMN IF EXISTS is_active;
