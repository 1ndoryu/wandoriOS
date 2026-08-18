/* wandori.us — Workspace Icon Grid
 * Grid reactivo de iconos del escritorio suscrito a workspaceStore.
 * [Plan 297A-11 §9.4] Extraído de desktop-shell.ts para reducir acoplamiento. */

import {
  FileUser,
  Folder,
  ShieldUser,
  type IconNode,
} from 'lucide';
import { createEl } from '../../utils/dom';
import { createDesktopIcon } from './components/desktop-icon';
import { openAppWindow } from '../runtime/route-app-adapter';
import { authStore } from '../../store';
import { openContextMenu } from './components/desktop-context-menu';
import type { CommandTarget } from '../runtime/command-registry';
import { selectionStore, selectSingle, selectMany, clearSelection, isSelected, toggleSelect, extendSelect, getSelectedIds } from '../runtime/selection-store';
import { workspaceStore, reorderDesktopNodes } from '../runtime/workspace/workspace-store';
import type { ResolvedNode } from '../runtime/workspace/types';
import { AppRegistry } from '../runtime/app-registry';
import { resolveResourceIcon, resolveResourceIconType } from '../runtime/resource-type-registry';
import { enableDrag } from './utils/icon-drag';
import { enableSelectionBand } from './utils/selection-band';
import { planDesktopPlacement } from './utils/icon-group-drag';
import { DESKTOP_MIN_WIDTH, getGridMetrics } from './utils/icon-grid';
import { reflowPositions } from './utils/icon-grid-placement';
import { moveNodesPosition } from '../runtime/workspace/overlay-mutations';
import { reconcileChildren } from '../../utils/reconcile';
import { resolvePublicResourceTarget } from '../runtime/workspace/public-resource-locator';

const SHELL_ICON_MAP: Record<string, IconNode> = {
  'profile': FileUser,
  'admin': ShieldUser,
};

export function resolveNodeIcon(node: ResolvedNode): IconNode {
  if (node.type === 'app' && node.refId) {
    const app = AppRegistry.get(node.refId);
    if (app) return app.icon;
  }
  /* [018A-79] Los recursos resuelven su icono en ResourceTypeRegistry (fuente
   * única con Finder y móvil); antes el fallback genérico devolvía carpeta. */
  if (node.type === 'resource' && node.resourceKind) {
    return resolveResourceIcon(node.resourceKind);
  }
  return SHELL_ICON_MAP[node.id] ?? Folder;
}

export function resolveNodeIconType(node: ResolvedNode): 'folder' | 'document' | 'application' {
  if (node.type === 'app' && node.refId) {
    const app = AppRegistry.get(node.refId);
    if (app?.iconType) return app.iconType;
  }
  if (node.type === 'folder') return 'folder';
  /* [018A-79] El tipo semántico también sale del registro (iconType por kind). */
  if (node.type === 'resource' && node.resourceKind) {
    return resolveResourceIconType(node.resourceKind);
  }
  if (node.type === 'shortcut') return 'document';
  return 'application';
}

function resolveActivate(
  node: ResolvedNode,
  extraActions?: Record<string, () => void>,
): (() => void) | undefined {
  if (extraActions?.[node.id]) return extraActions[node.id];
  if (node.type === 'folder') return () => { void openAppWindow('finder', { folderId: node.id }); };
  if (node.type === 'resource' && node.resourceKind) {
    const entry = resolvePublicResourceTarget(node);
    if (entry) return () => { void openAppWindow(entry.appId, entry.params); };
    /* [058A-3] Sin URL pública el recurso no se muestra en el escritorio:
     * devolver undefined excluye el nodo del grid (activableNodes). */
    return undefined;
  }
  if (node.refId) return () => { void openAppWindow(node.refId!); };
  return undefined;
}

