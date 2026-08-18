/* wandori.us — Icon Grid Geometry Tests
 * [297A-20] Lógica pura del snap-grid: celdas y ocupación.
 * Sin DOM: getGridMetrics se testea implícitamente vía métricas mock. */

import { describe, it, expect } from 'vitest';
import {
  cellKey,
  occupiedCells,
  findFreeCell,
  type GridMetrics,
} from './icon-grid';
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

describe('cellKey', () => {
  it('debe serializar col,row como clave estable', () => {
    expect(cellKey({ col: 0, row: 0 })).toBe('0,0');
    expect(cellKey({ col: 5, row: 9 })).toBe('5,9');
  });
});

describe('occupiedCells', () => {
  it('debe mapear celda → nodeId solo para nodos con posición', () => {
    const map = occupiedCells([
      node('a', { col: 0, row: 0 }),
      node('b', { col: 2, row: 1 }),
      node('c'),
    ]);
    expect(map.get('0,0')).toBe('a');
    expect(map.get('2,1')).toBe('b');
    expect(map.size).toBe(2);
  });
});

describe('findFreeCell', () => {
  it('debe devolver la celda pedida si está libre', () => {
    expect(findFreeCell([node('a', { col: 0, row: 0 })], { col: 1, row: 0 }, metrics))
      .toEqual({ col: 1, row: 0 });
  });

  it('debe buscar la primera celda libre desde la fila de partida', () => {
    const nodes = [0, 1, 2, 3].map((col) => node(String(col), { col, row: 1 }));
    expect(findFreeCell(nodes, { col: 0, row: 1 }, metrics)).toEqual({ col: 0, row: 2 });
  });

  it('debe autogrow si el grid está lleno', () => {
    const nodes = Array.from({ length: metrics.rows * metrics.columns }, (_, index) => (
      node(String(index), { col: index % metrics.columns, row: Math.floor(index / metrics.columns) })
    ));
    expect(findFreeCell(nodes, { col: 0, row: 0 }, metrics)).toEqual({ col: 0, row: metrics.rows });
  });
});
