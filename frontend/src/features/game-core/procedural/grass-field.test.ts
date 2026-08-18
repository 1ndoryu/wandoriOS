/* 138A-10 — Campo de césped procedural por chunks (adaptación de
 * GrassSystemThreeJS orientada a rendimiento). Pruebas del pipeline puro:
 * presupuestos fail-closed (chunks ≤1024, instancias ≤10000), determinismo,
 * máscara de vegetación (add/remove), regeneración solo de la zona afectada
 * y parámetros densidad/tamaño/color normalizados. */

import { describe, expect, it } from 'vitest';
import { TERRAIN_SURFACE_IDS } from '../terrain-layers';
import {
  affectedChunksForCells,
  buildGrassField,
  grassCellChunk,
  GRASS_FIELD_DEFAULTS,
  GRASS_FIELD_LIMITS,
  normalizeGrassFieldOptions,
  validateGrassFieldOptions,
} from './grass-field';
import type { IslandHeightfield } from './heightmap';

const WIDTH = 48;
const DEPTH = 32;
const SEED = 1337;

/** Terreno plano sobre el nivel del agua para aislar la lógica de superficie
 *  y máscara del relieve del heightfield. */
function flatLand(width: number, depth: number, height = 1): IslandHeightfield {
  const heights = new Float32Array(width * depth).fill(height);
  return { width, depth, heights, waterLevel: 0, maxHeight: 1 };
}

describe('normalización de opciones de pasto (138A-10)', () => {
  it('normaliza campos ausentes a los defaults y acepta valores válidos', () => {
    expect(normalizeGrassFieldOptions(undefined)).toEqual({ ...GRASS_FIELD_DEFAULTS });
    expect(normalizeGrassFieldOptions({ density: 0.5, size: 2, color: 0xff0000 }))
      .toEqual({ enabled: true, density: 0.5, size: 2, color: 0xff0000 });
  });

  it('valida fail-closed: densidad, tamaño y color fuera de rango se rechazan', () => {
    expect(validateGrassFieldOptions({ density: 1.5 })).toContain('density fuera de rango');
    expect(validateGrassFieldOptions({ size: 0 })).toContain('size fuera de rango');
    expect(validateGrassFieldOptions({ size: 99 })).toContain('size fuera de rango');
    expect(validateGrassFieldOptions({ color: -1 })).toContain('color fuera de rango');
    expect(validateGrassFieldOptions({ color: 0x1000000 })).toContain('color fuera de rango');
    expect(validateGrassFieldOptions({ enabled: 'si' })).toContain('enabled debe ser booleano');
    expect(validateGrassFieldOptions({ nube: 1 })).toContain('campo no permitido: nube');
    expect(() => normalizeGrassFieldOptions({ density: 2 })).toThrow('opciones de pasto inválidas');
  });
});

