import { describe, expect, it } from 'vitest';
import type { VegetationPlacement } from './vegetation';
import { buildVegetationMeshData } from './vegetation-mesh';
import { buildLowPolyVegetationMeshData } from './vegetation-lowpoly';

function placements(): VegetationPlacement[] {
  return [
    { kind: 'tree', x: -2, z: 1, y: 1.2, seed: 0.4, scale: 1 },
    { kind: 'grass', x: 4, z: -3, y: 1.5, seed: 0.1, scale: 1 },
    { kind: 'rock', x: 8, z: 5, y: 1.0, seed: 0.7, scale: 0.9 },
  ];
}

describe('buildLowPolyVegetationMeshData (138A-2)', () => {
  it('emite una malla indexada coherente y traduce a la posición', () => {
    const m = buildLowPolyVegetationMeshData(placements());
    expect(m.vertexCount).toBe(m.positions.length / 3);
    expect(m.triangleCount).toBe(m.indices.length / 3);
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.colors.length).toBe(m.positions.length);
    for (const idx of m.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(m.vertexCount);
    }
    for (const v of m.positions) expect(Number.isFinite(v)).toBe(true);
    const minY = Math.min(...m.positions.filter((_, i) => i % 3 === 1));
    expect(minY).toBeCloseTo(1.0);
  });

  it('es determinista con los mismos placements', () => {
    const a = buildLowPolyVegetationMeshData(placements());
    const b = buildLowPolyVegetationMeshData(placements());
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it('con placements vacíos devuelve una malla vacía', () => {
    const m = buildLowPolyVegetationMeshData([]);
    expect(m.vertexCount).toBe(0);
    expect(m.triangleCount).toBe(0);
    expect(m.positions).toHaveLength(0);
    expect(m.indices).toHaveLength(0);
  });

  it('supera en detalle a la malla boxy equivalente', () => {
    const tree: VegetationPlacement[] = [
      { kind: 'tree', x: 0, z: 0, y: 0, seed: 0.4, scale: 1 },
    ];
    const lowpoly = buildLowPolyVegetationMeshData(tree);
    const boxy = buildVegetationMeshData(tree);
    expect(lowpoly.triangleCount).toBeGreaterThan(boxy.triangleCount);
    expect(lowpoly.vertexCount).toBeGreaterThan(boxy.vertexCount);
  });
});
