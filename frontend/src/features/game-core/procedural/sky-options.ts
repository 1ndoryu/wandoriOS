/* 138A-12 — Contrato puro de opciones de cielo (skydome procedural y
 * ambiente) del Constructor de mundo. Adaptación de la referencia
 * "Skydome — Procedural Painted Clouds" (arteFacto Claude) orientada a
 * rendimiento: un solo ShaderMaterial con value noise + fbm billow, dominio
 * warp, self-shadow barato de 2 pasos y paleta posterizada
 * (deep/shadow/mid/light/high) estilo pintura al óleo. Sin Three/DOM/red:
 * solo datos validados, presets serializables y el helper de dirección
 * solar que comparten shader y luces (presentación). */

import { SKY_PRESETS, type SkyPresetKey } from './sky-presets';
import { SKY_LIMITS } from './sky-limits';

export interface SkyOptions {
  /** 0 = nubes arriba, 1 = banda ecuatorial, 2 = en todas partes. */
  readonly mode: number;
  /** Elevación mínima (modo 0) donde empiezan las nubes altas. */
  readonly highStart: number;
  /** Límite superior de la banda ecuatorial (modo 1). */
  readonly bandTop: number;
  /** Límite inferior de la banda ecuatorial (modo 1). */
  readonly bandLow: number;
  /** Cobertura 0..1: 0 = despejado, 1 = nublado sólido. */
  readonly coverage: number;
  /** Escala espacial de las nubes (mayor = nubes más grandes). */
  readonly scale: number;
  /** Aplanado vertical (0.5..3.5): mayor = nubes más chatas. */
  readonly squash: number;
  /** 0 = fbm suave, 1 = billow (lóbulos de cúmulo). */
  readonly puff: number;
  /** Dureza del borde de silueta (0.004..0.3). */
  readonly edge: number;
  /** Domain warp de baja frecuencia (0..1.2). */
  readonly warp: number;
  /** Octavas de detalle del fbm (2..8). */
  readonly octaves: number;
  /** Bandas de la rampa posterizada (2..14). */
  readonly bands: number;
  /** 0..1: mezcla hacia la rampa cuantizada (pintado plano). */
  readonly posterize: number;
  /** Fuerza del self-shadow barato (0..2). */
  readonly shadowStr: number;
  /** Separación de los pasos de sombra hacia el sol (0.05..0.9). */
  readonly stepScale: number;
  /** Silver lining: brillo cálido en bordes finos frente al sol (0..1.5). */
  readonly silver: number;
  /** Activa la capa lejana de nubes (segunda pasada, barata). */
  readonly layer2: boolean;
  /** Cobertura de la capa lejana (0..1). */
  readonly l2Coverage: number;
  /** Escala relativa de la capa lejana (0.4..3). */
  readonly l2Scale: number;
  /** Opacidad de la capa lejana (0..1). */
  readonly l2Opacity: number;
  /** Calima de horizonte (0..1). */
  readonly haze: number;
  /** Elevación solar en grados (-12..90; negativo = bajo el horizonte). */
  readonly sunEl: number;
  /** Azimut solar en grados (0..360). */
  readonly sunAz: number;
  /** Influencia del sol sobre luces, self-shadow y resplandor (0..1.5). */
  readonly sunInfluence: number;
  /** Tamaño del disco solar (0.3..8). */
  readonly sunSize: number;
  /** Extensión del resplandor solar (0..1: 1 = halo ancho y suave). */
  readonly sunGlow: number;
  /** Velocidad del viento (rotación de la muestra alrededor de Y; 0..0.12). */
  readonly drift: number;
  /** Evolución de las nubes con el tiempo (0..2). */
  readonly evolve: number;
  /** Seed del campo de ruido (0..500). */
  readonly seed: number;
  /** Zenit del cielo (hex 0xRRGGBB). */
  readonly zenith: number;
  /** Color del horizonte (hex). */
  readonly horizon: number;
  /** Color bajo el horizonte (hex). */
  readonly ground: number;
  /** Color del sol (hex). */
  readonly sun: number;
  /** Sombra profunda de la paleta de nubes (hex). */
  readonly deep: number;
  /** Sombra media de la paleta de nubes (hex). */
  readonly shadow: number;
  /** Tono medio de la paleta de nubes (hex). */
  readonly mid: number;
  /** Tono claro de la paleta de nubes (hex). */
  readonly light: number;
  /** Tono alto (brillos) de la paleta de nubes (hex). */
  readonly high: number;
  /** Preset activo (marca el segmento; los valores viajan explícitos). */
  readonly preset: SkyPresetKey;
}

