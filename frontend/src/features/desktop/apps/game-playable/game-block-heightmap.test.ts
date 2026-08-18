import { describe, expect, it } from 'vitest';
import {
  BEACH_LEVEL,
  cellAt,
  generateBlockHeightmap,
  levelAt,
  OCEAN_LEVEL,
} from './game-block-heightmap';

const WIDTH = 48;
const DEPTH = 32;
const MAX_LEVEL = 4;
const SEED = 1337;

describe('generateBlockHeightmap (bloques Minecraft)', () => {
  it('es determinista para el mismo seed', () => {
    const a = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    const b = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    expect(Array.from(a.levels)).toEqual(Array.from(b.levels));
  });

  it('mantiene alturas dentro de -1..maxLevel y genera playa e interior', () => {
    const h = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    for (let k = 0; k < WIDTH * DEPTH; k += 1) {
      expect(h.levels[k]).toBeGreaterThanOrEqual(OCEAN_LEVEL);
      expect(h.levels[k]).toBeLessThanOrEqual(MAX_LEVEL);
    }
    expect(Array.from(h.levels).some(v => v === BEACH_LEVEL)).toBe(true);
    expect(Array.from(h.levels).some(v => v >= 1)).toBe(true);
  });

  it('ningún vecino difiere en más de un bloque (caminabilidad)', () => {
    const h = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (let j = 0; j < DEPTH; j += 1) {
      for (let i = 0; i < WIDTH; i += 1) {
        const lvl = h.levels[j * WIDTH + i];
        if (lvl < 0) continue;
        for (const [di, dj] of dirs) {
          const nh = levelAt(h, i + di, j + dj);
          if (nh < 0) continue;
          expect(Math.abs(lvl - nh)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('las esquinas del rect jugable caen en tierra (el océano queda fuera)', () => {
    const h = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    /* Local = mundo - centro(6,0); rect jugable x∈[-16,16], z∈[-8,8]. */
    for (const [x, z] of [[16, 8], [-16, 8], [16, -8], [-16, -8]]) {
      const cell = cellAt(h, x, z);
      expect(cell).not.toBeNull();
      expect(cell?.level).toBeGreaterThanOrEqual(0);
    }
  });

  it('las esquinas de la rejilla son océano', () => {
    const h = generateBlockHeightmap(SEED, WIDTH, DEPTH, MAX_LEVEL);
    expect(levelAt(h, 0, 0)).toBe(OCEAN_LEVEL);
    expect(levelAt(h, WIDTH - 1, 0)).toBe(OCEAN_LEVEL);
    expect(levelAt(h, 0, DEPTH - 1)).toBe(OCEAN_LEVEL);
    expect(levelAt(h, WIDTH - 1, DEPTH - 1)).toBe(OCEAN_LEVEL);
  });
});
