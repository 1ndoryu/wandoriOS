/* wandori.us — Admin Projects
 * Listado/orquestador de proyectos; el editor vive en la app lazy `project-editor`.
 * [297A-14] No crea modales ni contiene el formulario editorial. */

import { safeRun, safeClick } from '../utils/safe-async';
import { tryCatch } from '../utils/result';
import { createEl } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { ProjectService } from '../services';
import { showToast } from '../components/ui/toast';
import { showConfirm } from '../components/ui/confirm';
import { subscribeProjectEditorSaved } from '../features/runtime/project-editor-events';
import type { Project } from '../api/types';

const projectListCleanups = new WeakMap<HTMLElement, () => void>();
const projectListGenerations = new WeakMap<HTMLElement, number>();

export function disposeProjectList(container: HTMLElement): void {
  projectListCleanups.get(container)?.();
  projectListCleanups.delete(container);
  projectListGenerations.delete(container);
}

export function disposeAdminProjectLists(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('.admin-proyectos-lista').forEach(disposeProjectList);
}

function ensureProjectListSubscription(container: HTMLElement): void {
  if (projectListCleanups.has(container)) return;
  const cleanup = subscribeProjectEditorSaved(() => {
    if (!container.isConnected) {
      disposeProjectList(container);
      return;
    }
    void renderProjectList(container);
  });
  projectListCleanups.set(container, cleanup);
}

export function openProjectEditor(project?: Project): void {
  void import('../features/runtime/route-app-adapter')
    .then(({ openAppWindow }) => {
      const params = project ? { projectId: project.id } : undefined;
      return openAppWindow('project-editor', params);
    })
    .catch(() => {
      showToast('no se pudo abrir el editor de proyectos');
    });
}

export async function renderProjectList(container: HTMLElement): Promise<void> {
  ensureProjectListSubscription(container);
  const generation = (projectListGenerations.get(container) ?? 0) + 1;
  projectListGenerations.set(container, generation);
  container.className = 'admin-lista admin-proyectos-lista';
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const listResult = await tryCatch(ProjectService.listAll());
  if (projectListGenerations.get(container) !== generation) return;
  if (!listResult.ok) {
    container.textContent = '';
    container.appendChild(createVacio('error al cargar proyectos'));
    return;
  }

  container.textContent = '';
  for (const project of listResult.value) {
    const editButton = createEl('button', {
      type: 'button',
      className: 'boton boton-pequeno',
      textContent: 'editar',
    });
    editButton.addEventListener('click', () => openProjectEditor(project));

    const deleteButton = createEl('button', {
      type: 'button',
      className: 'boton boton-pequeno',
      textContent: 'eliminar',
    });
    deleteButton.addEventListener('click', safeClick(async () => {
      const confirmed = await showConfirm(`eliminar "${project.title}"?`);
      if (!confirmed) return;
      const result = await safeRun(ProjectService.delete(project.id), 'error al eliminar');
      if (!result.ok) return;
      showToast('proyecto eliminado');
      await renderProjectList(container);
    }));

    const visibility = project.is_visible ? '' : ' (oculto)';
    const info = createEl('span', { textContent: `${project.title}${visibility}` });
    const actions = createEl('div', { className: 'admin-acciones' }, editButton, deleteButton);
    container.appendChild(createEl('div', { className: 'admin-item' }, info, actions));
  }

  /* [018A-1] El botón "+ nuevo proyecto" vive en la barra de acciones
   * inferior que orquesta admin.ts; la lista ya no lo crea. */
  if (listResult.value.length === 0) {
    container.appendChild(createVacio('no hay proyectos'));
  }
}
