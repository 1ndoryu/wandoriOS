import { describe, expect, it } from 'vitest';
import { buildWaterMeshData, WATER_MESH_MAX_SEGMENTS } from './water-mesh';

describe('buildWaterMeshData (138A-3)', () => {
  it('es determinista con el mismo seed', () => {
    const opts = { width: 48, depth: 32, segmentsX: 8, segmentsZ: 6, seed: 42 };
    const a = buildWaterMeshData(opts);
    const b = buildWaterMeshData(opts);
    expect(a.positions).toEqual(b.positions);
    expect(a.uvs).toEqual(b.uvs);
    expect(a.indices).toEqual(b.indices);
    expect(a.wavePhase).toEqual(b.wavePhase);
  });

  it('cambia el phase de onda con un seed distinto pero no la geometría', () => {
    const base = { width: 48, depth: 32, segmentsX: 8, segmentsZ: 6 };
    const a = buildWaterMeshData({ ...base, seed: 1 });
    const b = buildWaterMeshData({ ...base, seed: 2 });
    expect(a.positions).toEqual(b.positions);
    expect(a.wavePhase).not.toEqual(b.wavePhase);
  });

  it('emite un grid indexado coherente en el plano XZ con y=0', () => {
    const m = buildWaterMeshData({ width: 48, depth: 32, segmentsX: 8, segmentsZ: 6 });
    expect(m.vertexCount).toBe((8 + 1) * (6 + 1));
    expect(m.triangleCount).toBe(8 * 6 * 2);
    expect(m.positions.length).toBe(m.vertexCount * 3);
    expect(m.uvs.length).toBe(m.vertexCount * 2);
    expect(m.wavePhase.length).toBe(m.vertexCount);
    expect(m.indices.length).toBe(m.triangleCount * 3);
    for (let v = 0; v < m.vertexCount; v += 1) {
      expect(m.positions[v * 3 + 1]).toBe(0);
      expect(m.wavePhase[v]).toBeGreaterThanOrEqual(0);
      expect(m.wavePhase[v]).toBeLessThan(1);
    }
    for (const idx of m.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(m.vertexCount);
    }
  });

  it('cubre exactamente el ancho y la profundidad pedidos', () => {
    const m = buildWaterMeshData({ width: 48, depth: 32, segmentsX: 8, segmentsZ: 6 });
    const xs = m.positions.filter((_, i) => i % 3 === 0);
    const zs = m.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...xs)).toBeCloseTo(-24);
    expect(Math.max(...xs)).toBeCloseTo(24);
    expect(Math.min(...zs)).toBeCloseTo(-16);
    expect(Math.max(...zs)).toBeCloseTo(16);
  });

  it('la primera fila de UVs queda en v=0 y la última en v=1', () => {
    const m = buildWaterMeshData({ width: 48, depth: 32, segmentsX: 8, segmentsZ: 6 });
    const rows = 6 + 1;
    const cols = 8 + 1;
    expect(m.uvs[1]).toBe(0);
    expect(m.uvs[(rows - 1) * cols * 2 + 1]).toBe(1);
    expect(m.uvs[0]).toBe(0);
    expect(m.uvs[(cols - 1) * 2]).toBe(1);
  });

  it('rechaza opciones inválidas', () => {
    expect(() => buildWaterMeshData({ width: 0, depth: 32 })).toThrow('dimensiones');
    expect(() => buildWaterMeshData({ width: 48, depth: -1 })).toThrow('dimensiones');
    expect(() => buildWaterMeshData({ width: Number.NaN, depth: 32 })).toThrow('dimensiones');
    expect(() => buildWaterMeshData({ width: 48, depth: 32, segmentsX: 0 })).toThrow('segmentos');
    expect(() => buildWaterMeshData({ width: 48, depth: 32, segmentsZ: -2 })).toThrow('segmentos');
    expect(() => buildWaterMeshData({ width: 48, depth: 32, segmentsX: 1.5 })).toThrow('segmentos');
    expect(() => buildWaterMeshData({
      width: 48, depth: 32, segmentsX: WATER_MESH_MAX_SEGMENTS + 1,
    })).toThrow('segmentos');
  });
});
