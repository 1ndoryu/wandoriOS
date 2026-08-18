import { describe, expect, it } from 'vitest';
import {
  RENDER_STYLES,
  SHAPE_PRESETS,
  TERRAIN_OPTIONS_DEFAULTS,
  WORLD_PRESETS,
  normalizeTerrainOptions,
  terrainOptionsPreset,
  validateTerrainOptions,
} from './terrain-options';

describe('TerrainOptions (138A-4)', () => {
  it('los defaults y presets de forma son válidos', () => {
    expect(validateTerrainOptions(TERRAIN_OPTIONS_DEFAULTS)).toEqual([]);
    for (const preset of SHAPE_PRESETS) {
      expect(validateTerrainOptions(terrainOptionsPreset(preset.key))).toEqual([]);
    }
    for (const preset of WORLD_PRESETS) {
      expect(validateTerrainOptions(preset.options)).toEqual([]);
      expect(preset.options.shape).toBe(preset.key);
    }
    for (const style of RENDER_STYLES) {
      expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, style: style.key })).toEqual([]);
    }
    /* 138A-6: solo dos estilos; el histórico 'actual' queda fuera del contrato. */
    expect(RENDER_STYLES.map(style => style.key)).toEqual(['bloques', 'suave']);
    expect(TERRAIN_OPTIONS_DEFAULTS.style).toBe('bloques');
  });

  it('rechaza opciones inválidas fail-closed', () => {
    expect(validateTerrainOptions(null)).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, shape: 'luna' })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, style: 'wireframe' })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, style: 'actual' })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, width: 10 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, depth: 17 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, width: 512 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, maxHeight: 0 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, maxHeight: 33 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, octaves: 9 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, vegetationDensity: 2 })).not.toEqual([]);
    expect(validateTerrainOptions({ ...TERRAIN_OPTIONS_DEFAULTS, cellSize: 3 })).not.toEqual([]);
  });

  it('normaliza parciales con defaults y falla ante campos inválidos', () => {
    const normalized = normalizeTerrainOptions({ seed: 42, shape: 'valle' });
    expect(normalized.seed).toBe(42);
    expect(normalized.shape).toBe('valle');
    expect(normalized.width).toBe(TERRAIN_OPTIONS_DEFAULTS.width);
    expect(normalized.style).toBe(TERRAIN_OPTIONS_DEFAULTS.style);
    expect(() => normalizeTerrainOptions({ width: 3 })).toThrow('width');
    expect(() => normalizeTerrainOptions('mal')).toThrow('opciones');
  });

  it('cada preset de forma tiene seed determinista distinto', () => {
    const seeds = new Set(WORLD_PRESETS.map(preset => preset.options.seed));
    expect(seeds.size).toBe(WORLD_PRESETS.length);
  });
});
