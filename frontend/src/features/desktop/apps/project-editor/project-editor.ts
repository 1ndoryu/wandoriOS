/* wandori.us — Project Editor App
 * Programa editorial de proyectos.
 * Solo devuelve contenido; el shell crea la ventana y el chrome.
 * [297A-14] Extraído del modal Admin con lifecycle propio. */

import { ProjectService } from '../../../../services';
import { createInput } from '../../../../components/ui/input';
import { createTextarea } from '../../../../components/ui/textarea';
import { createSelect } from '../../../../components/ui/select';
import { createCoverField } from '../../../../components/ui/cover-field';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';
import { safeClick, safeRun } from '../../../../utils/safe-async';
import { showToast } from '../../../../components/ui/toast';
import { tryCatch } from '../../../../utils/result';
import { publishProjectEditorSaved } from '../../../runtime/project-editor-events';
import { createProjectAutosave, type ProjectDraftPayload } from './project-editor-autosave';
import type { MountedView, RenderContext } from '../../../../core/lifecycle';
import type { Project } from '../../../../api/types';

function createLoadingView(): HTMLElement {
  return createEl('div', { className: 'project-editor flex-columna gap-lg' },
    createEl('p', { className: 'cargando', textContent: 'cargando editor...' }),
  );
}

async function loadProject(ctx: RenderContext): Promise<Project | undefined> {
  const projectId = ctx.params?.projectId;
  if (!projectId) return undefined;
  const result = await tryCatch(ProjectService.getById(projectId, { signal: ctx.signal }));
  if (!result.ok) throw new Error('No se pudo cargar el proyecto');
  return result.value;
}

