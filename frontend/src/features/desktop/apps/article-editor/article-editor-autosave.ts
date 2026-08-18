/* wandori.us — Article Editor Autosave
 * Adaptador de autosave del editor de artículos.
 * [297A-14 F5] El mecanismo de debounce/teardown vive en utils/autosave.ts
 * (compartido con proyecto y producto); este módulo aporta el payload,
 * la persistencia vía ArticleService y el evento de dominio.
 *
 * Contrato: recibe un payload y decide crear o actualizar conservando el ID.
 * El autosave nunca cambia el estado editorial: guarda borradores sin
 * publicar (editorial independiente, publicación explícita). */

import { safeRun } from '../../../../utils/safe-async';
import { showToast } from '../../../../components/ui/toast';
import { ArticleService } from '../../../../services';
import { createDebouncedSaver } from '../../../../utils/autosave';
import { publishArticleEditorSaved } from '../../../runtime/article-editor-events';
import type { CreateArticleRequest, UpdateArticleRequest } from '../../../../api/types';

/** Payload editorial del borrador (título, extracto, contenido, portada). */
export interface ArticleDraftPayload {
  title: string;
  excerpt: string;
  content: Record<string, unknown>;
  cover_image?: string;
}

interface AutosaveDeps {
  /** Devuelve el ID actual; undefined = aún no creado. */
  getArticleId: () => string | undefined;
  /** Actualizar el ID tras el primer create (idempotencia create→update). */
  setArticleId: (id: string) => void;
  /** Devuelve el payload actual del formulario. */
  getPayload: () => ArticleDraftPayload;
  /** Guarda true si el editor sigue activo (no abortado/desmontado). */
  isActive: () => boolean;
}

export interface ArticleAutosave {
  /** Programar guardado tras debounce; se cancela al desmontar. */
  schedule: () => void;
  /** Cancelar el timer pendiente (manual save, close). */
  cancel: () => void;
  /** Destruir timers; idempotente. */
  destroy: () => void;
}

/** Debounce del autosave. Exportada para los tests (evita drift). */
export const AUTOSAVE_DELAY_MS = 2500;

/** Guardar el borrador (crear o actualizar) y anunciar solo CREATES. */
async function saveDraft(
  deps: AutosaveDeps,
): Promise<{ ok: boolean; created?: boolean }> {
  if (!deps.isActive()) return { ok: false };
  const payload = deps.getPayload();
  if (!payload.title.trim()) return { ok: false };

  const articleId = deps.getArticleId();
  const base: UpdateArticleRequest = {
    title: payload.title,
    excerpt: payload.excerpt,
    content: payload.content,
    cover_image: payload.cover_image,
  };

  /* Autosave nunca cambia el estado editorial: se conserva draft/private.
   * Solo create/update del contenido; publicar es explícito. */
  const request = articleId
    ? ArticleService.update(articleId, base)
    : ArticleService.create({ ...(base as CreateArticleRequest), status: 'draft' });

  const result = await safeRun(request, 'error al autoguardar');
  if (!deps.isActive() || !result.ok) return { ok: false };

  const created = !articleId;
  deps.setArticleId(result.value.id);
  /* [297A-14 F5] El autosave solo anuncia CREATES: el listado del Admin debe
   * ver aparecer artículos nuevos, pero re-renderizar la lista completa en
   * cada guardado debounced (2.5s) es churn innecesario. El 'updated' lo
   * emite el guardado manual explícito. */
  if (created) {
    publishArticleEditorSaved({ articleId: result.value.id, operation: 'created' });
  }
  return { ok: true, created };
}

/** Crear el autosave del editor de artículos (delega en el saver genérico). */
export function createArticleAutosave(deps: AutosaveDeps): ArticleAutosave {
  return createDebouncedSaver({
    delayMs: AUTOSAVE_DELAY_MS,
    isActive: deps.isActive,
    save: () => saveDraft(deps),
    onCreated: () => showToast('borrador creado'),
  });
}
