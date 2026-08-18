/* [058A-4][018A-97] Lógica de colocación de un grupo de iconos en el snap-grid.
 * Extraída de workspace-icon-grid.ts (límite de líneas de componente, regla
 * de util máx 150). El grupo mantiene el offset relativo de cada seleccionado
 * respecto al icono arrastrado (delta del plan).
 * [018A-97] El grupo se decide por el GESTO (pointerdown), no por la selección
 * del drop: arrastrar un icono no seleccionado altera solo ese (Windows).
 * Los miembros se clampean a los límites del grid y los ocupantes de las
 * celdas destino se desplazan a la celda libre más cercana: nunca se
 * superponen ni crean tracks implícitos (salvo grid completamente lleno, con
 * autogrow igual que planPlacement). */

import { cellKey, type GridMetrics, type GridPosition } from './icon-grid';
import { planPlacement, type PlacementPlan } from './icon-grid-placement';
import type { NodeId } from '../../runtime/workspace/types';
import type { ResolvedNode } from '../../runtime/workspace/types';

export interface GroupMove {
  nodeId: NodeId;
  position: GridPosition;
}

/** [018A-97] ¿El arrastre debe mover el grupo completo? Regla Windows: solo si
 * el icono arrastrado formaba parte de la selección múltiple capturada al
 * iniciar el gesto. Con selección residual que NO incluye al arrastrado, se
 * altera solo ese icono. */
export function shouldGroupDrag(groupIds: readonly NodeId[], draggedId: NodeId): boolean {
  return groupIds.length > 1 && groupIds.includes(draggedId);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Primera celda libre evitando `taken`, buscando desde start hacia la
 * izquierda (RTL: col 0 a la derecha) y filas siguientes. Si el grid está
 * lleno devuelve autogrow (misma política que planPlacement/findFreeCell). */
function nearestFreeCell(taken: ReadonlySet<string>, start: GridPosition, metrics: GridMetrics): GridPosition {
  for (let row = start.row; row < metrics.rows; row++) {
    for (let col = start.col; col >= 0; col--) {
      const candidate = { col, row };
      if (!taken.has(cellKey(candidate))) return candidate;
    }
  }
  for (let row = start.row; row < metrics.rows; row++) {
    for (let col = start.col + 1; col < metrics.columns; col++) {
      const candidate = { col, row };
      if (!taken.has(cellKey(candidate))) return candidate;
    }
  }
  return { col: start.col, row: metrics.rows };
}

/** [018A-97] Calcula los moves de colocación del grupo arrastrado: el move del
 * icono arrastrado (tomado del plan) más el delta aplicado a cada seleccionado
 * con position. Clampa a los límites del grid (metrics) y desplaza a los
 * ocupantes de las celdas destino a la celda libre más cercana. Devuelve null
 * si el arrastrado no tiene move/position válidos (el caller cae al
 * comportamiento de icono único). */
export function buildGroupPlacementMoves(
  desktopNodes: readonly ResolvedNode[],
  draggedId: NodeId,
  plan: PlacementPlan,
  selectedIds: readonly NodeId[],
  metrics: GridMetrics,
): GroupMove[] | null {
  const draggedMove = plan.moves.find(m => m.nodeId === draggedId);
  const draggedNode = desktopNodes.find(n => n.id === draggedId);
  if (!draggedMove || !draggedNode?.position) return null;

  const dCol = draggedMove.position.col - draggedNode.position.col;
  const dRow = draggedMove.position.row - draggedNode.position.row;

  /* Miembros del grupo (el arrastrado primero, prioridad a su celda) con sus
   * celdas destino clampeadas al área visible del grid. */
  const members: GroupMove[] = [draggedMove];
  for (const id of selectedIds) {
    if (id === draggedId) continue;
    const n = desktopNodes.find(x => x.id === id);
    if (!n?.position) continue;
    members.push({
      nodeId: id,
      position: {
        col: clamp(n.position.col + dCol, 0, metrics.columns - 1),
        row: clamp(n.position.row + dRow, 0, metrics.rows - 1),
      },
    });
  }

  /* Ocupación inicial SOLO de los nodos no miembros (los miembros se
   * recolocan; su posición original se libera al moverse). */
  const memberIds = new Set(members.map(m => m.nodeId));
  const occupancy = new Map<string, NodeId>();
  for (const n of desktopNodes) {
    if (memberIds.has(n.id) || !n.position) continue;
    occupancy.set(cellKey(n.position), n.id);
  }

  const taken = new Set<string>(occupancy.keys());
  const moves: GroupMove[] = [];

  for (const member of members) {
    const key = cellKey(member.position);
    const occupant = occupancy.get(key);

    if (occupant) {
      /* La celda destino la ocupa un icono NO seleccionado: se desplaza a la
       * celda libre más cercana y el miembro ocupa su celda. */
      const free = nearestFreeCell(taken, member.position, metrics);
      taken.add(cellKey(free));
      occupancy.delete(key);
      moves.push({ nodeId: occupant, position: free });
    } else if (taken.has(key)) {
      /* Otro miembro ya reservó la celda (solo posible tras clamp): el último
       * en llegar busca la celda libre más cercana. */
      const free = nearestFreeCell(taken, member.position, metrics);
      taken.add(cellKey(free));
      moves.push({ nodeId: member.nodeId, position: free });
      continue;
    }
    taken.add(key);
    moves.push(member);
  }

  return moves;
}

/** [018A-97] Plan de colocación del escritorio: resuelve el drag de grupo por
 * el gesto (groupIds capturados en pointerdown) o el drag único. Fuente única
 * del onPlaceCell del grid, extraída para poder testear la selección residual
 * (arrastrar un icono no seleccionado altera solo ese). */
export function planDesktopPlacement(
  desktopNodes: readonly ResolvedNode[],
  draggedId: NodeId,
  target: GridPosition,
  groupIds: readonly NodeId[],
  metrics: GridMetrics,
): PlacementPlan {
  const single = planPlacement(desktopNodes, draggedId, target, metrics);
  if (!shouldGroupDrag(groupIds, draggedId)) return single;
  const group = buildGroupPlacementMoves(desktopNodes, draggedId, single, groupIds, metrics);
  return { moves: group ?? single.moves };
}