export interface WorkspaceIconGrid {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

/* [018A-88] Reflejo visual de la selección en el escritorio: clase
 * .desktop-icon--selected + aria-selected. La clase ya existía en
 * createDesktopIcon y su CSS, pero nadie la cableaba al selectionStore
 * (la selección solo vivía en el store, sin estado visible). */
function applyIconSelection(el: HTMLElement, nodeId: string): void {
  const selected = isSelected(nodeId, 'desktop');
  el.classList.toggle('desktop-icon--selected', selected);
  el.setAttribute('aria-selected', String(selected));
}

/** [297A-20] Aplica la posición snap del nodo al elemento (o lo devuelve a auto-flow).
 * Usa custom properties para que el CSS decida la colocación y el media query
 * móvil pueda ignorarla sin JS. */
function applyIconPosition(el: HTMLElement, node: ResolvedNode): void {
  if (node.position) {
    el.classList.add('desktop-icon--posicionado');
    el.style.setProperty('--icono-col', String(node.position.col + 1));
    el.style.setProperty('--icono-row', String(node.position.row + 1));
  } else {
    el.classList.remove('desktop-icon--posicionado');
    el.style.removeProperty('--icono-col');
    el.style.removeProperty('--icono-row');
  }
}

export function createWorkspaceIconGrid(extraActions?: Record<string, () => void>): WorkspaceIconGrid {
  const grid = createEl('div', { className: 'desktop-icon-grid', ariaLabel: 'Objetos del escritorio' });

  const dragCleanups = new Map<string, () => void>();

  /* [058A-4] Nodos visibles actuales en orden de grid: idsInOrder para el rango
   * con Shift y fuente de ítems de la banda de selección. Se actualiza en cada
   * render del workspace. */
  let activableNodes: ResolvedNode[] = [];

  const stopWorkspace = workspaceStore.subscribe((ws) => {
    const desktopNodes = Object.values(ws.nodes)
      .filter((n) => n.parentId === 'desktop')
      .sort((a, b) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0));

    activableNodes = desktopNodes.filter(n => resolveActivate(n, extraActions));

    const activeIds = new Set(activableNodes.map(n => n.id));
    for (const [id, cleanup] of dragCleanups) {
      if (!activeIds.has(id)) {
        cleanup();
        dragCleanups.delete(id);
      }
    }

    reconcileChildren(
      grid,
      activableNodes,
      (node) => node.id,
      (node) => {
        const onActivate = resolveActivate(node, extraActions);
        if (!onActivate) return createEl('span'); /* placeholder */

        const iconEl = createDesktopIcon({
          label: node.label,
          type: resolveNodeIconType(node),
          selected: isSelected(node.id, 'desktop'),
          lucideIcon: resolveNodeIcon(node),
          onActivate,
        });

        iconEl.setAttribute('data-node-id', node.id);
        applyIconSelection(iconEl, node.id);

        iconEl.addEventListener('mousedown', (e) => {
          if (e.button === 0 && e.detail === 1) {
            const nid = iconEl.getAttribute('data-node-id');
            if (!nid) return;
            /* [058A-4] Selección múltiple estilo Windows: Ctrl/Cmd alterna,
             * Shift extiende rango (orden visible del grid) y el clic simple
             * reemplaza. Un clic sobre un ítem YA seleccionado conserva la
             * selección (permite arrastrar el grupo, igual que Windows). */
            if (e.ctrlKey || e.metaKey) {
              toggleSelect(nid, 'desktop');
            } else if (e.shiftKey) {
              extendSelect(nid, activableNodes.map(n => n.id), 'desktop');
            } else if (!isSelected(nid, 'desktop')) {
              selectSingle(nid, 'desktop');
            }
          }
        });

        iconEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const nid = iconEl.getAttribute('data-node-id');
          if (!nid) return;
          const ws = workspaceStore.get();
          const currentNode = ws.nodes[nid];
          if (!currentNode) return;
          /* [058A-4] Clic derecho sobre un ítem de la multi-selección: el menú
           * actúa sobre TODOS los seleccionados. Sobre un ítem no seleccionado,
           * se selecciona solo ese (comportamiento Windows). */
          const alreadySelected = isSelected(nid, 'desktop');
          const ids = alreadySelected ? getSelectedIds() : [nid];
          if (!alreadySelected) selectSingle(nid, 'desktop');
          const targets = ids
            .map(id => ws.nodes[id])
            .filter((n): n is ResolvedNode => Boolean(n))
            .map((n): CommandTarget => ({ id: n.refId ?? n.id, kind: n.type === 'app' ? 'app' : 'shortcut' }));
          openContextMenu({
            context: 'icon',
            targets,
            capability: authStore.get().capability,
            x: e.clientX,
            y: e.clientY,
          });
        });

        const cleanup = enableDrag({
          el: iconEl,
          nodeId: node.id,
          context: 'desktop',
          gridEl: grid,
          itemSelector: '.desktop-icon--interactive',
          /* [018A-97] El grupo se captura en pointerdown (inicio del gesto) y
           * enableDrag lo entrega a onPlaceCell; así la decisión no depende de
           * la selección en el momento del drop. Solo los ids de la superficie
           * escritorio participan (018A-95: el Finder no contamina el grupo). */
          getGroupIds: () => getSelectedIds().filter((id) => isSelected(id, 'desktop')),
          onReorder: (draggedId, targetIndex) => {
            /* Reorder por índice (mobileOrder) — usado solo como fallback móvil.
             * En desktop/tablet el drag usa onPlaceCell (297A-20). */
            const ws = workspaceStore.get();
            const currentIds = Object.values(ws.nodes)
              .filter((n) => n.parentId === 'desktop')
              .sort((a, b) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0))
              .map((n) => n.id);
            const fromIndex = currentIds.indexOf(draggedId);
            if (fromIndex < 0 || fromIndex === targetIndex) return;
            const reordered = [...currentIds];
            reordered.splice(fromIndex, 1);
            reordered.splice(targetIndex, 0, draggedId);
            reorderDesktopNodes(reordered);
          },
          onPlaceCell: (draggedId, col, row, groupIds) => {
            /* [297A-20][018A-97] Snap-grid: resuelve el drag por el gesto y
             * persiste en el overlay con un solo update (moves en batch).
             * El grupo se decide con los ids capturados en pointerdown: con
             * selección residual que no incluye al arrastrado, planDesktopPlacement
             * cae al plan único (se altera solo ese icono); con el arrastrado
             * seleccionado, clampa los miembros a los límites del grid y
             * desplaza a los ocupantes de las celdas destino. */
            const ws = workspaceStore.get();
            const desktopNodes = Object.values(ws.nodes).filter((n) => n.parentId === 'desktop');
            const metrics = getGridMetrics(grid);
            const plan = planDesktopPlacement(desktopNodes, draggedId, { col, row }, groupIds, metrics);
            moveNodesPosition(plan.moves);
          },
        });
        dragCleanups.set(node.id, cleanup);

        applyIconPosition(iconEl, node);

        return iconEl;
      },
      (el, node) => {
        const label = el.querySelector('.desktop-icon__label');
        if (label && label.textContent !== node.label) {
          label.textContent = node.label;
        }
        const newType = resolveNodeIconType(node);
        el.classList.remove('desktop-icon--folder', 'desktop-icon--document', 'desktop-icon--application');
        el.classList.add(`desktop-icon--${newType}`);
        applyIconSelection(el, node.id);
        applyIconPosition(el, node);
      },
    );
  });

  /* [018A-88] Reflejo en vivo de la selección: al cambiar selectionStore
   * (clic en un icono, Ctrl+clic, clic en fondo) se re-aplica el estado
   * visual sin reconstruir el grid. */
  const stopSelection = selectionStore.subscribe(() => {
    for (const el of grid.children) {
      const id = el.getAttribute('data-node-id');
      if (id) applyIconSelection(el as HTMLElement, id);
    }
  });

  /* [058A-4] Banda de selección (rubber band) desde el fondo del escritorio.
   * El clic simple en el fondo sin arrastre termina en onApply([], false) →
   * clearSelection (comportamiento anterior). El feedback provisional usa
   * .desktop-icon--banded (mismo patrón visual que --selected) sin tocar el
   * store hasta soltar. Con Ctrl/Cmd la banda es aditiva. */
  const stopSelectionBand = enableSelectionBand({
    container: grid,
    getItems: () => Array.from(grid.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('desktop-icon--interactive') && Boolean(el.getAttribute('data-node-id')))
      .map(el => ({ id: el.getAttribute('data-node-id')!, el })),
    itemFeedbackClass: 'desktop-icon--banded',
    onApply: (ids, additive) => {
      if (ids.length === 0 && !additive) {
        clearSelection();
        return;
      }
      selectMany(ids, 'desktop', { additive });
    },
  });

  /* [297A-20] Reflow eficiente al cambiar el tamaño del grid.
   * Debounce 150ms; solo recalcula si cambiaron columns/rows (layout real).
   * El reflow se aplica en un único update batch del overlay, y no toca el
   * store si no hay movimientos (métricas iguales ⇒ return O(1)). */
  let lastColumns = 0;
  let lastRows = 0;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  let frameHandle: number | undefined;

  /* [018A-97] La rejilla roja de debug (Ctrl+Shift+G) se retiró: tras unificar
   * la geometría en cellOriginAt y cerrar el drag de grupo, ya no es necesaria
   * y el DoD del plan exige sin código de depuración en producción. */
  const doReflow = (): void => {
    /* En móvil (<769) las posiciones se ignoran; no reencuadrar. */
    if (window.innerWidth < DESKTOP_MIN_WIDTH) {
      const metrics = getGridMetrics(grid);
      lastColumns = metrics.columns;
      lastRows = metrics.rows;
      return;
    }
    const metrics = getGridMetrics(grid);
    if (metrics.columns === lastColumns && metrics.rows === lastRows) return;
    lastColumns = metrics.columns;
    lastRows = metrics.rows;
    const ws = workspaceStore.get();
    const desktopNodes = Object.values(ws.nodes).filter((n) => n.parentId === 'desktop');
    /* [297A-20] El reflow solo devuelve movimientos que cambian: con la
     * geometría unificada y el grupo resuelto no reempaqueta todo el grid
     * salvo overlap/fuera-de-bounds reales tras un cambio de columnas/filas. */
    const plan = reflowPositions(desktopNodes, metrics);
    if (plan.moves.length > 0) moveNodesPosition(plan.moves);
  };

  const onWindowResize = (): void => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(doReflow, 150);
  };

  window.addEventListener('resize', onWindowResize);
  /* Inicializar métricas tras el primer paint (el grid ya está en el DOM). */
  frameHandle = requestAnimationFrame(() => {
    doReflow();
    frameHandle = undefined;
  });

  const destroy = (): void => {
    stopWorkspace();
    stopSelection();
    stopSelectionBand();
    window.removeEventListener('resize', onWindowResize);
    window.clearTimeout(resizeTimer);
    if (frameHandle !== undefined) cancelAnimationFrame(frameHandle);
    for (const cleanup of dragCleanups.values()) cleanup();
    dragCleanups.clear();
    grid.replaceChildren();
  };

  return { element: grid, destroy };
}
