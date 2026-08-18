import { describe, expect, it } from 'vitest';
import {
  getMobileCellAt,
  mobilePositionOf,
  planMobilePlacement,
  sortMobileNodes,
} from './mobile-grid';
import type { ResolvedNode } from './types';

function node(
  id: string,
  mobilePosition?: { col: number; row: number },
  mobileOrder?: number,
): ResolvedNode {
  return {
    id,
    parentId: 'desktop',
    type: 'folder',
    label: id,
    mobilePosition,
    mobileOrder,
    origin: 'release',
  };
}

describe('mobile-grid', () => {
  it('usa mobileOrder como fallback de datos legacy', () => {
    expect(mobilePositionOf({ mobileOrder: 4 }, 3)).toEqual({ col: 1, row: 1 });
    expect(mobilePositionOf({ mobileOrder: 4 }, 2)).toEqual({ col: 0, row: 2 });
    expect(mobilePositionOf({ mobilePosition: { col: 1, row: 2 }, mobileOrder: 4 }))
      .toEqual({ col: 1, row: 2 });
  });

  it('proyecta la geometría canónica de tres columnas a dos columnas sin cambiar el orden', () => {
    const item = node('third-column', { col: 2, row: 0 });
    expect(mobilePositionOf(item, 3)).toEqual({ col: 2, row: 0 });
    expect(mobilePositionOf(item, 2)).toEqual({ col: 0, row: 1 });
    expect(sortMobileNodes([
      node('third-column', { col: 2, row: 0 }),
      node('first', { col: 0, row: 0 }),
      node('second', { col: 1, row: 0 }),
    ], 2).map((item) => item.id)).toEqual(['first', 'second', 'third-column']);
  });

  it('ordena primero por mobilePosition y después por mobileOrder', () => {
    const result = sortMobileNodes([
      node('legacy-2', undefined, 2),
      node('positioned', { col: 0, row: 0 }, 9),
      node('legacy-1', undefined, 1),
    ]);
    expect(result.map((item) => item.id)).toEqual(['positioned', 'legacy-1', 'legacy-2']);
    expect(sortMobileNodes([
      node('legacy-4', undefined, 4),
      node('legacy-1', undefined, 1),
    ], 2).map((item) => item.id)).toEqual(['legacy-1', 'legacy-4']);
  });

  it('compacta el launcher al insertar el nodo en una celda', () => {
    const nodes = [
      node('a', { col: 0, row: 0 }),
      node('b', { col: 1, row: 0 }),
      node('c', { col: 2, row: 0 }),
      node('d', { col: 0, row: 1 }),
    ];
    const plan = planMobilePlacement(nodes, 'd', { col: 1, row: 0 }, 3);
    expect(plan.moves).toEqual([
      { nodeId: 'd', mobilePosition: { col: 1, row: 0 } },
      { nodeId: 'b', mobilePosition: { col: 2, row: 0 } },
      { nodeId: 'c', mobilePosition: { col: 0, row: 1 } },
    ]);
  });

  it('mantiene el layout compacto con dos columnas', () => {
    const nodes = [
      node('a', { col: 0, row: 0 }),
      node('b', { col: 1, row: 0 }),
      node('c', { col: 0, row: 1 }),
    ];
    const plan = planMobilePlacement(nodes, 'c', { col: 1, row: 0 }, 2);
    expect(plan.moves).toEqual([
      { nodeId: 'c', mobilePosition: { col: 1, row: 0 } },
      { nodeId: 'b', mobilePosition: { col: 2, row: 0 } },
    ]);
  });

  it('rechaza celdas fuera del alto calculado', () => {
    const metrics = {
      columns: 2, rows: 2, cellWidth: 100, cellHeight: 50,
      columnGap: 10, rowGap: 10, left: 20, right: 240, top: 30,
    };
    expect(getMobileCellAt(30, 200, metrics)).toBeNull();
    expect(getMobileCellAt(30, 40, metrics)).toEqual({ col: 0, row: 0 });
  });

  it('ignora nodos de otras carpetas', () => {
    const nodes = [
      node('desktop-item', { col: 0, row: 0 }),
      { ...node('nested', { col: 0, row: 0 }), parentId: 'folder-1' },
    ];
    expect(planMobilePlacement(nodes, 'nested', { col: 0, row: 0 }, 3).moves).toEqual([]);
  });
});
