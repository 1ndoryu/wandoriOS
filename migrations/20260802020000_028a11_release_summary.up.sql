-- wandori.us — Migration: summary y diff en releases del workspace
-- [028A-11] Cada release guarda un resumen auditable del cambio (nodos añadidos,
-- quitados y modificados) y la versión de la que deriva (diff_from).
-- Sin summary, publicar era una foto opaca: no había forma de saber qué
-- cambió entre vN y vN+1 ni de auditar "qué horneó" una release.
-- `summary` es JSONB con shape { added: [ids], removed: [ids], modified: [ids], nodeCount: n }.
-- `diff_from` es NULL para la primera release.

ALTER TABLE workspace_releases
    ADD COLUMN summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN diff_from INTEGER;
