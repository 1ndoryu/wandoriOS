/* wandori.us — Icon Grid Placement Tests
 * [297A-20] Colocación, colisiones y reflow tras cambios de viewport.
 */

import { describe, it, expect } from 'vitest';
import { planPlacement, reflowPositions } from './icon-grid-placement';
import type { GridMetrics } from './icon-grid';
import type { WorkspaceNode } from '../../runtime/workspace/types';

const metrics: GridMetrics = {
  columns: 4,
  rows: 3,
  cellWidth: 88,
  cellHeight: 64,
  columnGap: 12,
  rowGap: 24,
  /* [058A-1] Sin distribución: rowGap efectivo = rowGap declarado. */
  rowGapEffective: 24,
  /* [018A-97] Sin distribución: columnGap efectivo = columnGap declarado. */
  columnGapEffective: 12,
  left: 100,
  right: 100 + 4 * (88 + 12),
  top: 50,
  rtl: false,
};

function node(id: string, position?: { col: number; row: number }): WorkspaceNode {
  return { id, parentId: 'desktop', type: 'folder', label: id, position, requires: 'public' };
}

describe('planPlacement', () => {
  it('debe mover solo al arrastrado si la celda está libre', () => {
    const plan = planPlacement([node('a', { col: 0, row: 0 })], 'b', { col: 1, row: 1 }, metrics);
    expect(plan.moves).toEqual([{ nodeId: 'b', position: { col: 1, row: 1 } }]);
  });

  it('debe desplazar al ocupante a una celda libre y luego posicionar al arrastrado', () => {
    const plan = planPlacement([node('a', { col: 1, row: 1 }), node('b')], 'b', { col: 1, row: 1 }, metrics);
    expect(plan.moves).toHaveLength(2);
    expect(plan.moves[0].nodeId).toBe('a');
    expect(plan.moves[0].position).toEqual({ col: 0, row: 1 });
    expect(plan.moves[1]).toEqual({ nodeId: 'b', position: { col: 1, row: 1 } });
  });

  it('no debe colisionar consigo mismo si ya está en la celda', () => {
    const plan = planPlacement([node('a', { col: 1, row: 1 })], 'a', { col: 1, row: 1 }, metrics);
    expect(plan.moves).toEqual([{ nodeId: 'a', position: { col: 1, row: 1 } }]);
  });

  it('debe desplazar al ocupante sin dejarlo en la celda del arrastrado', () => {
    const plan = planPlacement([node('a', { col: 0, row: 0 })], 'b', { col: 0, row: 0 }, metrics);
    expect(plan.moves).toEqual([
      { nodeId: 'a', position: { col: 1, row: 0 } },
      { nodeId: 'b', position: { col: 0, row: 0 } },
    ]);
  });
});

describe('reflowPositions', () => {
  it('debe clamar una columna fuera de rango tras estrechar', () => {
    const plan = reflowPositions([node('a', { col: 5, row: 1 })], metrics);
    expect(plan.moves).toEqual([{ nodeId: 'a', position: { col: 3, row: 1 } }]);
  });

  it('debe clamar una fila fuera de rango al reducir altura', () => {
    const plan = reflowPositions([node('a', { col: 2, row: 4 })], metrics);
    expect(plan.moves).toEqual([{ nodeId: 'a', position: { col: 2, row: 2 } }]);
  });

  it('debe resolver colisiones desplazando al segundo nodo', () => {
    const plan = reflowPositions([node('a', { col: 3, row: 1 }), node('b', { col: 5, row: 1 })], metrics);
    expect(plan.moves).toEqual([{ nodeId: 'b', position: { col: 2, row: 1 } }]);
  });

  it('no debe mover posiciones que ya caben', () => {
    const plan = reflowPositions([node('a', { col: 0, row: 0 }), node('b', { col: 3, row: 2 })], metrics);
    expect(plan.moves).toEqual([]);
  });

  it('debe ignorar nodos sin posición', () => {
    const plan = reflowPositions([node('a', { col: 5, row: 1 }), node('sin-pos')], metrics);
    expect(plan.moves).toEqual([{ nodeId: 'a', position: { col: 3, row: 1 } }]);
  });

  it('debe mantener orden estable por fila y columna', () => {
    const plan = reflowPositions([node('b', { col: 5, row: 1 }), node('a', { col: 3, row: 1 })], metrics);
    expect(plan.moves).toEqual([{ nodeId: 'b', position: { col: 2, row: 1 } }]);
  });
});
