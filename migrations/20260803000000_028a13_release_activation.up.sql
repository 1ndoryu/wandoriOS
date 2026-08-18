-- wandori.us — Migration: activación explícita de releases del workspace
-- [028A-13] Hasta ahora la release "activa" era la de mayor versión (MAX),
-- así que publicar una foto incompleta (incidente v4 con 3 nodos) dejaba el
-- escritorio sin Papelera sin forma de revertir desde la UI.
-- Esta migración añade `is_active` con índice único parcial (una sola activa)
-- y deja activa la de mayor versión para preservar el estado actual.
-- El panel Admin (028A-14) permitirá activar cualquier versión validada.

ALTER TABLE workspace_releases
    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT false;

-- Preservar el estado actual: la de mayor versión queda activa.
UPDATE workspace_releases
SET is_active = true
WHERE version = (SELECT MAX(version) FROM workspace_releases);

-- Garantiza que solo exista una release activa a la vez.
CREATE UNIQUE INDEX idx_workspace_releases_active
    ON workspace_releases (is_active)
    WHERE is_active;
