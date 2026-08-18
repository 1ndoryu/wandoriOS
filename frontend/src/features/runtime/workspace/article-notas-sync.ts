/* wandori.us — Artículo → Notas (forma física en el escritorio)
 * [018A-76] Da forma física a los artículos publicados: garantiza la carpeta
 * real "Notas" en el escritorio (nodo folder normal, no un contenedor virtual)
 * y coloca el artículo dentro como nodo resource con locator público
 * (reader + slug). La carpeta es un nodo real del workspace: se puede
 * renombrar, mover, recibir subcarpetas y los artículos se pueden mover fuera
 * de ella; "Notas" es solo el destino inicial por defecto.
 *
 * El sync solo muta el overlay local; el admin propaga el árbol a todos los
 * clientes con "Publicar escritorio" (workspace:publish). Al dejar de estar
 * publicado, el icono se retira (tombstone) para no dejar accesos muertos. */

import { ArticleService } from '../../../services';
import { subscribeArticleEditorSaved } from '../article-editor-events';
import {
  addOverlayNode,
  tombstoneNode,
  restoreNode,
  workspaceStore,
  overlayStore,
} from './workspace-store';
import type { WorkspaceNode } from './types';
import type { Article } from '../../../api/types';

/** ID estable de la carpeta "Notas": aunque se renombre o mueva, los nuevos
 * artículos publicados siguen aterrizando en ella. */
export const NOTAS_FOLDER_ID = 'notas';

/** Construye el nodo resource que representa un artículo publicado. */
export function buildArticleNode(
  article: Pick<Article, 'id' | 'title' | 'slug'>,
): WorkspaceNode {
  return {
    id: `nota-${article.id}`,
    parentId: NOTAS_FOLDER_ID,
    type: 'resource',
    label: article.title,
    refId: article.id,
    resourceKind: 'article',
    publicLocator: { appId: 'reader', params: { slug: article.slug } },
    requires: 'public',
  };
}

/** Asegura que exista la carpeta real "Notas" en el escritorio. */
function ensureNotasFolder(): void {
  if (workspaceStore.get().nodes[NOTAS_FOLDER_ID]) return;
  /* Si se había eliminado antes, limpiar el tombstone para que el nodo
   * recién añadido no compita con un borrado fantasma. */
  restoreNode(NOTAS_FOLDER_ID);
  addOverlayNode({
    id: NOTAS_FOLDER_ID,
    parentId: 'desktop',
    type: 'folder',
    label: 'Notas',
    mobilePosition: { col: 2, row: 0 },
    mobileOrder: 12,
    requires: 'public',
  });
}

/** Añade/actualiza el nodo del artículo. Si el artículo ya es nodo del release
 * (después de publicar el escritorio), el id colisiona y el overlay no puede
 * reemplazarlo: la etiqueta se sincroniza con un fieldOverride, que merge
 * aplica al final y gana sobre el resto. */
function ensureArticleNode(article: Pick<Article, 'id' | 'title' | 'slug'>): void {
  const nodeId = `nota-${article.id}`;
  const existing = workspaceStore.get().nodes[nodeId];
  if (existing) {
    if (existing.label !== article.title) {
      overlayStore.update((prev) => ({
        ...prev,
        fieldOverrides: {
          ...prev.fieldOverrides,
          [nodeId]: { ...prev.fieldOverrides[nodeId], label: article.title },
        },
      }));
    }
    return;
  }
  addOverlayNode(buildArticleNode(article));
}

/** Retira el icono del artículo donde esté (Notas u otra carpeta). */
function removeArticleNode(articleId: string): void {
  const ws = workspaceStore.get();
  const node = Object.values(ws.nodes).find((n) => n.refId === articleId);
  if (node) tombstoneNode(node.id);
}

/** Aplica el estado editorial del artículo al workspace. Pura respecto a red
 * (el fetch vive en syncArticleToWorkspace), testeable con fixture. */
export function applyArticleToWorkspace(
  article: Pick<Article, 'id' | 'title' | 'slug' | 'status'>,
): void {
  if (article.status === 'published' && article.slug) {
    ensureNotasFolder();
    ensureArticleNode(article);
  } else {
    removeArticleNode(article.id);
  }
}

async function syncArticleToWorkspace(articleId: string): Promise<void> {
  try {
    const article = await ArticleService.getById(articleId);
    applyArticleToWorkspace(article);
  } catch {
    /* El artículo pudo eliminarse entre el evento y la consulta; no fallar. */
  }
}

let initialized = false;

/** Registra el puente artículo → escritorio. Idempotente; devuelve unsubscribe. */
export function initArticleNotasSync(): () => void {
  if (initialized) return () => {};
  initialized = true;
  return subscribeArticleEditorSaved((event) => {
    /* [028A-12] El soft delete llega por el canal de dominio: retira el nodo
     * directamente (el fetch del artículo daría 404 tras el borrado). */
    if (event.operation === 'deleted') {
      removeArticleNode(event.articleId);
      return;
    }
    void syncArticleToWorkspace(event.articleId);
  });
}
