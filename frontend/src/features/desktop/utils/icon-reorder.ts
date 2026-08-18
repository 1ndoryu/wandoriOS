/* wandori.us — Icon Reorder Logic
 * Lógica de reordering para drag & drop de iconos.
 * Maneja detección de posición, highlight visual y drop zones.
 * Extraído de icon-drag.ts para cumplir límite de 150 líneas.
 */

import { createEl } from '../../../utils/dom';
import { getGridMetrics, getCellAt, cellOriginAt, type GridPosition, type GridMetrics } from './icon-grid';

/** Subset de sesión necesaria para reorder/highlight. */
export interface HighlightSession {
  readonly gridEl: HTMLElement;
  readonly itemSelector: string;
  /** Modo snap-grid: el highlight muestra la celda destino en vez del índice. */
  readonly placement?: boolean;
  highlightEl: HTMLElement | null;
  currentTarget: HTMLElement | null;
}

/** Encontrar índice de reordering más cercano al cursor. */
export function findReorderIndex(
  x: number,
  y: number,
  gridEl: HTMLElement,
  itemSelector: string,
): number {
  const icons = gridEl.querySelectorAll<HTMLElement>(itemSelector);
  let closestIndex = -1;
  let closestDist = Infinity;

  icons.forEach((icon, i) => {
    const rect = icon.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dist = Math.hypot(x - cx, y - cy);
    if (dist < closestDist) {
      closestDist = dist;
      closestIndex = i;
    }
  });

  return closestIndex;
}

/** Posicionar el highlight visual en la posición de reordering. */
export function positionHighlight(
  targetIndex: number,
  session: HighlightSession,
): void {
  const icons = session.gridEl.querySelectorAll<HTMLElement>(session.itemSelector);
  const target = icons[targetIndex];
  if (!target) return;

  if (!session.highlightEl) {
    const hl = createEl('div', { className: 'desktop-icon-drop-target' });
    session.gridEl.appendChild(hl);
    session.highlightEl = hl;
  }

  const rect = target.getBoundingClientRect();
  const gridRect = session.gridEl.getBoundingClientRect();
  const hl = session.highlightEl;
  hl.style.left = `${rect.left - gridRect.left}px`;
  hl.style.top = `${rect.top - gridRect.top}px`;
  hl.style.width = `${rect.width}px`;
  hl.style.height = `${rect.height}px`;
}

/** [297A-20] Posicionar el highlight en una celda snap del grid. */
export function positionCellHighlight(
  cell: GridPosition,
  metrics: GridMetrics,
  session: HighlightSession,
): void {
  if (!session.highlightEl) {
    const hl = createEl('div', { className: 'desktop-icon-drop-target' });
    session.gridEl.appendChild(hl);
    session.highlightEl = hl;
  }
  const hl = session.highlightEl;
  /* [018A-97] Geometría unificada: cellOriginAt es la fuente única (RTL +
   * gaps efectivos distribuidos con space-between). Antes este cálculo era
   * una fórmula paralela que divergía del track real cuando sobraba espacio. */
  const origin = cellOriginAt(cell.col, cell.row, metrics);
  hl.style.left = `${origin.left}px`;
  hl.style.top = `${origin.top}px`;
  hl.style.width = `${metrics.cellWidth}px`;
  hl.style.height = `${metrics.cellHeight}px`;
}

/** Registrar un elemento como drop target. */
export function makeDropTarget(options: {
  el: HTMLElement;
  dropId: string;
  context: string;
}): void {
  options.el.setAttribute('data-drop-target', 'true');
  options.el.setAttribute('data-drop-id', options.dropId);
  options.el.setAttribute('data-drop-context', options.context);
}

/** Buscar drop target bajo el cursor, ocultando el ghost temporalmente. */
export function findDropTarget(
  x: number,
  y: number,
  ghost: HTMLElement | null,
  exclude: HTMLElement | null,
): HTMLElement | null {
  if (ghost) ghost.style.display = 'none';
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  if (ghost) ghost.style.display = '';
  if (!el) return null;
  const target = el.closest<HTMLElement>('[data-drop-target="true"]');
  if (!target || target === exclude) return null;
  return target;
}

/** [297A-20] ¿El target cae dentro del grid o es el grid mismo?
 * El drop target real del escritorio es el workspace (padre del grid),
 * así que se acepta también que el grid esté contenido en el target. */
export function isGridTarget(target: HTMLElement | null, gridEl: HTMLElement): boolean {
  return Boolean(target && (target === gridEl || gridEl.contains(target) || target.contains(gridEl)));
}

/** Actualizar highlight visual al mover el cursor durante drag. */
export function updateHighlight(
  target: HTMLElement | null,
  x: number,
  y: number,
  session: HighlightSession,
): void {
  if (session.currentTarget && session.currentTarget !== target) {
    session.currentTarget.classList.remove('desktop-icon--drop-hover');
  }

  session.currentTarget = target;

  /* [297A-20] Modo snap: highlight por geometría (la celda bajo el cursor).
   * No depende del elemento bajo el puntero para ser consistente con el drop:
   * si hay una ventana encima, el highlight queda oculto bajo ella pero el
   * drop seguirá aterrizando en la misma celda. */
  if (session.placement) {
    const metrics = getGridMetrics(session.gridEl, session.itemSelector);
    const cell = getCellAt(x, y, metrics);
    if (cell) {
      positionCellHighlight(cell, metrics, session);
      return;
    }
    session.highlightEl?.remove();
    session.highlightEl = null;
    return;
  }

  if (target) {
    target.classList.add('desktop-icon--drop-hover');

    const isSameGrid = isGridTarget(target, session.gridEl);
    if (isSameGrid) {
      const targetIndex = findReorderIndex(x, y, session.gridEl, session.itemSelector);
      if (targetIndex >= 0) {
        positionHighlight(targetIndex, session);
        return;
      }
    }
  }

  session.highlightEl?.remove();
  session.highlightEl = null;
}
