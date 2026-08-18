/* 138A-12 — Opciones de cielo (skydome procedural). Pruebas del contrato
 * puro: defaults/presets válidos, validación fail-closed con mensajes en
 * español, normalización de campos ausentes y dirección solar compartida
 * entre shader y luces. */

import { describe, expect, it } from 'vitest';
import {
  normalizeSkyOptions,
  SKY_DEFAULTS,
  skyPresetOptions,
  sunDirectionFromOptions,
  validateSkyOptions,
} from './sky-options';
import { SKY_LIMITS } from './sky-limits';
import { SKY_PRESETS } from './sky-presets';

describe('opciones de cielo (138A-12)', () => {
  it('normaliza un valor ausente a los defaults y acepta opciones válidas', () => {
    expect(normalizeSkyOptions(undefined)).toEqual({ ...SKY_DEFAULTS });
    const partial = normalizeSkyOptions({ coverage: 0.3, sunEl: 20, layer2: false });
    expect(partial).toMatchObject({ coverage: 0.3, sunEl: 20, layer2: false });
    expect(partial.octaves).toBe(SKY_DEFAULTS.octaves);
    expect(partial.zenith).toBe(SKY_DEFAULTS.zenith);
    expect(validateSkyOptions(partial)).toEqual([]);
  });

  it('valida fail-closed: rangos, enteros y campos no permitidos', () => {
    expect(validateSkyOptions({ coverage: 1.5 })).toContain('coverage fuera de rango');
    expect(validateSkyOptions({ octaves: 1.5 })).toContain('octaves fuera de rango');
    expect(validateSkyOptions({ mode: 3 })).toContain('mode fuera de rango');
    expect(validateSkyOptions({ sunEl: -20 })).toContain('sunEl fuera de rango');
    expect(validateSkyOptions({ zenith: 0x1000000 })).toContain('zenith fuera de rango');
    expect(validateSkyOptions({ layer2: 'si' })).toContain('layer2 debe ser booleano');
    expect(validateSkyOptions({ preset: 'tormenta' })).toContain('preset no permitido');
    expect(validateSkyOptions({ nebulosa: 1 })).toContain('campo no permitido: nebulosa');
    expect(() => normalizeSkyOptions({ coverage: 7 })).toThrow('opciones de cielo inválidas');
  });

  it('expone 4 presets serializables y conserva el resto al aplicarlos', () => {
    expect(SKY_PRESETS.map(preset => preset.key)).toEqual(['day', 'golden', 'dusk', 'overcast']);
    for (const preset of SKY_PRESETS) {
      const options = skyPresetOptions(preset.key);
      expect(validateSkyOptions(options)).toEqual([]);
      expect(options.preset).toBe(preset.key);
      expect(options.sunEl).toBe(preset.sunEl);
      expect(options.sunAz).toBe(preset.sunAz);
    }
    const golden = skyPresetOptions('golden', { ...SKY_DEFAULTS, coverage: 0.25 });
    expect(golden.coverage).toBe(0.25);
    expect(golden.zenith).toBe(0x6e94be);
    expect(golden.mid).toBe(0xcbafa6);
    expect(() => skyPresetOptions('storm' as 'day')).toThrow('preset de cielo no permitido');
  });

  it('respeta los límites declarados del contrato', () => {
    expect(SKY_LIMITS.maxOctaves).toBeGreaterThanOrEqual(8);
    expect(SKY_LIMITS.maxScale).toBeGreaterThanOrEqual(9);
    expect(SKY_LIMITS.minSunEl).toBeLessThanOrEqual(-12);
    expect(SKY_LIMITS.maxSunInfluence).toBeGreaterThanOrEqual(1.5);
  });
});

describe('sunDirectionFromOptions (138A-12)', () => {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  const nearVec = (a: readonly number[], b: readonly number[]): boolean =>
    a.length === b.length && a.every((value, index) => near(value, b[index]));

  it('zenit (el=90°) apunta hacia arriba', () => {
    expect(nearVec(sunDirectionFromOptions(90, 0), [0, 1, 0])).toBe(true);
  });

  it('el=0° con az=0° apunta a +Z y con az=90° a +X', () => {
    expect(nearVec(sunDirectionFromOptions(0, 0), [0, 0, 1])).toBe(true);
    expect(nearVec(sunDirectionFromOptions(0, 90), [1, 0, 0])).toBe(true);
  });

  it('el=38°, az=150° coincide con la fórmula de la referencia', () => {
    const expected: [number, number, number] = [
      Math.cos(38 * Math.PI / 180) * Math.sin(150 * Math.PI / 180),
      Math.sin(38 * Math.PI / 180),
      Math.cos(38 * Math.PI / 180) * Math.cos(150 * Math.PI / 180),
    ];
    const length = Math.hypot(...expected);
    expect(nearVec(sunDirectionFromOptions(38, 150), expected.map(v => v / length))).toBe(true);
  });

  it('siempre devuelve un vector unitario', () => {
    for (const [el, az] of [[-12, 0], [10, 45], [38, 150], [52, 110], [90, 360]] as const) {
      const direction = sunDirectionFromOptions(el, az);
      expect(Math.abs(Math.hypot(...direction) - 1)).toBeLessThan(1e-6);
    }
  });
});
