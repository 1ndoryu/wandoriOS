/* [297A-20] Colocación, colisiones y reflow del snap-grid del escritorio.
 * Extraído de icon-grid.ts para cumplir el límite de 150 líneas por util.
 * La geometría (GridMetrics/cellOriginAt/getCellAt) vive en icon-grid.ts. */

import { cellKey, findFreeCell, occupiedCells, type GridMetrics, type GridPosition } from './icon-grid';
import type { NodeId, WorkspaceNode } from '../../runtime/workspace/types';

/** Movimientos a aplicar al soltar un icono en una celda (resuelve colisiones). */
export interface PlacementPlan {
  readonly moves: ReadonlyArray<{ nodeId: NodeId; position: GridPosition }>;
}

export function planPlacement(
  nodes: readonly WorkspaceNode[],
  draggedId: NodeId,
  target: GridPosition,
  metrics: GridMetrics,
): PlacementPlan {
  const occupied = occupiedCells(nodes);
  const targetKey = cellKey(target);
  const occupant = occupied.get(targetKey);

  if (!occupant || occupant === draggedId) {
    return { moves: [{ nodeId: draggedId, position: target }] };
  }

  /* [297A-20] Evitar target: el arrastrado ocupará esa celda; sin esto el
   * ocupante y el arrastrado podrían terminar en la misma celda. */
  const free = findFreeCell(nodes.filter((n) => n.id !== occupant), target, metrics, target);
  return {
    moves: [
      { nodeId: occupant, position: free },
      { nodeId: draggedId, position: target },
    ],
  };
}

/** [297A-20] Reflow al cambiar el tamaño del grid (columns/rows).
 * Clampa posiciones fuera de rango y resuelve colisiones tras una reducción.
 * Devuelve SOLO los movimientos que cambian; sin re-render si no hace falta.
 * Eficiencia: se invoca únicamente cuando las métricas del grid cambian. */
export function reflowPositions(
  nodes: readonly WorkspaceNode[],
  metrics: GridMetrics,
): PlacementPlan {
  const positioned = nodes
    .filter((n) => n.position)
    .sort((a, b) => (a.position!.row - b.position!.row) || (a.position!.col - b.position!.col));

  const taken = new Set<string>();
  const moves: Array<{ nodeId: NodeId; position: GridPosition }> = [];

  for (const node of positioned) {
    const orig = node.position!;
    const col = Math.min(orig.col, metrics.columns - 1);
    const row = Math.min(orig.row, metrics.rows - 1);

    /* Primera celda libre: misma fila, empezando en la col clampada y yendo
     * hacia la derecha (c decreciente). Así el icono se mantiene lo más cerca
     * de su posición; si la fila está llena, baja a la siguiente fila. */
    let placed = false;
    for (let r = row; r < metrics.rows && !placed; r++) {
      for (let c = col; c >= 0; c--) {
        const key = cellKey({ col: c, row: r });
        if (taken.has(key)) continue;
        taken.add(key);
        if (c !== orig.col || r !== orig.row) {
          moves.push({ nodeId: node.id, position: { col: c, row: r } });
        }
        placed = true;
        break;
      }
    }
  }

  return { moves: [...moves] };
}
