/* wandori.us — Media → Documentos (forma física en el escritorio)
 * [018A-87] Análogo a article-notas-sync: cada media subido aterriza como
 * nodo resource en la subcarpeta de "Documentos" según su tipo
 * (image → Imágenes, audio → Audio, video → Vídeo, otro → Documentos).
 *
 * El sync solo muta el overlay local; el admin propaga el árbol a todos los
 * clientes con "Publicar escritorio" (workspace:publish). Al mover a la
 * papelera se retira el icono (tombstone); al restaurar, vuelve.
 *
 * A diferencia de Notas (que re-fetcha el artículo para el slug), el evento
 * media-changed ya trae id/tipo/etiqueta: el sync es síncrono y no hace red.
 * El thumbnail del Finder ya resuelve desde node.refId (/api/media/{id}/preview). */

import {
  subscribeMediaChanged,
  type MediaChangedEvent,
  type MediaChangedFileType,
} from '../media-events';
import {
  addOverlayNode,
  tombstoneNode,
  restoreNode,
  workspaceStore,
  overlayStore,
} from './workspace-store';
import type { WorkspaceNode } from './types';

/** Carpeta raíz "Documentos" (id estable del release). */
export const DOCUMENTOS_FOLDER_ID = 'documentos';

/** Subcarpetas destino por tipo (ids estables del release). */
export const MEDIA_FOLDERS: Record<MediaChangedFileType, string> = {
  image: 'documentos-imagenes',
  audio: 'documentos-audio',
  video: 'documentos-video',
  document: 'documentos-documentos',
};

const FOLDER_LABELS: Record<string, string> = {
  'documentos': 'Documentos',
  'documentos-imagenes': 'Imágenes',
  'documentos-audio': 'Audio',
  'documentos-video': 'Vídeo',
  'documentos-documentos': 'Documentos',
};

/** Mapea el tipo normalizado del backend al resourceKind del workspace. */
export function mediaTypeToResourceKind(fileType: MediaChangedFileType): WorkspaceNode['resourceKind'] {
  switch (fileType) {
    case 'image': return 'image';
    case 'audio': return 'audio';
    case 'video': return 'video';
    default: return 'document';
  }
}

/** Construye el nodo resource que representa un media en su subcarpeta. */
export function buildMediaNode(event: Pick<MediaChangedEvent, 'mediaId' | 'fileType' | 'label'>): WorkspaceNode {
  return {
    id: `media-${event.mediaId}`,
    parentId: MEDIA_FOLDERS[event.fileType] ?? MEDIA_FOLDERS.document,
    type: 'resource',
    label: event.label,
    refId: event.mediaId,
    resourceKind: mediaTypeToResourceKind(event.fileType),
    requires: 'public',
  };
}

/** Asegura que exista una carpeta; si se había borrado, limpia su tombstone. */
function ensureFolder(folderId: string, parentId: string, label: string): void {
  if (workspaceStore.get().nodes[folderId]) return;
  restoreNode(folderId);
  addOverlayNode({ id: folderId, parentId, type: 'folder', label, requires: 'public' });
}

/** Asegura la raíz "Documentos" y la subcarpeta destino del tipo subido. */
function ensureMediaDestination(fileType: MediaChangedFileType): void {
  ensureFolder(DOCUMENTOS_FOLDER_ID, 'desktop', FOLDER_LABELS[DOCUMENTOS_FOLDER_ID]);
  const folderId = MEDIA_FOLDERS[fileType] ?? MEDIA_FOLDERS.document;
  ensureFolder(folderId, DOCUMENTOS_FOLDER_ID, FOLDER_LABELS[folderId]);
}

/** Añade/actualiza el nodo del media. Si el nodo ya es del release, el overlay
 * no puede reemplazarlo: la etiqueta se sincroniza con fieldOverride (gana
 * sobre el resto en el merge). */
function ensureMediaNode(event: Pick<MediaChangedEvent, 'mediaId' | 'fileType' | 'label'>): void {
  const nodeId = `media-${event.mediaId}`;
  const existing = workspaceStore.get().nodes[nodeId];
  if (existing) {
    if (existing.label !== event.label) {
      overlayStore.update((prev) => ({
        ...prev,
        fieldOverrides: {
          ...prev.fieldOverrides,
          [nodeId]: { ...prev.fieldOverrides[nodeId], label: event.label },
        },
      }));
    }
    return;
  }
  addOverlayNode(buildMediaNode(event));
}

/** Retira el icono del media donde esté (Documentos u otra carpeta). */
function removeMediaNode(mediaId: string): void {
  const ws = workspaceStore.get();
  const node = Object.values(ws.nodes).find((n) => n.refId === mediaId);
  if (node) tombstoneNode(node.id);
}

/** Aplica el estado del media al workspace. Pura respecto a red. */
export function applyMediaToWorkspace(event: MediaChangedEvent): void {
  switch (event.operation) {
    case 'uploaded':
    case 'restored':
      ensureMediaDestination(event.fileType);
      ensureMediaNode(event);
      break;
    case 'deleted':
      removeMediaNode(event.mediaId);
      break;
  }
}

let initialized = false;

/** Registra el puente media → escritorio. Idempotente; devuelve unsubscribe. */
export function initMediaGallerySync(): () => void {
  if (initialized) return () => {};
  initialized = true;
  return subscribeMediaChanged((event) => {
    applyMediaToWorkspace(event);
  });
}
