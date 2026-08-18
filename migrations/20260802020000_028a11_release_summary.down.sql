-- wandori.us — Rollback [028A-11]: elimina summary y diff_from de releases.
ALTER TABLE workspace_releases
    DROP COLUMN summary,
    DROP COLUMN diff_from;
