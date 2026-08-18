/* 138A-15 — Estadísticas del constructor: formato compacto de una línea. */

import { describe, expect, it } from 'vitest';
import { formatConstructorStats } from './game-constructor-stats';

describe('formatConstructorStats (138A-15)', () => {
  it('formatea chunks, instancias, árboles, rocas y geometría en una línea', () => {
    expect(formatConstructorStats({
      chunks: 12,
      instances: 340,
      assets: 24,
      trees: 80,
      rocks: 21,
      triangles: 12_500,
      vertices: 6_000,
    })).toBe('mundo · chunks 12 · instancias 340 · árboles 80 · rocas 21 · tris 12500 · vértices 6000');
  });
});
