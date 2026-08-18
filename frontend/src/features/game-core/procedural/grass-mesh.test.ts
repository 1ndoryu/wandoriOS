import { describe, expect, it } from 'vitest';
import { buildGrassClumpMeshData } from './grass-mesh';

describe('buildGrassClumpMeshData (138A-2)', () => {
  it('es determinista con el mismo seed', () => {
    const a = buildGrassClumpMeshData(0.1);
    const b = buildGrassClumpMeshData(0.1);
    expect(a.positions).toEqual(b.positions);
    expect(a.indices).toEqual(b.indices);
  });

  it('emite una malla indexada coherente', () => {
    const m = buildGrassClumpMeshData(0.1);
    expect(m.vertexCount).toBe(m.positions.length / 3);
    expect(m.triangleCount).toBe(m.indices.length / 3);
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.colors.length).toBe(m.positions.length);
    expect(m.triangleCount).toBeGreaterThan(0);
    for (const idx of m.indices) {
      expect(idx).toBeLessThan(m.vertexCount);
    }
    for (const v of m.positions) expect(Number.isFinite(v)).toBe(true);
  });

  it('emite 8 vértices por brizna', () => {
    const m = buildGrassClumpMeshData(0.1, { bladeCount: 4 });
    expect(m.vertexCount).toBe(4 * 8);
    expect(m.triangleCount).toBe(4 * 4);
  });

  it('la altura de brizna cambia la extensión vertical', () => {
    const baja = buildGrassClumpMeshData(0.1, { bladeHeight: 0.2 });
    const alta = buildGrassClumpMeshData(0.1, { bladeHeight: 0.8 });
    const maxY = (m: typeof baja): number =>
      Math.max(...m.positions.filter((_, i) => i % 3 === 1));
    expect(maxY(alta)).toBeGreaterThan(maxY(baja));
  });

  it('rechaza bladeCount inválido', () => {
    expect(() => buildGrassClumpMeshData(0.1, { bladeCount: 0 })).toThrow('briznas');
    expect(() => buildGrassClumpMeshData(0.1, { bladeCount: 25 })).toThrow('briznas');
    expect(() => buildGrassClumpMeshData(0.1, { bladeCount: 1.5 })).toThrow('briznas');
  });
});
