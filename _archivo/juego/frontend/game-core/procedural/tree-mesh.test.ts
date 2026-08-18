import { describe, expect, it } from 'vitest';
import { buildTreeMeshData } from './tree-mesh';

describe('buildTreeMeshData (138A-2)', () => {
  it('es determinista con el mismo seed', () => {
    const a = buildTreeMeshData(0.4);
    const b = buildTreeMeshData(0.4);
    expect(a.positions).toEqual(b.positions);
    expect(a.normals).toEqual(b.normals);
    expect(a.colors).toEqual(b.colors);
    expect(a.indices).toEqual(b.indices);
  });

  it('cambia la malla con un seed distinto', () => {
    const a = buildTreeMeshData(0.4);
    const b = buildTreeMeshData(0.9);
    expect(a.positions).not.toEqual(b.positions);
  });

  it('emite una malla indexada coherente', () => {
    const m = buildTreeMeshData(0.4);
    expect(m.vertexCount).toBe(m.positions.length / 3);
    expect(m.triangleCount).toBe(m.indices.length / 3);
    expect(m.normals.length).toBe(m.positions.length);
    expect(m.colors.length).toBe(m.positions.length);
    expect(m.triangleCount).toBeGreaterThan(0);
    for (const idx of m.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(m.vertexCount);
    }
    for (const v of [...m.positions, ...m.normals, ...m.colors]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('la escala cambia las dimensiones manteniendo la base en y=0', () => {
    const base = buildTreeMeshData(0.4, { scale: 1 });
    const grande = buildTreeMeshData(0.4, { scale: 2 });
    const maxY = (m: typeof base): number =>
      Math.max(...m.positions.filter((_, i) => i % 3 === 1));
    expect(maxY(grande)).toBeGreaterThan(maxY(base));
    expect(Math.min(...base.positions.filter((_, i) => i % 3 === 1))).toBeCloseTo(0);
  });

  it('rechaza opciones inválidas', () => {
    expect(() => buildTreeMeshData(0.4, { scale: 0 })).toThrow('escala');
    expect(() => buildTreeMeshData(0.4, { scale: -1 })).toThrow('escala');
    expect(() => buildTreeMeshData(0.4, { trunkHeight: 0 })).toThrow('altura');
    expect(() => buildTreeMeshData(0.4, { foliageClusters: 0 })).toThrow('clusters');
    expect(() => buildTreeMeshData(0.4, { foliageClusters: 5 })).toThrow('clusters');
    expect(() => buildTreeMeshData(0.4, { foliageClusters: 1.5 })).toThrow('clusters');
  });
});
