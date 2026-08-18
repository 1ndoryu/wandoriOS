/* wandori.us — Pointer Drag Manager
 * Sistema de drag unificado basado en Pointer Events.
 * Reemplaza HTML5 DnD (Finder) y el reordering por separado (desktop).
 * Usa data-drop-target + data-drop-id como registry de drop zones.
 * Usa document.elementFromPoint para encontrar targets bajo el cursor.
 * [Auditoría v2] Unificación Finder ↔ desktop.
 */

import type { NodeId } from '../../runtime/workspace/types';
import { findReorderIndex, findDropTarget, makeDropTarget, updateHighlight, isGridTarget, type HighlightSession } from './icon-reorder';
import { getGridMetrics, getCellAt, DESKTOP_MIN_WIDTH } from './icon-grid';

/* Re-export para compatibilidad — otros módulos importan desde icon-drag */
export { makeDropTarget };

/** Resultado de un drop. */
export interface DragDropResult {
  readonly sourceId: string;
  readonly targetId: string;
  readonly sourceContext: string;
  readonly targetContext: string;
  readonly reorderIndex?: number;
}

export type DragDropHandler = (result: DragDropResult) => void;

interface DragSession extends HighlightSession {
  readonly sourceId: string;
  readonly sourceContext: string;
  readonly ghost: HTMLElement;
  readonly onReorder?: (draggedId: NodeId, targetIndex: number) => void;
  /** [297A-20] Soltar en celda snap del grid del escritorio.
   * [018A-97] groupIds = grupo capturado al INICIO del gesto (pointerdown),
   * no la selección en el momento del drop: arrastrar un icono no
   * seleccionado altera solo ese aunque quede una selección residual. */
  readonly onPlaceCell?: (draggedId: NodeId, col: number, row: number, groupIds: readonly string[]) => void;
}

let activeSession: DragSession | null = null;
let globalDropHandler: DragDropHandler | null = null;

export function onGlobalDrop(handler: DragDropHandler): () => void {
  globalDropHandler = handler;
  return () => {
    if (globalDropHandler === handler) globalDropHandler = null;
  };
}


export function enableDrag(options: {
  el: HTMLElement;
  nodeId: string;
  context: string;
  gridEl: HTMLElement;
  itemSelector?: string;
  onReorder?: (draggedId: NodeId, targetIndex: number) => void;
  onPlaceCell?: (draggedId: NodeId, col: number, row: number, groupIds: readonly string[]) => void;
  /* [058A-4][018A-97] Drag de grupo: getGroupIds se consulta en pointerdown
   * (selección en ese instante) y el grupo capturado NO cambia durante el
   * drag aunque la selección del store sí lo haga. El escritorio lo entrega
   * a onPlaceCell para decidir el grupo por el gesto; onGroupDrop lo usa el
   * Finder (reorder por índice). */
  getGroupIds?: () => readonly string[];
  onGroupDrop?: (draggedId: NodeId, targetId: string, groupIds: readonly string[]) => void;
}): () => void {
  const { el, nodeId, context, gridEl, itemSelector = '.desktop-icon--interactive', onReorder, onPlaceCell, getGroupIds, onGroupDrop } = options;
  const DRAG_THRESHOLD = 6;

  let startX = 0;
  let startY = 0;
  /* [058A-4] Grupo capturado al iniciar el gesto; no cambia durante el drag
   * aunque la selección del store sí lo haga. */
  let groupIds: readonly string[] = [];

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    groupIds = getGroupIds?.() ?? [];
    el.style.touchAction = 'none';

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }

  function onPointerMove(e: PointerEvent): void {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!activeSession && Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
      el.classList.add('desktop-icon--dragging');

      const ghost = el.cloneNode(true) as HTMLElement;
      ghost.className = 'desktop-icon desktop-icon--ghost';
      ghost.style.position = 'fixed';
      ghost.style.pointerEvents = 'none';
      ghost.style.zIndex = '10000';
      ghost.style.opacity = '0.7';
      document.body.appendChild(ghost);

      const placement = Boolean(onPlaceCell) && window.innerWidth >= DESKTOP_MIN_WIDTH;

      activeSession = {
        sourceId: nodeId,
        sourceContext: context,
        ghost,
        gridEl,
        itemSelector,
        onReorder,
        onPlaceCell,
        placement,
        highlightEl: null,
        currentTarget: null,
      } satisfies DragSession;
    }

    if (activeSession) {
      const rect = el.getBoundingClientRect();
      activeSession.ghost.style.left = `${e.clientX - rect.width / 2}px`;
      activeSession.ghost.style.top = `${e.clientY - rect.height / 2}px`;

      const target = findDropTarget(e.clientX, e.clientY, activeSession.ghost, gridEl);
      updateHighlight(target, e.clientX, e.clientY, activeSession);
    }
  }

  function onPointerUp(e: PointerEvent): void {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    el.style.touchAction = '';

    if (!activeSession) return;

    const target = findDropTarget(e.clientX, e.clientY, activeSession.ghost, null);

    /* [297A-20] Modo snap: el drop se decide por geometría, no por el elemento
     * bajo el cursor. Si el puntero cae en una celda del grid se coloca aunque
     * haya una ventana encima (las ventanas ya no bloquean el escritorio). */
    if (activeSession.placement && onPlaceCell) {
      const metrics = getGridMetrics(gridEl, itemSelector);
      const cell = getCellAt(e.clientX, e.clientY, metrics);
      /* [018A-97] Entregar el grupo capturado en pointerdown para que el
       * escritorio decida el drag de grupo por el gesto, no por la selección
       * del drop. */
      if (cell) onPlaceCell(nodeId, cell.col, cell.row, groupIds);
    } else if (target) {
      const targetId = target.dataset.dropId ?? '';
      const targetContext = target.dataset.dropContext ?? '';
      const isSameGrid = isGridTarget(target, gridEl);

      /* Reorder por índice (móvil o sin onPlaceCell). */
      if (isSameGrid && onReorder) {
        const targetIndex = findReorderIndex(e.clientX, e.clientY, gridEl, itemSelector);
        if (targetIndex >= 0) {
          onReorder(nodeId as NodeId, targetIndex);
        }
      } else if ((globalDropHandler || onGroupDrop) && targetId) {
        if (groupIds.length > 1 && onGroupDrop) {
          /* [058A-4] Drag de grupo: el caller mueve todos los ids capturados. */
          onGroupDrop(nodeId as NodeId, targetId, groupIds);
        } else if (globalDropHandler) {
          globalDropHandler({
            sourceId: nodeId,
            targetId,
            sourceContext: context,
            targetContext,
          });
        }
      }
    }

    el.classList.remove('desktop-icon--dragging');
    activeSession.ghost.remove();
    activeSession.highlightEl?.remove();
    activeSession.currentTarget?.classList.remove('desktop-icon--drop-hover');
    activeSession = null;
  }

  el.addEventListener('pointerdown', onPointerDown);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    el.style.touchAction = '';
  };
}

