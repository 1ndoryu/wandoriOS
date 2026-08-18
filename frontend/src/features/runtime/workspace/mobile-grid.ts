/* wandori.us — Mobile Workspace Grid
 * Geometría pura del launcher móvil. No depende del DOM ni de la presentación.
 * mobileOrder permanece como fallback de datos anteriores; las nuevas mutaciones
 * escriben mobilePosition para mantener paridad con el snap-grid desktop. */

import type { GridPosition, NodeId, ResolvedNode, WorkspaceNode } from './types';

export interface MobileGridMetrics {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface MobilePlacementPlan {
  readonly moves: ReadonlyArray<{ nodeId: NodeId; mobilePosition: GridPosition }>;
}

/** El release persiste el launcher en una geometría canónica de 3 columnas.
 * La presentación de 2 columnas solo proyecta ese orden; nunca reescribe el
 * overlay al cambiar de viewport. */
export const MOBILE_CANONICAL_COLUMNS = 3;

function mobileOrderIndex(node: Pick<WorkspaceNode, 'mobilePosition' | 'mobileOrder'>): number {
  if (node.mobilePosition) {
    return Math.max(0, node.mobilePosition.row) * MOBILE_CANONICAL_COLUMNS
      + Math.max(0, node.mobilePosition.col);
  }
  return Math.max(0, node.mobileOrder ?? 0);
}

/** Posición visual para la cantidad de columnas actual. */
export function mobilePositionOf(
  node: Pick<WorkspaceNode, 'mobilePosition' | 'mobileOrder'>,
  columns = MOBILE_CANONICAL_COLUMNS,
): GridPosition {
  const index = mobileOrderIndex(node);
  const safeColumns = Math.max(1, columns);
  return { col: index % safeColumns, row: Math.floor(index / safeColumns) };
}

/** Orden estable canónico; el breakpoint no puede cambiar el orden del launcher. */
export function sortMobileNodes<T extends Pick<WorkspaceNode, 'mobilePosition' | 'mobileOrder'>>(
  nodes: readonly T[],
  _columns = MOBILE_CANONICAL_COLUMNS,
): T[] {
  return [...nodes].sort((a, b) => {
    return (mobileOrderIndex(a) - mobileOrderIndex(b))
      || ((a.mobileOrder ?? 0) - (b.mobileOrder ?? 0));
  });
}

/** Mide el grid compacto móvil a partir de una celda real y columnas fijas. */
export function getMobileGridMetrics(grid: HTMLElement, columns: number): MobileGridMetrics {
  const rect = grid.getBoundingClientRect();
  const styles = getComputedStyle(grid);
  const columnGap = parseFloat(styles.columnGap) || 0;
  const rowGap = parseFloat(styles.rowGap) || 0;
  const first = grid.querySelector<HTMLElement>('.movilLauncher__app');
  const cell = first?.getBoundingClientRect();
  const cellWidth = cell?.width ?? 0;
  const cellHeight = cell?.height ?? 0;
  const firstTop = cell?.top ?? rect.top;
  const firstLeft = cell?.left ?? rect.left;
  /* Las filas pertenecen a celdas reales, no al padding inferior del grid.
   * Medir hasta rect.bottom creaba una celda virtual al soltar cerca del borde. */
  const itemCount = grid.querySelectorAll<HTMLElement>('.movilLauncher__app').length;
  const rows = Math.max(1, Math.ceil(itemCount / Math.max(1, columns)));
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    columnGap,
    rowGap,
    left: firstLeft,
    right: rect.right,
    top: firstTop,
  };
}

/** Traduce coordenadas de viewport a una celda móvil. */
export function getMobileCellAt(x: number, y: number, metrics: MobileGridMetrics): GridPosition | null {
  if (metrics.cellWidth <= 0 || metrics.cellHeight <= 0) return null;
  const col = Math.floor((x - metrics.left + metrics.columnGap) / (metrics.cellWidth + metrics.columnGap));
  const row = Math.floor((y - metrics.top + metrics.rowGap) / (metrics.cellHeight + metrics.rowGap));
  if (col < 0 || row < 0 || col >= metrics.columns || row >= metrics.rows) return null;
  return { col, row };
}

/**
 * Mueve un nodo a una celda lógica y compacta todos los hermanos.
 * No deja huecos y produce un único batch de mutaciones.
 */
export function planMobilePlacement(
  nodes: readonly ResolvedNode[],
  draggedId: NodeId,
  target: GridPosition,
  columns: number,
): MobilePlacementPlan {
  if (columns < 1) return { moves: [] };
  const ordered = sortMobileNodes(nodes.filter((node) => node.parentId === 'desktop'), columns);
  const draggedIndex = ordered.findIndex((node) => node.id === draggedId);
  if (draggedIndex < 0) return { moves: [] };

  const withoutDragged = ordered.filter((node) => node.id !== draggedId);
  const targetIndex = Math.min(
    withoutDragged.length,
    Math.max(0, target.row * columns + target.col),
  );
  const reordered = [...withoutDragged];
  reordered.splice(targetIndex, 0, ordered[draggedIndex]);

  const moves: MobilePlacementPlan['moves'][number][] = [];
  reordered.forEach((node, index) => {
    const next = {
      col: index % MOBILE_CANONICAL_COLUMNS,
      row: Math.floor(index / MOBILE_CANONICAL_COLUMNS),
    };
    const current = node.mobilePosition;
    if (!current || current.col !== next.col || current.row !== next.row) {
      moves.push({ nodeId: node.id, mobilePosition: next });
    }
  });
  return { moves };
}
