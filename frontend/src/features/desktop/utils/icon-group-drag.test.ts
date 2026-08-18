/* wandori.us — Icon Group Drag Tests
 * [018A-97] El drag de grupo se decide por el GESTO (groupIds capturados en
 * pointerdown), no por la selección en el drop: con selección residual que no
 * incluye al arrastrado se altera solo ese icono. Los miembros del grupo se
 * clampean a los límites del grid y los ocupantes de las celdas destino se
 * desplazan a la celda libre más cercana (nunca se superponen ni salen de
 * bounds, salvo autogrow con grid lleno). */

import { describe, it, expect } from 'vitest';
import {
  buildGroupPlacementMoves,
  planDesktopPlacement,
  shouldGroupDrag,
} from './icon-group-drag';
import type { GridMetrics } from './icon-grid';
import type { PlacementPlan } from './icon-grid-placement';
import type { ResolvedNode } from '../../runtime/workspace/types';

const metrics: GridMetrics = {
  columns: 4,
  rows: 3,
  cellWidth: 88,
  cellHeight: 64,
  columnGap: 12,
  columnGapEffective: 12,
  rowGap: 24,
  rowGapEffective: 24,
  left: 100,
  right: 100 + 4 * (88 + 12),
  top: 50,
  rtl: false,
};

function node(id: string, position?: { col: number; row: number }): ResolvedNode {
  return { id, parentId: 'desktop', type: 'folder', label: id, position, origin: 'release' };
}

describe('shouldGroupDrag — regla Windows por gesto', () => {
  it('grupo capturado que incluye al arrastrado → true', () => {
    expect(shouldGroupDrag(['a', 'b', 'c'], 'a')).toBe(true);
  });

  it('selección residual que NO incluye al arrastrado → false (se altera solo ese)', () => {
    expect(shouldGroupDrag(['b', 'c'], 'a')).toBe(false);
  });

  it('selección simple → false', () => {
    expect(shouldGroupDrag(['a'], 'a')).toBe(false);
  });
});

describe('buildGroupPlacementMoves — delta + clamp + colisiones', () => {
  it('aplica el mismo delta a todos los seleccionados con position', () => {
    const nodes = [node('a', { col: 0, row: 0 }), node('b', { col: 1, row: 0 }), node('c', { col: 0, row: 1 })];
    const plan: PlacementPlan = { moves: [{ nodeId: 'a', position: { col: 1, row: 0 } }] };
    const moves = buildGroupPlacementMoves(nodes, 'a', plan, ['a', 'b', 'c'], metrics)!;
    expect(moves).toEqual([
      { nodeId: 'a', position: { col: 1, row: 0 } },
      { nodeId: 'b', position: { col: 2, row: 0 } },
      { nodeId: 'c', position: { col: 1, row: 1 } },
    ]);
  });

  it('clampa los miembros que saldrían de bounds (nunca crea tracks implícitos)', () => {
    /* Delta (+3,+0): a (0,0) → (3,0); b (2,2) → (5,2) → clamp col 3. */
    const nodes = [node('a', { col: 0, row: 0 }), node('b', { col: 2, row: 2 })];
    const plan: PlacementPlan = { moves: [{ nodeId: 'a', position: { col: 3, row: 0 } }] };
    const moves = buildGroupPlacementMoves(nodes, 'a', plan, ['a', 'b'], metrics)!;
    expect(moves).toEqual([
      { nodeId: 'a', position: { col: 3, row: 0 } },
      { nodeId: 'b', position: { col: 3, row: 2 } },
    ]);
  });

  it('desplaza al ocupante NO seleccionado de la celda destino', () => {
    /* x (no seleccionado) ocupa (1,1), el target del arrastrado; se desplaza a
     * la celda libre más cercana (0,1) sin pisar a c (miembro). */
    const nodes = [node('a', { col: 0, row: 0 }), node('x', { col: 1, row: 1 }), node('c', { col: 0, row: 1 })];
    const plan: PlacementPlan = { moves: [{ nodeId: 'a', position: { col: 1, row: 1 } }] };
    const moves = buildGroupPlacementMoves(nodes, 'a', plan, ['a', 'c'], metrics)!;
    expect(moves).toEqual([
      { nodeId: 'x', position: { col: 0, row: 1 } },
      { nodeId: 'a', position: { col: 1, row: 1 } },
      { nodeId: 'c', position: { col: 1, row: 2 } },
    ]);
  });

  it('devuelve null si el arrastrado no tiene position (caller cae al plan único)', () => {
    const nodes = [node('a'), node('b', { col: 1, row: 0 })];
    const plan: PlacementPlan = { moves: [{ nodeId: 'a', position: { col: 0, row: 0 } }] };
    expect(buildGroupPlacementMoves(nodes, 'a', plan, ['a', 'b'], metrics)).toBeNull();
  });
});

describe('planDesktopPlacement — decisión por gesto en onPlaceCell', () => {
  it('con selección residual que NO incluye al arrastrado, mueve solo ese icono', () => {
    const nodes = [node('a', { col: 0, row: 0 }), node('b', { col: 1, row: 1 }), node('c', { col: 2, row: 2 })];
    const plan = planDesktopPlacement(nodes, 'a', { col: 2, row: 0 }, ['b', 'c'], metrics);
    expect(plan.moves).toEqual([{ nodeId: 'a', position: { col: 2, row: 0 } }]);
  });

  it('con el arrastrado seleccionado, mueve todo el grupo sin superposiciones', () => {
    const nodes = [node('a', { col: 0, row: 0 }), node('b', { col: 1, row: 0 }), node('c', { col: 0, row: 1 })];
    const plan = planDesktopPlacement(nodes, 'a', { col: 1, row: 1 }, ['a', 'b', 'c'], metrics);
    expect(plan.moves).toEqual([
      { nodeId: 'a', position: { col: 1, row: 1 } },
      { nodeId: 'b', position: { col: 2, row: 1 } },
      { nodeId: 'c', position: { col: 1, row: 2 } },
    ]);
  });

  it('grupo sobre celda ocupada: desplaza al ocupante y conserva los miembros', () => {
    const nodes = [node('a', { col: 0, row: 0 }), node('b', { col: 0, row: 1 }), node('x', { col: 1, row: 1 })];
    const plan = planDesktopPlacement(nodes, 'a', { col: 1, row: 1 }, ['a', 'b'], metrics);
    expect(plan.moves).toEqual([
      { nodeId: 'x', position: { col: 0, row: 1 } },
      { nodeId: 'a', position: { col: 1, row: 1 } },
      { nodeId: 'b', position: { col: 1, row: 2 } },
    ]);
  });

  it('no produce celdas duplicadas ni fuera de bounds en el conjunto final', () => {
    const nodes = [
      node('a', { col: 3, row: 2 }),
      node('b', { col: 2, row: 2 }),
      node('c', { col: 3, row: 1 }),
      node('x', { col: 1, row: 1 }),
    ];
    const plan = planDesktopPlacement(nodes, 'a', { col: 0, row: 2 }, ['a', 'b', 'c'], metrics);
    const cells = plan.moves.map(m => `${m.position.col},${m.position.row}`);
    expect(new Set(cells).size).toBe(cells.length);
    for (const m of plan.moves) {
      expect(m.position.col).toBeGreaterThanOrEqual(0);
      expect(m.position.col).toBeLessThan(metrics.columns);
      expect(m.position.row).toBeGreaterThanOrEqual(0);
      expect(m.position.row).toBeLessThan(metrics.rows);
    }
  });
});
