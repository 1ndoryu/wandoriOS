-- wandori.us — Migration: release v3 con el árbol canónico del escritorio
-- [028A-10] El release v2 (018A-87) se creó como snapshot escrito a mano y
-- perdió los nodos de comercio (store/orders/downloads) que sí estaban en v1
-- (añadidos por 297A-15), y nunca incluyó la Papelera (trash). Esta migración
-- publica v3 con el árbol canónico: lo actual de v2 + trash + store + orders
-- + downloads, con las posiciones de default-release.ts (fuente canónica del
-- frontend). Se excluyen: snake (nodo fantasma sin app registrada en el
-- AppRegistry) y game/game3d/gamePlayable (prototipos GAME-01 ocultados
-- deliberadamente por el admin). v1/v2 quedan como histórico inmutable.
-- La release v3 es la que pasa a ser activa (MAX(version)).

INSERT INTO workspace_releases (version, tree) VALUES (
    3,
    '{
        "version": 3,
        "nodes": {
            "documentos": {
                "id": "documentos",
                "parentId": "desktop",
                "type": "folder",
                "label": "Documentos",
                "position": {"col": 0, "row": 0},
                "mobilePosition": {"col": 0, "row": 0},
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
                "mobilePosition": {"col": 1, "row": 0},
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
                "mobilePosition": {"col": 2, "row": 0},
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
                "mobilePosition": {"col": 0, "row": 1},
                "mobileOrder": 3,
                "requires": "public"
            },
            "trash": {
                "id": "trash",
                "parentId": "desktop",
                "type": "app",
                "label": "Papelera",
                "refId": "trash",
                "position": {"col": 1, "row": 0},
                "mobilePosition": {"col": 1, "row": 1},
                "mobileOrder": 6,
                "requires": "public"
            },
            "store": {
                "id": "store",
                "parentId": "desktop",
                "type": "app",
                "label": "Tienda",
                "refId": "store",
                "position": {"col": 1, "row": 3},
                "mobilePosition": {"col": 1, "row": 3},
                "mobileOrder": 9,
                "requires": "public"
            },
            "orders": {
                "id": "orders",
                "parentId": "desktop",
                "type": "app",
                "label": "Pedidos",
                "refId": "orders",
                "position": {"col": 1, "row": 4},
                "mobilePosition": {"col": 2, "row": 3},
                "mobileOrder": 10,
                "requires": "public"
            },
            "downloads": {
                "id": "downloads",
                "parentId": "desktop",
                "type": "app",
                "label": "Descargas",
                "refId": "downloads",
                "position": {"col": 1, "row": 5},
                "mobilePosition": {"col": 0, "row": 4},
                "mobileOrder": 11,
                "requires": "public"
            },
            "settings": {
                "id": "settings",
                "parentId": "desktop",
                "type": "app",
                "label": "Configuración",
                "refId": "settings",
                "position": {"col": 0, "row": 4},
                "mobilePosition": {"col": 2, "row": 1},
                "mobileOrder": 4,
                "requires": "admin"
            },
            "admin": {
                "id": "admin",
                "parentId": "desktop",
                "type": "app",
                "label": "Admin",
                "refId": "admin",
                "position": {"col": 0, "row": 5},
                "mobilePosition": {"col": 0, "row": 2},
                "mobileOrder": 5,
                "requires": "admin"
            }
        }
    }'::jsonb
);
