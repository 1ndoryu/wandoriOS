/* wandori.us — Project Editor Autosave
 * Adaptador de autosave del editor de proyectos.
 * [297A-14 F5] Reutiliza el saver genérico (utils/autosave.ts) con payload y
 * persistencia propios vía ProjectService. Autosave solo guarda contenido
 * (título/descripción/url/orden); `is_visible` (editorial) solo cambia con
 * el guardado manual explícito. */

import { safeRun } from '../../../../utils/safe-async';
import { showToast } from '../../../../components/ui/toast';
import { ProjectService } from '../../../../services';
import { createDebouncedSaver } from '../../../../utils/autosave';
import { publishProjectEditorSaved } from '../../../runtime/project-editor-events';
import type { CreateProjectRequest, UpdateProjectRequest } from '../../../../api/types';

/** Payload del borrador de proyecto (sin visibilidad editorial). */
export interface ProjectDraftPayload {
  title: string;
  description: string;
  url: string;
  /** [018A-85] URL de la imagen de portada ('' = sin portada). */
  coverImage: string;
  sortOrder: number;
}

interface AutosaveDeps {
  /** Devuelve el ID actual; undefined = aún no creado. */
  getProjectId: () => string | undefined;
  /** Actualizar el ID tras el primer create (idempotencia create→update). */
  setProjectId: (id: string) => void;
  /** Devuelve el payload actual del formulario. */
  getPayload: () => ProjectDraftPayload;
  /** Guarda true si el editor sigue activo (no abortado/desmontado). */
  isActive: () => boolean;
}

export interface ProjectAutosave {
  schedule: () => void;
  cancel: () => void;
  destroy: () => void;
}

/** Debounce del autosave de proyectos. */
export const PROJECT_AUTOSAVE_DELAY_MS = 2500;

/** Guardar el borrador (crear o actualizar) y anunciar solo CREATES. */
async function saveDraft(
  deps: AutosaveDeps,
): Promise<{ ok: boolean; created?: boolean }> {
  if (!deps.isActive()) return { ok: false };
  const payload = deps.getPayload();
  if (!payload.title.trim()) return { ok: false };

  const projectId = deps.getProjectId();
  const base: UpdateProjectRequest = {
    title: payload.title,
    description: payload.description,
    url: payload.url.trim() || null,
    /* [018A-85] El autosave persiste la portada actual del formulario;
     * vacía se manda como null (limpiar) para mantener paridad con el editor. */
    cover_image: payload.coverImage || null,
    sort_order: payload.sortOrder,
  };

  /* Autosave nunca cambia la visibilidad: nace oculto y publicar es explícito. */
  const request = projectId
    ? ProjectService.update(projectId, base)
    : ProjectService.create({ ...(base as CreateProjectRequest), is_visible: false });

  const result = await safeRun(request, 'error al autoguardar proyecto');
  if (!deps.isActive() || !result.ok) return { ok: false };

  const created = !projectId;
  deps.setProjectId(result.value.id);
  if (created) {
    publishProjectEditorSaved({ projectId: result.value.id, operation: 'created' });
  }
  return { ok: true, created };
}

/** Crear el autosave del editor de proyectos (delega en el saver genérico). */
export function createProjectAutosave(deps: AutosaveDeps): ProjectAutosave {
  return createDebouncedSaver({
    delayMs: PROJECT_AUTOSAVE_DELAY_MS,
    isActive: deps.isActive,
    save: () => saveDraft(deps),
    onCreated: () => showToast('borrador de proyecto creado'),
  });
}
