-- wandori.us — Migration: workspace releases
-- Tabla para almacenar releases inmutables del layout del escritorio.
-- [297A-11 §9.2] Publicación admin → release inmutable.

CREATE TABLE workspace_releases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version INTEGER NOT NULL UNIQUE,
    tree JSONB NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_workspace_releases_version ON workspace_releases(version DESC);

-- Insertar release v1 con el layout por defecto del desktop
INSERT INTO workspace_releases (version, tree) VALUES (
    1,
    '{
        "version": 1,
        "nodes": {
            "gallery": {
                "id": "gallery",
                "parentId": "desktop",
                "type": "folder",
                "label": "Galería",
                "position": {"col": 0, "row": 0},
                "mobileOrder": 0,
                "requires": "public"
            },
            "projects": {
                "id": "projects",
                "parentId": "desktop",
                "type": "app",
                "label": "Proyectos",
                "refId": "projects",
                "position": {"col": 0, "row": 1},
                "mobileOrder": 1,
                "requires": "public"
            },
            "profile": {
                "id": "profile",
                "parentId": "desktop",
                "type": "shortcut",
                "label": "Perfil",
                "refId": "shell-profile",
                "position": {"col": 0, "row": 2},
                "mobileOrder": 2,
                "requires": "public"
            },
            "about": {
                "id": "about",
                "parentId": "desktop",
                "type": "app",
                "label": "About",
                "refId": "about",
                "position": {"col": 0, "row": 3},
                "mobileOrder": 3,
                "requires": "public"
            },
            "snake": {
                "id": "snake",
                "parentId": "desktop",
                "type": "app",
                "label": "Snake",
                "refId": "snake",
                "position": {"col": 0, "row": 4},
                "mobileOrder": 4,
                "requires": "public"
            },
            "settings": {
                "id": "settings",
                "parentId": "desktop",
                "type": "app",
                "label": "Configuración",
                "refId": "settings",
                "position": {"col": 0, "row": 5},
                "mobileOrder": 5,
                "requires": "admin"
            },
            "admin": {
                "id": "admin",
                "parentId": "desktop",
                "type": "app",
                "label": "Admin",
                "refId": "admin",
                "position": {"col": 0, "row": 6},
                "mobileOrder": 6,
                "requires": "admin"
            }
        }
    }'::jsonb
);
