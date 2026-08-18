/* wandori.us — Admin Articles
 * Listado editorial legacy; el editor vive en la app lazy `article-editor`.
 * [297A-14] El Admin no contiene ventanas ni el editor Tiptap. */

import { safeRun, safeClick } from '../utils/safe-async';
import { tryCatch } from '../utils/result';
import { ArticleService } from '../services';
import { showConfirm } from '../components/ui/confirm';
import { clearArticleCache } from '../components/layout/sidebar';
import { createEl } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { publishArticleEditorSaved, subscribeArticleEditorSaved } from '../features/runtime/article-editor-events';
import { showToast } from '../components/ui/toast';
import type { Article } from '../api/types';

const articleListCleanups = new WeakMap<HTMLElement, () => void>();
const articleListGenerations = new WeakMap<HTMLElement, number>();

/** Liberar la suscripción de una lista antes de desmontar su app contenedora. */
export function disposeArticleList(container: HTMLElement): void {
  const cleanup = articleListCleanups.get(container);
  cleanup?.();
  articleListCleanups.delete(container);
  articleListGenerations.delete(container);
}

function ensureArticleListSubscription(container: HTMLElement): void {
  if (articleListCleanups.has(container)) return;
  const cleanup = subscribeArticleEditorSaved(() => {
    clearArticleCache();
    if (!container.isConnected) {
      disposeArticleList(container);
      return;
    }
    void renderArticleList(container);
  });
  articleListCleanups.set(container, cleanup);
}

/** Liberar todas las listas pertenecientes a una página Admin. */
export function disposeAdminArticleLists(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('.admin-lista').forEach(disposeArticleList);
}

/** Abrir el programa editorial compartido, para crear o editar un artículo. */
export function openEditor(article?: Article): void {
  void import('../features/runtime/route-app-adapter')
    .then(({ openAppWindow }) => {
      const params = article ? { articleId: article.id } : undefined;
      return openAppWindow('article-editor', params);
    })
    .catch(() => {
      showToast('no se pudo abrir el editor');
    });
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export async function renderArticleList(container: HTMLElement): Promise<void> {
  ensureArticleListSubscription(container);
  const generation = (articleListGenerations.get(container) ?? 0) + 1;
  articleListGenerations.set(container, generation);
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const listResult = await tryCatch(ArticleService.listByStatus('all'));
  if (articleListGenerations.get(container) !== generation) return;
  if (!listResult.ok) {
    container.textContent = '';
    container.appendChild(createVacio('error al cargar'));
    return;
  }

  container.textContent = '';
  for (const article of listResult.value.items) {
    const title = createEl('span', {
      textContent: article.title
        + (article.status === 'draft' ? ' (borrador)' : '')
        + (article.is_pinned ? ' · fijado' : ''),
    });
    const date = createEl('small', {
      className: 'ml-sm',
      textContent: ` — ${formatDate(article.created_at)}`,
    });
    const info = createEl('div', {}, title, date);

    const editButton = createEl('button', {
      type: 'button',
      className: 'boton boton-pequeno',
      textContent: 'editar',
    });
    editButton.addEventListener('click', () => openEditor(article));

    const deleteButton = createEl('button', {
      type: 'button',
      className: 'boton boton-pequeno',
      textContent: 'eliminar',
    });
    deleteButton.addEventListener('click', safeClick(async () => {
      const confirmed = await showConfirm(`eliminar "${article.title}"?`);
      if (!confirmed) return;
      const result = await safeRun(ArticleService.delete(article.id), 'error al eliminar');
      if (!result.ok) return;
      showToast('articulo eliminado');
      /* [028A-12] El borrado es soft delete: notifica al canal de dominio para
       * que article-notas-sync retire el nodo del escritorio (tombstone). */
      publishArticleEditorSaved({ articleId: article.id, operation: 'deleted' });
      clearArticleCache();
      await renderArticleList(container);
    }));

    const actions = createEl('div', { className: 'admin-acciones' }, editButton, deleteButton);
    container.appendChild(createEl('div', { className: 'admin-item' }, info, actions));
  }

  if (listResult.value.items.length === 0) {
    container.appendChild(createVacio('no hay articulos'));
  }
}
