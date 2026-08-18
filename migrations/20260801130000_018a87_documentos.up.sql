-- wandori.us — Migration: release v2 con carpeta Documentos
-- [018A-87] El usuario pidió que los archivos subidos aterricen en una
-- ubicación del OS: una carpeta de documentos con subcarpetas por tipo.
-- Se sustituye la carpeta "Galería" vacía (desconectada del media) por
-- "Documentos" con Imágenes/Audio/Vídeo/Documentos. La release v1 queda
-- como histórico inmutable; el frontend toma la de mayor versión.
-- La página pública web /gallery se mantiene intacta (no es el workspace).

INSERT INTO workspace_releases (version, tree) VALUES (
    2,
    '{
        "version": 2,
        "nodes": {
            "documentos": {
                "id": "documentos",
                "parentId": "desktop",
                "type": "folder",
                "label": "Documentos",
                "position": {"col": 0, "row": 0},
                "mobileOrder": 0,
                "requires": "public"
            },
            "documentos-imagenes": {
                "id": "documentos-imagenes",
                "parentId": "documentos",
                "type": "folder",
                "label": "Imágenes",
                "requires": "public"
            },
            "documentos-audio": {
                "id": "documentos-audio",
                "parentId": "documentos",
                "type": "folder",
                "label": "Audio",
                "requires": "public"
            },
            "documentos-video": {
                "id": "documentos-video",
                "parentId": "documentos",
                "type": "folder",
                "label": "Vídeo",
                "requires": "public"
            },
            "documentos-documentos": {
                "id": "documentos-documentos",
                "parentId": "documentos",
                "type": "folder",
                "label": "Documentos",
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
