import { describe, expect, it } from 'vitest';
import {
  generateIslandHeightfield,
  generateTerrainHeightfield,
} from './heightmap';
import { terrainOptionsPreset } from './terrain-options';

const WIDTH = 48;
const DEPTH = 32;

function landRatio(h: { readonly heights: Float32Array; readonly waterLevel: number }): number {
  let land = 0;
  for (const y of h.heights) if (y >= h.waterLevel) land += 1;
  return land / h.heights.length;
}

function cell(h: { readonly heights: Float32Array; readonly width: number }, i: number, j: number): number {
  return h.heights[j * h.width + i];
}

describe('generateTerrainHeightfield por forma (138A-4)', () => {
  it('isla reproduce exactamente el generador histórico', () => {
    const classic = generateIslandHeightfield({ seed: 1337, width: WIDTH, depth: DEPTH });
    const generic = generateTerrainHeightfield(terrainOptionsPreset('isla'));
    expect(Array.from(generic.heights)).toEqual(Array.from(classic.heights));
  });

  it('es determinista por seed en todas las formas', () => {
    for (const shape of ['isla', 'continente', 'archipielago', 'valle'] as const) {
      const a = generateTerrainHeightfield(terrainOptionsPreset(shape));
      const b = generateTerrainHeightfield(terrainOptionsPreset(shape));
      expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
      const c = generateTerrainHeightfield({ ...terrainOptionsPreset(shape), seed: 1 });
      expect(Array.from(a.heights)).not.toEqual(Array.from(c.heights));
    }
  });

  it('isla: esquinas océano y centro tierra', () => {
    const h = generateTerrainHeightfield(terrainOptionsPreset('isla'));
    for (const [i, j] of [[0, 0], [WIDTH - 1, 0], [0, DEPTH - 1], [WIDTH - 1, DEPTH - 1]] as const) {
      expect(cell(h, i, j)).toBeLessThan(h.waterLevel);
    }
    expect(cell(h, Math.floor(WIDTH / 2), Math.floor(DEPTH / 2))).toBeGreaterThanOrEqual(h.waterLevel + 1);
  });

  it('continente: masa grande con costa irregular', () => {
    const h = generateTerrainHeightfield(terrainOptionsPreset('continente'));
    expect(cell(h, Math.floor(WIDTH / 2), Math.floor(DEPTH / 2))).toBeGreaterThanOrEqual(h.waterLevel + 1);
    for (const [i, j] of [[0, 0], [WIDTH - 1, 0], [0, DEPTH - 1], [WIDTH - 1, DEPTH - 1]] as const) {
      expect(cell(h, i, j)).toBeLessThan(h.waterLevel);
    }
    const ratio = landRatio(h);
    expect(ratio).toBeGreaterThan(0.5);
  });

  it('archipiélago: varias masas separadas por canales', () => {
    const h = generateTerrainHeightfield(terrainOptionsPreset('archipielago'));
    for (const [i, j] of [[0, 0], [WIDTH - 1, 0], [0, DEPTH - 1], [WIDTH - 1, DEPTH - 1]] as const) {
      expect(cell(h, i, j)).toBeLessThan(h.waterLevel);
    }
    expect(cell(h, Math.floor(WIDTH / 2), Math.floor(DEPTH / 2))).toBeGreaterThanOrEqual(h.waterLevel);
    const ratio = landRatio(h);
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.75);
  });

  it('valle: lago central y anillo de tierra en los bordes', () => {
    const h = generateTerrainHeightfield(terrainOptionsPreset('valle'));
    expect(cell(h, Math.floor(WIDTH / 2), Math.floor(DEPTH / 2))).toBeLessThan(h.waterLevel);
    for (const [i, j] of [[0, 0], [WIDTH - 1, 0], [0, DEPTH - 1], [WIDTH - 1, DEPTH - 1]] as const) {
      expect(cell(h, i, j)).toBeGreaterThanOrEqual(h.waterLevel);
    }
    /* Borde izquierdo a media altura: anillo montañoso. */
    expect(cell(h, 2, Math.floor(DEPTH / 2))).toBeGreaterThanOrEqual(h.waterLevel);
    expect(landRatio(h)).toBeGreaterThan(0.45);
  });
});

