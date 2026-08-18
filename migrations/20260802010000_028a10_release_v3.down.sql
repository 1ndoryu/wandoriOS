-- wandori.us — Rollback [028A-10]: elimina la release v3 (árbol canónico).
-- La release v2 vuelve a ser la activa (MAX(version)).

DELETE FROM workspace_releases WHERE version = 3;
