-- [297A-21] Persistent notifications are separate from workspace overlays.
-- A release creates one published notice atomically; admin notices use the same
-- contract so the frontend has one delivery source.
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind VARCHAR(40) NOT NULL,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(500) NOT NULL,
    release_version INTEGER REFERENCES workspace_releases(version) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'archived')),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX notifications_release_version_uq
    ON notifications (release_version)
    WHERE release_version IS NOT NULL;
CREATE INDEX notifications_public_created_idx
    ON notifications (created_at DESC)
    WHERE status = 'published';

CREATE TABLE notification_reads (
    notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (notification_id, user_id)
);

-- Make the current public release visible immediately after migration. The
-- partial unique index makes this safe if a deployment is retried.
-- [018A-62] Fix 42P10: ON CONFLICT contra un indice parcial exige repetir su
-- predicado (WHERE release_version IS NOT NULL); sin el, Postgres no infiere
-- el "arbiter index" y aborta. Migracion nunca aplicable en ningun entorno,
-- por eso se edita en sitio en lugar de crear migracion nueva.
INSERT INTO notifications (kind, title, body, release_version, status, created_by, published_at)
SELECT 'workspace_release', 'Novedades del escritorio',
       'El escritorio público está disponible en la versión ' || version || '.',
       version, 'published', published_by, published_at
FROM workspace_releases
WHERE version = (SELECT MAX(version) FROM workspace_releases)
ON CONFLICT (release_version) WHERE release_version IS NOT NULL DO NOTHING;