/** Renderiza un editor de proyecto nuevo o existente como vista del OS. */
export function renderProjectEditor(ctx: RenderContext): MountedView {
  const container = createLoadingView();
  /* [018A-1 F2] Franja de acciones inferior (chrome): síncrona para que el
   * shell la coloque; hydrate la rellena (crear/guardar) y la oculta mientras
   * carga o si falla. El body absorbe su scroll y la franja queda fija. */
  const actionsBar = createEl('div', { className: 'desktop-window__actions' });
  actionsBar.hidden = true;
  let disposed = false;
  let currentProjectId: string | undefined;
  /* Cleanup del autosave (timer + I/O pendientes). Se invoca en destroy y en
   * el catch de hydrate; nunca como código muerto en hydrate. [297A-14 F5] */
  let autosaveCleanup: (() => void) | undefined;

  const isActive = (): boolean => !disposed && !ctx.signal.aborted;

  const hydrate = async (): Promise<void> => {
    try {
      const project = await loadProject(ctx);
      if (!isActive()) return;

      let title = project?.title || '';
      let description = project?.description || '';
      let url = project?.url || '';
      let sortOrder = project?.sort_order ?? 0;
      let isVisible = project?.is_visible ?? false;
      /* [018A-85] La portada se gestiona con el componente compartido
       * cover-field; su estado interno lo lee getValue() al guardar. */
      const coverField = createCoverField(project?.cover_image || '', isActive, () => scheduleAutosave());
      currentProjectId = project?.id;

      /* [297A-14 F5] Sincroniza la etiqueta del botón (crear/guardar) también
       * cuando el autosave crea el proyecto; los clicks ocurren tras hidratar. */
      let updateSaveLabel: () => void = () => {};

      /* El autosave se crea tras el saveButton; los closures de onInput solo
       * se ejecutan al escribir (después de que autosave ya existe). Mismo
       * patrón defensivo que article-editor (evita TDZ si un componente
       * disparara onInput síncronamente). */
      let autosave: ReturnType<typeof createProjectAutosave> | null = null;
      const scheduleAutosave = (): void => autosave?.schedule();

      const titleInput = createInput({
        label: 'titulo',
        placeholder: 'titulo del proyecto',
        value: title,
        onInput: value => { title = value; scheduleAutosave(); },
      });
      const descriptionInput = createTextarea({
        label: 'descripcion',
        placeholder: 'descripcion del proyecto',
        value: description,
        rows: 3,
        onInput: value => { description = value; scheduleAutosave(); },
      });
      const urlInput = createInput({
        label: 'url',
        placeholder: 'https://...',
        value: url,
        onInput: value => { url = value; scheduleAutosave(); },
      });
      const orderInput = createInput({
        label: 'orden',
        type: 'number',
        value: String(sortOrder),
        onInput: value => {
          const parsed = Number.parseInt(value, 10);
          sortOrder = Number.isFinite(parsed) ? parsed : 0;
          scheduleAutosave();
        },
      });
      const visibilitySelect = createSelect({
        label: 'visibilidad',
        options: [
          { value: 'visible', label: 'visible' },
          { value: 'hidden', label: 'oculto' },
        ],
        value: isVisible ? 'visible' : 'hidden',
        onChange: value => { isVisible = value === 'visible'; },
      });
      /* [018A-1 F2] En la franja el botón es compacto (receta .boton OS). */
      const saveButton = createEl('button', {
        type: 'button',
        className: 'boton',
        textContent: currentProjectId ? 'guardar' : 'crear',
      });
      updateSaveLabel = () => {
        saveButton.textContent = currentProjectId ? 'guardar' : 'crear';
      };

      /* Autosave: guarda el contenido (título/descripción/url/portada/orden); la
       * visibilidad editorial solo cambia con el guardado manual explícito. */
      autosave = createProjectAutosave({
        getProjectId: () => currentProjectId,
        setProjectId: (id) => {
          currentProjectId = id;
          updateSaveLabel();
        },
        getPayload: (): ProjectDraftPayload => ({
          title,
          description,
          url,
          coverImage: coverField.getValue() ?? '',
          sortOrder,
        }),
        isActive,
      });
      autosaveCleanup = () => { autosave.destroy(); };

      saveButton.addEventListener('click', safeClick(async () => {
        if (!isActive()) return;
        if (!title.trim()) {
          showToast('el titulo es obligatorio');
          return;
        }
        autosave.cancel();

        const projectData = {
          title: title.trim(),
          description,
          url: url.trim() || null,
          /* [018A-85] La portada vacía se manda como null para limpiarla en
           * actualizaciones; undefined en create se omite. */
          cover_image: coverField.getValue() ?? null,
          sort_order: sortOrder,
          is_visible: isVisible,
        };
        const request = currentProjectId
          ? ProjectService.update(currentProjectId, projectData)
          : ProjectService.create({
            title: projectData.title,
            description: projectData.description,
            url: projectData.url || undefined,
            cover_image: projectData.cover_image || undefined,
            sort_order: projectData.sort_order,
            is_visible: projectData.is_visible,
          });
        const result = await safeRun(request, 'error al guardar proyecto');
        if (!isActive() || !result.ok) return;

        const operation = currentProjectId ? 'updated' : 'created';
        currentProjectId = result.value.id;
        updateSaveLabel();
        publishProjectEditorSaved({ projectId: currentProjectId, operation });
        showToast(operation === 'updated' ? 'proyecto actualizado' : 'proyecto creado');
      }));

      container.textContent = '';
      container.append(
        titleInput,
        descriptionInput,
        urlInput,
        coverField.element,
        orderInput,
        visibilitySelect,
      );
      /* [018A-1 F2] La acción primaria vive en la franja inferior. */
      actionsBar.textContent = '';
      actionsBar.append(saveButton);
      actionsBar.hidden = false;
    } catch {
      if (!isActive()) return;
      /* Cerrar timers de autosave aunque la hidratación falle a medias. */
      autosaveCleanup?.();
      autosaveCleanup = undefined;
      container.textContent = '';
      container.appendChild(createVacio('error al cargar el editor de proyectos'));
      /* [018A-1 F2] Sin botones de acción si el editor no cargó. */
      actionsBar.hidden = true;
      actionsBar.textContent = '';
    }
  };

  void hydrate();

  const abortHandler = (): void => {
    disposed = true;
  };
  ctx.signal.addEventListener('abort', abortHandler, { once: true });

  return {
    element: container,
    actions: actionsBar,
    destroy: () => {
      disposed = true;
      ctx.signal.removeEventListener('abort', abortHandler);
      autosaveCleanup?.();
      autosaveCleanup = undefined;
    },
  };
}
