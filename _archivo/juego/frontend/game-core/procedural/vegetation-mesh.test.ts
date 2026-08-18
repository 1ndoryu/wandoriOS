import { describe, expect, it } from 'vitest';
import { buildVegetationMeshData } from './vegetation-mesh';
import type { VegetationPlacement } from './vegetation';

function placements(): VegetationPlacement[] {
  return [
    { kind: 'grass', x: -2, z: 1, y: 1.2, seed: 0.1, scale: 1 },
    { kind: 'tree', x: 4, z: -3, y: 1.5, seed: 0.4, scale: 1.1 },
    { kind: 'rock', x: 8, z: 5, y: 1.0, seed: 0.7, scale: 0.9 },
  ];
}

describe('buildVegetationMeshData (138A-1)', () => {
  it('emite malla indexada coherente por tipo', () => {
    const m = buildVegetationMeshData(placements());
    expect(m.vertexCount).toBe(m.positions.length / 3);
    expect(m.triangleCount).toBe(m.indices.length / 3);
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.colors.length).toBe(m.positions.length);
    for (const idx of m.indices) {
      expect(idx).toBeLessThan(m.vertexCount);
    }
    expect(m.triangleCount).toBeGreaterThan(0);
  });

  it('es determinista y escala el césped', () => {
    const a = buildVegetationMeshData(placements());
    const b = buildVegetationMeshData(placements());
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
    const taller = buildVegetationMeshData([
      { kind: 'grass', x: -2, z: 1, y: 1.2, seed: 0.1, scale: 1.5 },
    ]);
    const base = buildVegetationMeshData([
      { kind: 'grass', x: -2, z: 1, y: 1.2, seed: 0.1, scale: 1 },
    ]);
    expect(Math.max(...taller.positions.filter((_, i) => i % 3 === 1)))
      .toBeGreaterThan(Math.max(...base.positions.filter((_, i) => i % 3 === 1)));
  });
});
