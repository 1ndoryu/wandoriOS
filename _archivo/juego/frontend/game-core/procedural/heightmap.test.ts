import { describe, expect, it } from 'vitest';
import {
  generateIslandHeightfield,
  quantizeBlockLevels,
  relaxBlockWalkability,
  trimLonelyIslands,
} from './heightmap';

const WIDTH = 48;
const DEPTH = 32;
const SEED = 1337;
const MAX_LEVEL = 4;

describe('generateIslandHeightfield (138A-1)', () => {
  it('es determinista para el mismo seed y valida opciones', () => {
    const a = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH });
    const b = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH });
    expect(Array.from(a.heights)).toEqual(Array.from(b.heights));
    expect(() => generateIslandHeightfield({ seed: 1, width: 1, depth: 32 })).toThrow('dimensiones');
    expect(() => generateIslandHeightfield({ seed: 1, width: 48, depth: 32, maxHeight: 0 })).toThrow('maxHeight');
    expect(() => generateIslandHeightfield({ seed: 1, width: 48, depth: 32, coast: 0.6 })).toThrow('coast');
    expect(() => generateIslandHeightfield({ seed: 1, width: 48, depth: 32, warp: 0.5 })).toThrow('warp');
  });

  it('mantiene alturas en rango y deja el interior en tierra', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH, maxHeight: 4 });
    expect(h.heights.length).toBe(WIDTH * DEPTH);
    for (const y of h.heights) {
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeLessThanOrEqual(4.001);
      expect(y).toBeGreaterThanOrEqual(-1.5);
    }
    /* El centro de la isla está claramente sobre el agua. */
    const center = h.heights[Math.floor(DEPTH / 2) * WIDTH + Math.floor(WIDTH / 2)];
    expect(center).toBeGreaterThanOrEqual(1);
  });

  it('las esquinas de la rejilla son océano (warp < coast siempre)', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH });
    for (const [i, j] of [[0, 0], [WIDTH - 1, 0], [0, DEPTH - 1], [WIDTH - 1, DEPTH - 1]] as const) {
      expect(h.heights[j * WIDTH + i]).toBeLessThan(h.waterLevel);
    }
  });

  it('las esquinas del rect jugable caen en tierra', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH });
    /* Mundo local x∈[-16,16], z∈[-8,8] → celdas i=floor(x+24), j=floor(z+16). */
    for (const [x, z] of [[16, 8], [-16, 8], [16, -8], [-16, -8]] as const) {
      const i = Math.floor(x + WIDTH / 2);
      const j = Math.floor(z + DEPTH / 2);
      expect(h.heights[j * WIDTH + i]).toBeGreaterThanOrEqual(h.waterLevel);
    }
  });
});

describe('cuantización a bloques (138A-1)', () => {
  it('deriva niveles de la misma base: océano -1, playa 0..maxLevel', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH, maxHeight: 4 });
    const levels = quantizeBlockLevels(h, MAX_LEVEL);
    expect(levels.length).toBe(WIDTH * DEPTH);
    for (let k = 0; k < levels.length; k += 1) {
      expect(levels[k]).toBeGreaterThanOrEqual(-1);
      expect(levels[k]).toBeLessThanOrEqual(MAX_LEVEL);
    }
    /* El agua sigue siendo agua y el centro sigue siendo hierba. */
    expect(levels[0]).toBe(-1);
    expect(levels[Math.floor(DEPTH / 2) * WIDTH + Math.floor(WIDTH / 2)]).toBeGreaterThanOrEqual(1);
    expect(Array.from(levels).some(v => v === 0)).toBe(true);
  });

  it('relajación + trim garantizan caminabilidad y sin islotes', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH, maxHeight: 4 });
    const levels = quantizeBlockLevels(h, MAX_LEVEL);
    relaxBlockWalkability(levels, WIDTH, DEPTH);
    trimLonelyIslands(levels, WIDTH, DEPTH);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (let j = 0; j < DEPTH; j += 1) {
      for (let i = 0; i < WIDTH; i += 1) {
        const lvl = levels[j * WIDTH + i];
        if (lvl < 0) continue;
        let landNeighbors = 0;
        for (const [di, dj] of dirs) {
          const ni = i + di;
          const nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= WIDTH || nj >= DEPTH) continue;
          const nh = levels[nj * WIDTH + ni];
          if (nh >= 0) {
            landNeighbors += 1;
            expect(Math.abs(lvl - nh)).toBeLessThanOrEqual(1);
          }
        }
        expect(landNeighbors).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('rechaza maxLevel fuera de rango', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH });
    expect(() => quantizeBlockLevels(h, 0)).toThrow('maxLevel');
    expect(() => quantizeBlockLevels(h, 17)).toThrow('maxLevel');
  });
});