describe('buildGrassField (138A-10)', () => {
  it('es determinista con el mismo seed y cambia con otro', () => {
    const h = flatLand(WIDTH, DEPTH);
    const a = buildGrassField(h, undefined, undefined, SEED);
    const b = buildGrassField(h, undefined, undefined, SEED);
    expect(a.bladeCount).toBe(b.bladeCount);
    expect(a.chunks).toEqual(b.chunks);
    expect(a.bladeCount).toBeGreaterThan(0);
    const c = buildGrassField(h, undefined, undefined, SEED + 1);
    expect(c.chunks).not.toEqual(a.chunks);
  });

  it('respeta presupuestos fail-closed: grid mayor a la cuota lanza', () => {
    const h = flatLand(WIDTH, DEPTH);
    expect(() => buildGrassField(h, undefined, undefined, SEED, {}, { maxChunks: 1 }))
      .toThrow('cuota de chunks');
    expect(() => buildGrassField(h, undefined, undefined, SEED, {}, { maxInstances: 0 }))
      .toThrow('maxInstances inválido');
    expect(() => buildGrassField(h, undefined, undefined, SEED, {}, { chunkSize: 0 }))
      .toThrow('chunkSize inválido');
  });

  it('nunca supera la cuota de instancias ni de chunks', () => {
    const h = flatLand(WIDTH, DEPTH);
    const capped = buildGrassField(h, undefined, undefined, SEED, {}, { maxInstances: 100, maxChunks: 6 });
    expect(capped.bladeCount).toBeLessThanOrEqual(100);
    expect(capped.chunkCount).toBeLessThanOrEqual(6);
    expect(GRASS_FIELD_LIMITS.maxChunks).toBeGreaterThanOrEqual(1024);
    expect(GRASS_FIELD_LIMITS.maxInstances).toBeGreaterThanOrEqual(10_000);
  });

  it('density 0 o enabled false produce un campo vacío', () => {
    const h = flatLand(WIDTH, DEPTH);
    expect(buildGrassField(h, undefined, undefined, SEED, { density: 0 }).bladeCount).toBe(0);
    const disabled = buildGrassField(h, undefined, undefined, SEED, { enabled: false });
    expect(disabled).toEqual({ chunks: [], bladeCount: 0, chunkCount: 0, overriddenCells: 0 });
  });

  it('solo genera pasto sobre tierra (y >= waterLevel)', () => {
    const underWater = flatLand(WIDTH, DEPTH, -1);
    const mask = new Int8Array(WIDTH * DEPTH).fill(1);
    const result = buildGrassField(underWater, undefined, mask, SEED);
    expect(result.bladeCount).toBe(0);
    expect(result.overriddenCells).toBe(0);
  });

  it('solo puebla superficies de hierba salvo que la máscara fuerce 1', () => {
    const h = flatLand(WIDTH, DEPTH);
    const allSand = new Uint8Array(WIDTH * DEPTH).fill(TERRAIN_SURFACE_IDS.sand);
    const bare = buildGrassField(h, allSand, undefined, SEED);
    expect(bare.bladeCount).toBe(0);

    const forced = new Int8Array(WIDTH * DEPTH).fill(1);
    const overSand = buildGrassField(h, allSand, forced, SEED);
    const plain = buildGrassField(h, undefined, undefined, SEED);
    expect(overSand.bladeCount).toBe(plain.bladeCount);
    expect(overSand.overriddenCells).toBe(WIDTH * DEPTH);
  });

  it('la máscara -1 prohíbe pasto incluso sobre hierba', () => {
    const h = flatLand(WIDTH, DEPTH);
    const forbidden = new Int8Array(WIDTH * DEPTH).fill(-1);
    const result = buildGrassField(h, undefined, forbidden, SEED);
    expect(result.bladeCount).toBe(0);
    expect(result.overriddenCells).toBe(WIDTH * DEPTH);
  });

  it('valida máscaras y superficies incompletas', () => {
    const h = flatLand(WIDTH, DEPTH);
    expect(() => buildGrassField(h, new Uint8Array(10), undefined, SEED))
      .toThrow('superficies incompletas');
    expect(() => buildGrassField(h, undefined, new Int8Array(10), SEED))
      .toThrow('máscara de vegetación incompleta');
  });
});

describe('chunking y regeneración de zona (138A-10)', () => {
  it('divide el grid en chunks de chunkSize celdas', () => {
    expect(grassCellChunk(0, 0)).toEqual({ cx: 0, cz: 0 });
    expect(grassCellChunk(15, 15)).toEqual({ cx: 0, cz: 0 });
    expect(grassCellChunk(16, 0)).toEqual({ cx: 1, cz: 0 });
    expect(grassCellChunk(0, 32)).toEqual({ cx: 0, cz: 2 });
  });

  it('affectedChunksForCells solo devuelve los chunks de las celdas tocadas', () => {
    expect(affectedChunksForCells([[0, 0], [5, 3], [17, 1]])).toEqual(['0:0', '1:0']);
    expect(affectedChunksForCells([[0.5, 1] as unknown as readonly [number, number]])).toEqual([]);
    expect(affectedChunksForCells([])).toEqual([]);
  });

  it('chunkFilter regenera solo la zona afectada al pintar', () => {
    const h = flatLand(WIDTH, DEPTH);
    const full = buildGrassField(h, undefined, undefined, SEED);
    expect(full.chunkCount).toBe((WIDTH / GRASS_FIELD_LIMITS.chunkSize) * (DEPTH / GRASS_FIELD_LIMITS.chunkSize));

    const keys = affectedChunksForCells([[0, 0], [17, 1]]);
    const partial = buildGrassField(h, undefined, undefined, SEED, {}, {}, new Set(keys));
    expect(partial.chunks.map(chunk => `${chunk.cx}:${chunk.cz}`).sort()).toEqual(keys);
    const expected = full.chunks
      .filter(chunk => keys.includes(`${chunk.cx}:${chunk.cz}`))
      .reduce((sum, chunk) => sum + chunk.blades.length, 0);
    expect(partial.bladeCount).toBe(expected);
  });

  it('las briznas son deterministas por celda y conservan y/scale por instancia', () => {
    const h = flatLand(WIDTH, DEPTH);
    const result = buildGrassField(h, undefined, undefined, SEED, { size: 2 });
    expect(result.chunks.length).toBeGreaterThan(0);
    for (const chunk of result.chunks) {
      for (const blade of chunk.blades) {
        expect(blade.y).toBeGreaterThanOrEqual(h.waterLevel);
        expect(blade.scale).toBeGreaterThan(0);
        expect(Number.isFinite(blade.x)).toBe(true);
        expect(Number.isFinite(blade.z)).toBe(true);
      }
    }
    const again = buildGrassField(h, undefined, undefined, SEED, { size: 2 });
    expect(again.chunks).toEqual(result.chunks);
  });
});
