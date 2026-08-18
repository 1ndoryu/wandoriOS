/* wandori.us — Admin Workspace (Escritorio)
 * Panel de gobernanza del workspace: estado actual de la release activa,
 * historial de versiones, validación dry-run y activación.
 * [028A-14] El caso de la Papelera desaparecida se evita desde aquí:
 * si la version activa no es la ultima publicada, el panel avisa. */

import { safeClick } from '../utils/safe-async';
import { tryCatch } from '../utils/result';
import { createEl } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { showToast } from '../components/ui/toast';
import { showConfirm } from '../components/ui/confirm';
import { WorkspaceService } from '../services';
import { publishWorkspace, fetchWorkspaceRelease } from '../features/runtime/workspace/workspace-store';
import type { ReleaseValidation } from '../services/workspace.service';

const escritorioCleanups = new WeakMap<HTMLElement, () => void>();
const escritorioGenerations = new WeakMap<HTMLElement, number>();

export function disposeEscritorio(container: HTMLElement): void {
  escritorioCleanups.get(container)?.();
  escritorioCleanups.delete(container);
  escritorioGenerations.delete(container);
}

export function disposeAdminWorkspaceLists(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('.admin-escritorio').forEach(disposeEscritorio);
}

function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/** [028A-14] Accion primaria de la franja de la ventana: publica el estado
 * actual del workspace (incluye el overlay) como nueva release. */
export function createPublicarAccion(): HTMLElement {
  const boton = createEl('button', { className: 'boton', textContent: '+ publicar release' });
  boton.addEventListener('click', safeClick(async () => {
    const resultado = await tryCatch(publishWorkspace());
    if (!resultado.ok) {
      showToast(`error al publicar: ${resultado.error}`);
      return;
    }
    if (resultado.value) showToast(`release v${resultado.value.version} publicada`);
    else showToast('no se publico ninguna release');
  }));
  return boton;
}

/** Renderiza la tarjeta de detalle de validacion debajo del historial. */
function renderDetalleValidacion(container: HTMLElement, generacion: number, validacion: ReleaseValidation): void {
  if (escritorioGenerations.get(container) !== generacion) return;
  const detalle = container.querySelector<HTMLElement>('.admin-escritorio-detalle');
  if (!detalle) return;
  detalle.textContent = '';
  detalle.appendChild(createEl('h4', { className: 'admin-escritorio-detalle-titulo', textContent: `validacion v${validacion.version}` }));
  if (validacion.valid) {
    detalle.appendChild(createEl('p', { className: 'admin-escritorio-detalle-ok', textContent: 'estructura validada: sin issues ni referencias rotas. lista para activar.' }));
    return;
  }
  if (validacion.issues.length > 0) {
    detalle.appendChild(createEl('p', { textContent: `issues estructurales (${validacion.issues.length}):` }));
    for (const issue of validacion.issues) {
      detalle.appendChild(createEl('div', { className: 'admin-escritorio-detalle-item', textContent: `${issue.node_id}: ${issue.message}` }));
    }
  }
  if (validacion.broken_refs.length > 0) {
    detalle.appendChild(createEl('p', { textContent: `referencias rotas (${validacion.broken_refs.length}):` }));
    for (const ref of validacion.broken_refs) {
      detalle.appendChild(createEl('div', { className: 'admin-escritorio-detalle-item', textContent: `${ref.label}: recurso ${ref.ref_id} no publicable` }));
    }
  }
}

