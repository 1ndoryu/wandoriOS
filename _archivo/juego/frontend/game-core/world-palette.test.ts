import { describe, expect, it } from 'vitest';
import {
  normalizeWorldPalette,
  validateWorldPalette,
  WORLD_PALETTE_DEFAULTS,
  WORLD_PALETTE_SAKURA,
  worldPaletteToHeightfieldRamp,
  worldPaletteToVegetationPalette,
  type WorldPalette,
} from './world-palette';

describe('paleta unificada del mundo (138A-8)', () => {
  it('los defaults son válidos y serializables', () => {
    expect(validateWorldPalette(WORLD_PALETTE_DEFAULTS)).toEqual([]);
    expect(normalizeWorldPalette(WORLD_PALETTE_DEFAULTS)).toEqual(WORLD_PALETTE_DEFAULTS);
  });

  it('[138A-15] la paleta Sakura es válida y usa los mismos 13 tokens', () => {
    expect(validateWorldPalette(WORLD_PALETTE_SAKURA)).toEqual([]);
    expect(normalizeWorldPalette(WORLD_PALETTE_SAKURA)).toEqual(WORLD_PALETTE_SAKURA);
    expect(Object.keys(WORLD_PALETTE_SAKURA).sort()).toEqual(Object.keys(WORLD_PALETTE_DEFAULTS).sort());
  });

  it('[138A-15] la paleta Sakura difiere de la del Bosque en todos los tokens', () => {
    for (const key of Object.keys(WORLD_PALETTE_SAKURA) as (keyof WorldPalette)[]) {
      expect(WORLD_PALETTE_SAKURA[key]).not.toBe(WORLD_PALETTE_DEFAULTS[key]);
    }
  });

  it('rechaza claves no permitidas, faltantes o colores fuera de rango', () => {
    expect(validateWorldPalette({ ...WORLD_PALETTE_DEFAULTS, extra: 0 }))
      .toContain('clave no permitida: extra');
    const { sky: _sky, ...sinCielo } = WORLD_PALETTE_DEFAULTS;
    expect(validateWorldPalette(sinCielo).join('; ')).toContain('sky');
    expect(validateWorldPalette({ ...WORLD_PALETTE_DEFAULTS, grass: 0x1000000 }).join('; '))
      .toContain('grass');
    expect(validateWorldPalette({ ...WORLD_PALETTE_DEFAULTS, grass: 1.5 }).join('; '))
      .toContain('grass');
  });

  it('falla cerrado con no-objetos y arrays', () => {
    expect(validateWorldPalette(null).length).toBeGreaterThan(0);
    expect(validateWorldPalette([WORLD_PALETTE_DEFAULTS]).length).toBeGreaterThan(0);
    expect(() => normalizeWorldPalette({ ...WORLD_PALETTE_DEFAULTS, dirt: -1 })).toThrow(/paleta/);
  });

  it('convierte la paleta a la rampa 3-banda del heightfield en RGB 0..1', () => {
    const ramp = worldPaletteToHeightfieldRamp({
      ...WORLD_PALETTE_DEFAULTS,
      sand: 0xffffff,
      grass: 0x0000ff,
      rock: 0xff0000,
    });
    expect(ramp[0]).toEqual([1, 1, 1]);
    expect(ramp[1]).toEqual([0, 0, 1]);
    expect(ramp[2]).toEqual([1, 0, 0]);
  });

  it('expone solo los tokens de vegetación low-poly', () => {
    const veg = worldPaletteToVegetationPalette(WORLD_PALETTE_DEFAULTS);
    expect(veg).toEqual({
      grass: WORLD_PALETTE_DEFAULTS.grass,
      trunk: WORLD_PALETTE_DEFAULTS.trunk,
      leaf: WORLD_PALETTE_DEFAULTS.leaf,
      leafDark: WORLD_PALETTE_DEFAULTS.leafDark,
      rock: WORLD_PALETTE_DEFAULTS.rock,
      rockDark: WORLD_PALETTE_DEFAULTS.rockDark,
    });
  });
});
