/* wandori.us — Default Release
 * Release estático que representa el layout actual del escritorio.
 * Solo incluye nodos públicos. Los nodos admin se añaden dinámicamente
 * en stores.ts cuando el usuario está autenticado.
 * [Auditoría v4 §5.4] Nodos admin separados del bundle público. */

import type { WorkspaceNode, WorkspaceTree } from './types';

/** Release v1 — solo nodos públicos. */
export const DEFAULT_RELEASE: WorkspaceTree = {
  version: 1,
  nodes: {
    /* [018A-87] La carpeta "Galería" vacía se sustituye por "Documentos" con
     * subcarpetas por tipo: las subidas de media aterrizan aquí vía
     * media-gallery-sync (igual que Notas para artículos). Las subcarpetas
     * viven dentro de la carpeta (no ocupan grid del escritorio ni el
     * launcher móvil, que solo muestran el nivel raíz). */
    documentos: {
      id: 'documentos', parentId: 'desktop', type: 'folder', label: 'Documentos',
      position: { col: 0, row: 0 }, mobilePosition: { col: 0, row: 0 }, mobileOrder: 0, requires: 'public',
    },
    'documentos-imagenes': {
      id: 'documentos-imagenes', parentId: 'documentos', type: 'folder', label: 'Imágenes', requires: 'public',
    },
    'documentos-audio': {
      id: 'documentos-audio', parentId: 'documentos', type: 'folder', label: 'Audio', requires: 'public',
    },
    'documentos-video': {
      id: 'documentos-video', parentId: 'documentos', type: 'folder', label: 'Vídeo', requires: 'public',
    },
    'documentos-documentos': {
      id: 'documentos-documentos', parentId: 'documentos', type: 'folder', label: 'Documentos', requires: 'public',
    },
    projects: {
      id: 'projects', parentId: 'desktop', type: 'app', label: 'Proyectos', refId: 'projects',
      position: { col: 0, row: 1 }, mobilePosition: { col: 1, row: 0 }, mobileOrder: 1, requires: 'public',
    },
    profile: {
      id: 'profile', parentId: 'desktop', type: 'shortcut', label: 'Perfil', refId: 'shell-profile',
      position: { col: 0, row: 2 }, mobilePosition: { col: 2, row: 0 }, mobileOrder: 2, requires: 'public',
    },
    about: {
      id: 'about', parentId: 'desktop', type: 'app', label: 'About', refId: 'about',
      position: { col: 0, row: 3 }, mobilePosition: { col: 0, row: 1 }, mobileOrder: 3, requires: 'public',
    },
    trash: {
      id: 'trash', parentId: 'desktop', type: 'app', label: 'Papelera', refId: 'trash',
      position: { col: 1, row: 0 }, mobilePosition: { col: 1, row: 1 }, mobileOrder: 6, requires: 'public',
    },
    store: {
      id: 'store', parentId: 'desktop', type: 'app', label: 'Tienda', refId: 'store',
      position: { col: 1, row: 3 }, mobilePosition: { col: 1, row: 3 }, mobileOrder: 9, requires: 'public',
    },
    orders: {
      id: 'orders', parentId: 'desktop', type: 'app', label: 'Pedidos', refId: 'orders',
      position: { col: 1, row: 4 }, mobilePosition: { col: 2, row: 3 }, mobileOrder: 10, requires: 'public',
    },
    downloads: {
      id: 'downloads', parentId: 'desktop', type: 'app', label: 'Descargas', refId: 'downloads',
      position: { col: 1, row: 5 }, mobilePosition: { col: 0, row: 4 }, mobileOrder: 11, requires: 'public',
    },
    /* [GAME-01-F3] Entrada del fixture jugable; no convierte los previews
     * visuales en gameplay ni carga Three.js en el arranque. Los bocetos
     * game/game-3d se retiraron el 05-ago (dirección visual decidida). */
    gamePlayable: {
      id: 'gamePlayable', parentId: 'desktop', type: 'app', label: 'Bosque · prueba', refId: 'game-playable',
      position: { col: 2, row: 0 }, mobilePosition: { col: 1, row: 4 }, mobileOrder: 12, requires: 'public',
    },
  },
};

/** Nodos exclusivos de admin — NO incluidos en DEFAULT_RELEASE.
 *  Se añaden dinámicamente en stores.ts cuando capability = 'admin'. */
export const ADMIN_NODES: Record<string, WorkspaceNode> = {
  settings: {
    id: 'settings', parentId: 'desktop', type: 'app', label: 'Configuración', refId: 'settings',
    position: { col: 0, row: 4 }, mobilePosition: { col: 2, row: 1 }, mobileOrder: 4, requires: 'admin',
  },
  admin: {
    id: 'admin', parentId: 'desktop', type: 'app', label: 'Admin', refId: 'admin',
    position: { col: 0, row: 5 }, mobilePosition: { col: 0, row: 2 }, mobileOrder: 5, requires: 'admin',
  },
  mediaLibrary: {
    id: 'mediaLibrary', parentId: 'desktop', type: 'app', label: 'Biblioteca de media', refId: 'media-library',
    position: { col: 1, row: 1 }, mobilePosition: { col: 2, row: 2 }, mobileOrder: 7, requires: 'admin',
  },
  analytics: {
    id: 'analytics', parentId: 'desktop', type: 'app', label: 'Estadísticas', refId: 'analytics',
    position: { col: 1, row: 2 }, mobilePosition: { col: 0, row: 3 }, mobileOrder: 8, requires: 'admin',
  },
};
