import { describe, expect, it } from 'vitest';
import type { TerrainChunk } from './map-version';
import { buildTerrainMeshData } from './terrain-mesh';

function chunk(overrides: Partial<TerrainChunk> = {}): TerrainChunk {
  return {
    x: 1,
    z: -2,
    heights: Array.from({ length: 289 }, (_, index) => index / 100),
    surfaces: Array.from({ length: 256 }, (_, index) => index % 3),
    ...overrides,
  };
}

describe('buildTerrainMeshData', () => {
  it('builds positions with chunk origin, indices and surfaces in stable order', () => {
    const data = buildTerrainMeshData(chunk(), 2, -10, 4);

    expect(data.positions).toHaveLength(289 * 3);
    expect(data.indices).toHaveLength(256 * 6);
    expect(data.surfaces).toHaveLength(256);
    expect(data.positions[0]).toBeCloseTo(22);
    expect(data.positions[1]).toBeCloseTo(0);
    expect(data.positions[2]).toBeCloseTo(-60);
    expect(data.positions[3]).toBeCloseTo(24);
    expect(data.positions[4]).toBeCloseTo(0.01);
    expect(data.positions[5]).toBeCloseTo(-60);
    expect(Array.from(data.indices.slice(0, 6))).toEqual([0, 17, 1, 1, 17, 18]);
    expect(Array.from(data.surfaces.slice(0, 4))).toEqual([0, 1, 2, 0]);
  });

  it('preserves shared-edge vertices and maps cell size consistently', () => {
    const data = buildTerrainMeshData(chunk({ x: 0, z: 0 }), 0.5, 3, -2);
    const lastVertex = (16 * 17 + 16) * 3;

    expect(data.positions[lastVertex]).toBeCloseTo(11);
    expect(data.positions[lastVertex + 1]).toBeCloseTo(2.88);
    expect(data.positions[lastVertex + 2]).toBeCloseTo(6);
    expect(data.indices[6]).toBe(1);
  });

  it('rejects invalid dimensions, origins, heights and surface values', () => {
    expect(() => buildTerrainMeshData(chunk(), 0)).toThrow('cellSize');
    expect(() => buildTerrainMeshData(chunk(), 1, Number.NaN, 0)).toThrow('origen');
    expect(() => buildTerrainMeshData(chunk({ heights: [] }), 1)).toThrow('incompletos');
    expect(() => buildTerrainMeshData(chunk({ heights: [65, ...Array(288).fill(0)] }), 1)).toThrow('altura');
    expect(() => buildTerrainMeshData(chunk({ surfaces: [16, ...Array(255).fill(0)] }), 1)).toThrow('superficie');
  });
});