/** Renderiza el estado actual (control) + historial de releases. */
export async function renderWorkspaceAdmin(container: HTMLElement): Promise<void> {
  const generacion = (escritorioGenerations.get(container) ?? 0) + 1;
  escritorioGenerations.set(container, generacion);
  container.className = 'admin-lista admin-escritorio';
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const controlResult = await tryCatch(WorkspaceService.getControl());
  if (escritorioGenerations.get(container) !== generacion) return;
  if (!controlResult.ok) {
    container.textContent = '';
    container.appendChild(createVacio('error al acceder a la gobernanza del workspace'));
    return;
  }

  const historialResult = await tryCatch(WorkspaceService.listReleases());
  if (escritorioGenerations.get(container) !== generacion) return;

  container.textContent = '';
  const control = controlResult.value;

  /* === ESTADO ACTUAL === */
  container.appendChild(createEl('h3', { textContent: 'estado actual' }));
  const grid = createEl('div', { className: 'admin-workspace-grid' });
  const card = (etiqueta: string, valor: string): HTMLElement => (
    createEl('div', { className: 'admin-workspace-card' },
      createEl('span', { className: 'admin-workspace-card-etiqueta', textContent: etiqueta }),
      createEl('span', { className: 'admin-workspace-card-valor', textContent: valor }),
    )
  );
  grid.appendChild(card('version activa', control.active_version !== null ? `v${control.active_version}` : '—'));
  grid.appendChild(card('nodos activos', control.active_node_count !== null ? String(control.active_node_count) : '—'));
  grid.appendChild(card('publicada', control.active_published_at ? formatFecha(control.active_published_at) : '—'));
  grid.appendChild(card('ultima publicada', control.latest_version !== null ? `v${control.latest_version}` : '—'));
  grid.appendChild(card('releases', String(control.total_releases)));
  container.appendChild(grid);

  /* Aviso cuando la activa no es la ultima publicada (caso Papelera: v4
   * incompleta enmascaro v3 canónica). */
  const activa = control.active_version;
  const ultima = control.latest_version;
  if (activa !== null && ultima !== null && activa !== ultima) {
    container.appendChild(createEl('div', { className: 'admin-escritorio-aviso', textContent: `la version activa (v${activa}) no es la ultima publicada (v${ultima}). revisa el historial: puede que falte contenido que si existia en otra version.` }));
  }

  /* —— HISTORIAL === */
  container.appendChild(createEl('h3', { className: 'mt-lg', textContent: 'historial de versiones' }));
  if (!historialResult.ok) {
    container.appendChild(createVacio('no se pudo cargar el historial'));
    return;
  }
  const releases = historialResult.value;
  if (releases.length === 0) {
    container.appendChild(createVacio('aun no hay releases publicadas'));
    return;
  }

  for (const release of releases) {
    const info = createEl('span', { textContent: `v${release.version} · ${release.node_count} nodos · ${formatFecha(release.published_at)}` });
    const acciones = createEl('div', { className: 'admin-acciones' });

    if (release.is_active) {
      info.textContent += ' · activa';
    } else {
      const btValidar = createEl('button', { type: 'button', className: 'boton boton-pequeno', textContent: 'validar' });
      btValidar.addEventListener('click', safeClick(async () => {
        const resultado = await tryCatch(WorkspaceService.validateVersion(release.version));
        if (!resultado.ok) {
          showToast(`error al validar: ${resultado.error}`);
          return;
        }
        renderDetalleValidacion(container, generacion, resultado.value);
      }));
      acciones.appendChild(btValidar);

      const btActivar = createEl('button', { type: 'button', className: 'boton boton-pequeno', textContent: 'activar' });
      btActivar.addEventListener('click', safeClick(async () => {
        const confirmado = await showConfirm(`activar la version v${release.version}?`);
        if (!confirmado) return;
        const resultado = await tryCatch((async () => {
          const validacion = await WorkspaceService.validateVersion(release.version);
          if (!validacion.valid) {
            throw new Error('la version no es valida (usa "validar" para ver los issues)');
          }
          return WorkspaceService.activateVersion(release.version);
        })());
        if (!resultado.ok) {
          showToast(resultado.error);
          return;
        }
        showToast(`v${release.version} activada`);
        /* [038A-2] Refresca el escritorio real: el contenido publicado debe
         * seguir visible tras activar otra versión (la materialización del
         * servidor lo garantiza, pero el store local debe re-fetch para que
         * el shell lo pinte sin depender del overlay del admin anterior). */
        await fetchWorkspaceRelease();
        await renderWorkspaceAdmin(container);
      }));
      acciones.appendChild(btActivar);
    }

    const tag = createEl('span', {
      className: release.is_active ? 'tag-estado tag-estado--published' : 'tag-estado tag-estado--borrador',
      textContent: release.is_active ? 'activa' : 'inactiva',
    });
    const cabecera = createEl('div', { className: 'admin-workspace-item-cabecera' }, tag, info);
    container.appendChild(createEl('div', { className: 'admin-item admin-workspace-item' }, cabecera, acciones));
  }

  /* Detalle de validacion (se rellena al pulsar "validar"). */
  container.appendChild(createEl('div', { className: 'admin-escritorio-detalle' }));
}