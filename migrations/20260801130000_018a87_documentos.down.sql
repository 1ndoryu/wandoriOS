-- wandori.us — Rollback [018A-87]: elimina la release v2 (Documentos).
-- La release v1 con la carpeta "Galería" vuelve a ser la activa.

DELETE FROM workspace_releases WHERE version = 2;
