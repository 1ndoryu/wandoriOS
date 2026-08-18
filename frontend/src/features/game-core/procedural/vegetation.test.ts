import { describe, expect, it } from 'vitest';
import { generateIslandHeightfield } from './heightmap';
import { placeVegetation, VEGETATION_BASE_SCALE, VEGETATION_DEFAULTS } from './vegetation';

const WIDTH = 48;
const DEPTH = 32;
const SEED = 1337;

function sample(): ReturnType<typeof placeVegetation> {
  const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH, maxHeight: 4 });
  return placeVegetation(h, SEED, {
    maxGrass: 300,
    maxTrees: 50,
    maxRocks: 20,
  });
}

describe('placeVegetation (138A-1)', () => {
  it('es determinista y respeta presupuestos', () => {
    const a = sample();
    const b = sample();
    expect(a.placements).toEqual(b.placements);
    expect(a.counts.grass).toBeLessThanOrEqual(300);
    expect(a.counts.tree).toBeLessThanOrEqual(50);
    expect(a.counts.rock).toBeLessThanOrEqual(20);
    expect(a.landCells).toBeGreaterThan(0);
    expect(a.placements.length).toBe(a.counts.grass + a.counts.tree + a.counts.rock);
  });

  it('planta solo sobre tierra y nunca solapa la misma clase', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH, maxHeight: 4 });
    const result = placeVegetation(h, SEED, VEGETATION_DEFAULTS);
    const { grassSpacing, treeSpacing, rockSpacing } = VEGETATION_DEFAULTS;
    const minLarge = Math.min(treeSpacing, rockSpacing);
    for (let a = 0; a < result.placements.length; a += 1) {
      const pa = result.placements[a];
      const i = Math.floor(pa.x + WIDTH / 2);
      const j = Math.floor(pa.z + DEPTH / 2);
      expect(h.heights[j * WIDTH + i]).toBeGreaterThanOrEqual(h.waterLevel);
      for (let bIdx = a + 1; bIdx < result.placements.length; bIdx += 1) {
        const pb = result.placements[bIdx];
        const distance = Math.hypot(pa.x - pb.x, pa.z - pb.z);
        if (pa.kind === 'grass' && pb.kind === 'grass') {
          expect(distance).toBeGreaterThanOrEqual(grassSpacing - 0.001);
        } else if (pa.kind === 'tree' && pb.kind === 'tree') {
          expect(distance).toBeGreaterThanOrEqual(treeSpacing - 0.001);
        } else if (pa.kind === 'rock' && pb.kind === 'rock') {
          expect(distance).toBeGreaterThanOrEqual(rockSpacing - 0.001);
        } else if ((pa.kind === 'tree' && pb.kind === 'rock') || (pa.kind === 'rock' && pb.kind === 'tree')) {
          expect(distance).toBeGreaterThanOrEqual(minLarge - 0.001);
        }
      }
    }
  });

  it('rechaza presupuestos y distancias inválidas', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH });
    expect(() => placeVegetation(h, SEED, { maxGrass: -1 })).toThrow('presupuestos');
    expect(() => placeVegetation(h, SEED, { maxTrees: 1.5 })).toThrow('presupuestos');
    expect(() => placeVegetation(h, SEED, { grassSpacing: 0 })).toThrow('distancias');
  });

  it('aplica la escala base menor (~0.5×) a todas las instancias (138A-6)', () => {
    const h = generateIslandHeightfield({ seed: SEED, width: WIDTH, depth: DEPTH, maxHeight: 4 });
    const result = placeVegetation(h, SEED);
    expect(result.placements.length).toBeGreaterThan(0);
    for (const placement of result.placements) {
      expect(placement.scale).toBeGreaterThanOrEqual(VEGETATION_BASE_SCALE * 0.8 - 1e-9);
      expect(placement.scale).toBeLessThanOrEqual(VEGETATION_BASE_SCALE * 1.25 + 1e-9);
    }
  });
});