export const SKY_DEFAULTS: Readonly<SkyOptions> = {
  preset: 'day',
  mode: 1,
  highStart: 0.16,
  bandTop: 0.46,
  bandLow: -0.22,
  coverage: 0.6,
  scale: 3.1,
  squash: 1.55,
  puff: 0.82,
  edge: 0.03,
  warp: 0.42,
  octaves: 6,
  bands: 5,
  posterize: 0.8,
  shadowStr: 1.15,
  stepScale: 0.28,
  silver: 0.55,
  layer2: true,
  l2Coverage: 0.42,
  l2Scale: 1.3,
  l2Opacity: 0.55,
  haze: 0.55,
  sunEl: 38,
  sunAz: 150,
  sunInfluence: 1,
  sunSize: 2.2,
  sunGlow: 0.75,
  drift: 0.012,
  evolve: 0.35,
  seed: 37,
  zenith: 0x8fb6ce,
  horizon: 0xefe4c8,
  ground: 0x9fb0b4,
  sun: 0xfff6dc,
  deep: 0x5c8399,
  shadow: 0x7da2b6,
  mid: 0xaac0c6,
  light: 0xddd9c3,
  high: 0xf6eed6,
};

const SKY_PRESET_KEYS: readonly SkyPresetKey[] = SKY_PRESETS.map(preset => preset.key);
const COLOR_FIELDS = ['zenith', 'horizon', 'ground', 'sun', 'deep', 'shadow', 'mid', 'light', 'high'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inRange(value: unknown, min: number, max: number): value is number {
  return finite(value) && value >= min && value <= max;
}

/** Valida opciones de cielo; devuelve mensajes en español (vacío = válida). */
export function validateSkyOptions(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['requiere un objeto de opciones'];
  const issues: string[] = [];
  const allowed = [
    'preset', 'mode', 'highStart', 'bandTop', 'bandLow', 'coverage', 'scale',
    'squash', 'puff', 'edge', 'warp', 'octaves', 'bands', 'posterize',
    'shadowStr', 'stepScale', 'silver', 'layer2', 'l2Coverage', 'l2Scale',
    'l2Opacity', 'haze', 'sunEl', 'sunAz', 'sunInfluence', 'sunSize',
    'sunGlow', 'drift', 'evolve', 'seed', ...COLOR_FIELDS,
  ];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`campo no permitido: ${key}`);
  }
  if (value.preset !== undefined && !SKY_PRESET_KEYS.includes(value.preset as SkyPresetKey)) {
    issues.push('preset no permitido');
  }
  if (value.layer2 !== undefined && typeof value.layer2 !== 'boolean') {
    issues.push('layer2 debe ser booleano');
  }
  const ranges: readonly { readonly key: string; readonly min: number; readonly max: number }[] = [
    { key: 'mode', min: SKY_LIMITS.minMode, max: SKY_LIMITS.maxMode },
    { key: 'highStart', min: SKY_LIMITS.minHighStart, max: SKY_LIMITS.maxHighStart },
    { key: 'bandTop', min: SKY_LIMITS.minBandTop, max: SKY_LIMITS.maxBandTop },
    { key: 'bandLow', min: SKY_LIMITS.minBandLow, max: SKY_LIMITS.maxBandLow },
    { key: 'coverage', min: SKY_LIMITS.minCoverage, max: SKY_LIMITS.maxCoverage },
    { key: 'scale', min: SKY_LIMITS.minScale, max: SKY_LIMITS.maxScale },
    { key: 'squash', min: SKY_LIMITS.minSquash, max: SKY_LIMITS.maxSquash },
    { key: 'puff', min: SKY_LIMITS.minPuff, max: SKY_LIMITS.maxPuff },
    { key: 'edge', min: SKY_LIMITS.minEdge, max: SKY_LIMITS.maxEdge },
    { key: 'warp', min: SKY_LIMITS.minWarp, max: SKY_LIMITS.maxWarp },
    { key: 'octaves', min: SKY_LIMITS.minOctaves, max: SKY_LIMITS.maxOctaves },
    { key: 'bands', min: SKY_LIMITS.minBands, max: SKY_LIMITS.maxBands },
    { key: 'posterize', min: SKY_LIMITS.minPosterize, max: SKY_LIMITS.maxPosterize },
    { key: 'shadowStr', min: SKY_LIMITS.minShadowStr, max: SKY_LIMITS.maxShadowStr },
    { key: 'stepScale', min: SKY_LIMITS.minStepScale, max: SKY_LIMITS.maxStepScale },
    { key: 'silver', min: SKY_LIMITS.minSilver, max: SKY_LIMITS.maxSilver },
    { key: 'l2Coverage', min: SKY_LIMITS.minL2Coverage, max: SKY_LIMITS.maxL2Coverage },
    { key: 'l2Scale', min: SKY_LIMITS.minL2Scale, max: SKY_LIMITS.maxL2Scale },
    { key: 'l2Opacity', min: SKY_LIMITS.minL2Opacity, max: SKY_LIMITS.maxL2Opacity },
    { key: 'haze', min: SKY_LIMITS.minHaze, max: SKY_LIMITS.maxHaze },
    { key: 'sunEl', min: SKY_LIMITS.minSunEl, max: SKY_LIMITS.maxSunEl },
    { key: 'sunAz', min: SKY_LIMITS.minSunAz, max: SKY_LIMITS.maxSunAz },
    { key: 'sunInfluence', min: SKY_LIMITS.minSunInfluence, max: SKY_LIMITS.maxSunInfluence },
    { key: 'sunSize', min: SKY_LIMITS.minSunSize, max: SKY_LIMITS.maxSunSize },
    { key: 'sunGlow', min: SKY_LIMITS.minSunGlow, max: SKY_LIMITS.maxSunGlow },
    { key: 'drift', min: SKY_LIMITS.minDrift, max: SKY_LIMITS.maxDrift },
    { key: 'evolve', min: SKY_LIMITS.minEvolve, max: SKY_LIMITS.maxEvolve },
    { key: 'seed', min: SKY_LIMITS.minSeed, max: SKY_LIMITS.maxSeed },
  ];
  for (const { key, min, max } of ranges) {
    const v = value[key];
    if (v === undefined) continue;
    if (key === 'mode' || key === 'octaves' || key === 'bands') {
      if (!inRange(v, min, max) || !Number.isSafeInteger(v)) {
        issues.push(`${key} fuera de rango`);
      }
    } else if (!inRange(v, min, max)) {
      issues.push(`${key} fuera de rango`);
    }
  }
  for (const field of COLOR_FIELDS) {
    const v = value[field];
    if (v !== undefined && (!finite(v) || v < 0 || v > 0xffffff || !Number.isSafeInteger(v))) {
      issues.push(`${field} fuera de rango`);
    }
  }
  return issues;
}

