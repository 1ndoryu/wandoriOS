-- [028A-12] Soft delete de artículos: el borrado conserva la fila para
-- restauración desde la Papelera admin, igual que el lifecycle 'trashed'
-- del envelope de resources (la fila de `resources` se marca en el service).

ALTER TABLE articles
    ADD COLUMN trashed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN deleted_at TIMESTAMPTZ;

CREATE INDEX idx_articles_trashed_updated
    ON articles (trashed, updated_at DESC);
