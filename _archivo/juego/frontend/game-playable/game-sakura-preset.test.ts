import { beforeEach, describe, expect, it } from 'vitest';
import {
  SKY_DEFAULTS,
  validateSkyOptions,
  terrainOptionsPreset,
} from '../../../game-core';
import {
  clearConstructorState,
  loadConstructorState,
  saveConstructorState,
} from './game-constructor-persistence';
import {
  DEFAULT_VISUAL_STYLE,
  isVisualStyleKey,
  isVisualStyleSettings,
  normalizeVisualStyle,
  normalizeVisualStyleKey,
  SAKURA_SKY,
  SAKURA_STYLE,
  validateVisualStyleSettings,
  VISUAL_STYLE_KEYS,
  type VisualStyleSettings,
} from './game-sakura-preset';

describe('preset de estilo Sakura Crossing (138A-15)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('el default es bosque sin tinta y es válido', () => {
    expect(DEFAULT_VISUAL_STYLE).toEqual({ key: 'bosque', ink: false });
    expect(isVisualStyleSettings(DEFAULT_VISUAL_STYLE)).toBe(true);
    expect(validateVisualStyleSettings(DEFAULT_VISUAL_STYLE)).toEqual([]);
    expect(normalizeVisualStyle(undefined)).toEqual(DEFAULT_VISUAL_STYLE);
  });

  it('normaliza la clave con fail-closed hacia bosque', () => {
    expect(normalizeVisualStyleKey('sakura')).toBe('sakura');
    expect(normalizeVisualStyleKey('bloques')).toBe('bosque');
    expect(normalizeVisualStyleKey(42)).toBe('bosque');
    expect(isVisualStyleKey('sakura')).toBe(true);
    expect(VISUAL_STYLE_KEYS).toEqual(['bosque', 'sakura']);
  });

  it('valida y normaliza ajustes completos (key + ink)', () => {
    const sakura: VisualStyleSettings = { key: 'sakura', ink: true };
    expect(validateVisualStyleSettings(sakura)).toEqual([]);
    expect(normalizeVisualStyle(sakura)).toEqual(sakura);
    expect(() => normalizeVisualStyle({ key: 'sakura', ink: 'sí' })).toThrow(/estilo visual/);
    expect(() => normalizeVisualStyle({ key: 'otro', ink: false })).toThrow(/estilo visual/);
    expect(() => normalizeVisualStyle([DEFAULT_VISUAL_STYLE])).toThrow(/estilo visual/);
    expect(isVisualStyleSettings({ key: 'sakura', ink: 'no' })).toBe(false);
  });

  it('SAKURA_STYLE expone tinte violeta, luces 2+1 y rampa de 4 bandas', () => {
    expect(SAKURA_STYLE.tint).toBe(0x6c5f8c);
    expect(SAKURA_STYLE.rampBands).toBe(4);
    expect(SAKURA_STYLE.shadows).toBe(true);
    expect(SAKURA_STYLE.hemiIntensity).toBeGreaterThan(1);
    expect(SAKURA_STYLE.fillColor).toBe(0xa9bdf5);
    expect(SAKURA_STYLE.bounceColor).toBe(0xd8cbe8);
  });

  it('SAKURA_SKY es un cielo válido con paleta pastel lavanda/crema', () => {
    expect(validateSkyOptions(SAKURA_SKY)).toEqual([]);
    expect(SAKURA_SKY.zenith).toBe(0x9fb6d8);
    expect(SAKURA_SKY.horizon).toBe(0xf2edf7);
    expect(SAKURA_SKY.sunEl).toBe(34);
    expect(SAKURA_SKY.coverage).toBe(0.25);
    expect(SAKURA_SKY.haze).toBe(0.08);
    expect(SAKURA_SKY.preset).toBe('day');
    /* El cielo sakura difiere del default en los tokens de color. */
    expect(SAKURA_SKY.zenith).not.toBe(SKY_DEFAULTS.zenith);
  });

  it('[138A-15] persiste y restaura el campo style opcional con toEqual exacto', () => {
    const options = terrainOptionsPreset('isla');
    const style: VisualStyleSettings = { key: 'sakura', ink: false };
    expect(saveConstructorState({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
      style,
    })).toBe(true);
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
      style,
    });
  });

  it('[138A-15] un style corrupto cae a omitido sin bloquear la carga', () => {
    const options = terrainOptionsPreset('isla');
    window.localStorage.setItem('wandorius:constructor:v1', JSON.stringify({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
      style: { key: 'naranja', ink: false },
    }));
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
    });
    clearConstructorState();
  });
});