/** Normaliza opciones de cielo (fail-closed: lanza ante cualquier valor
 *  inválido; los campos ausentes —y un valor ausente— caen a los defaults). */
export function normalizeSkyOptions(value: unknown): SkyOptions {
  if (value === undefined || value === null) return { ...SKY_DEFAULTS };
  const issues = validateSkyOptions(value);
  if (issues.length > 0) throw new Error(`opciones de cielo inválidas: ${issues.join('; ')}`);
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(SKY_DEFAULTS)) {
    result[key] = record[key] ?? (SKY_DEFAULTS as Record<string, unknown>)[key];
  }
  return result as unknown as SkyOptions;
}

/** Devuelve las opciones completas de un preset (colores + sol del preset;
 *  el resto de parámetros se conservan). */
export function skyPresetOptions(key: SkyPresetKey, base: SkyOptions = SKY_DEFAULTS): SkyOptions {
  const preset = SKY_PRESETS.find(candidate => candidate.key === key);
  if (!preset) throw new Error(`preset de cielo no permitido: ${key}`);
  return {
    ...normalizeSkyOptions(base),
    ...preset.colors,
    sunEl: preset.sunEl,
    sunAz: preset.sunAz,
    preset: key,
  };
}

/** Dirección unitaria del sol en coordenadas de mundo a partir de elevación
 *  y azimut en grados (misma fórmula que la referencia; la comparten el
 *  shader, la luz direccional y la hemisférica). Devuelve [x, y, z]. */
export function sunDirectionFromOptions(sunEl: number, sunAz: number): readonly [number, number, number] {
  const el = sunEl * Math.PI / 180;
  const az = sunAz * Math.PI / 180;
  const raw: [number, number, number] = [
    Math.cos(el) * Math.sin(az),
    Math.sin(el),
    Math.cos(el) * Math.cos(az),
  ];
  const length = Math.hypot(raw[0], raw[1], raw[2]);
  if (length < 1e-9) return [0, 1, 0];
  return [raw[0] / length, raw[1] / length, raw[2] / length];
}
