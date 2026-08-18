/* GAME-01 — Toolkit procedural: lluvia determinista (138A-3).
 * Streaks verticales con distribución circular por raíz cuadrada, phase por
 * gota y longitudes acotadas. Datos puros: sin Three/DOM/red; el adaptador de
 * la capa app crea el LineSegments y el shader anima con uTime/uAnchor. */

import { hash2 } from './noise';

export const RAIN_MESH_DEFAULTS = {
  seed: 1337,
  length: 0.55,
  speed: 15,
} as const;

export const RAIN_MESH_MAX_STREAKS = 4096;

export interface RainStreakOptions {
  /** Número de gotas, 1..=4096. */
  readonly count: number;
  /** Radio del cilindro de lluvia en unidades de mundo (> 0). */
  readonly area: number;
  /** Longitud del ciclo vertical en unidades de mundo (> 0). */
  readonly span: number;
  /** Seed determinista de la distribución. */
  readonly seed?: number;
  /** Longitud de cada gota en unidades de mundo (> 0). */
  readonly length?: number;
  /** Velocidad de caída en unidades por segundo (> 0). */
  readonly speed?: number;
}

export interface RainStreakData {
  /** Pares de offsets por gota: (0,0,0) → (0,-length,0); 6 floats por gota. */
  readonly positions: Float32Array;
  /** Atributo por vértice: [cos(ángulo)*radio, phase, sin(ángulo)*radio]. */
  readonly random: Float32Array;
  readonly count: number;
  readonly area: number;
  readonly span: number;
  readonly length: number;
  readonly speed: number;
}

export function buildRainStreakData(options: RainStreakOptions): RainStreakData {
  const { count, area, span } = options;
  const seed = options.seed ?? RAIN_MESH_DEFAULTS.seed;
  const length = options.length ?? RAIN_MESH_DEFAULTS.length;
  const speed = options.speed ?? RAIN_MESH_DEFAULTS.speed;
  if (!Number.isSafeInteger(count) || count < 1 || count > RAIN_MESH_MAX_STREAKS) {
    throw new Error('cantidad de gotas fuera de rango');
  }
  if (
    !Number.isFinite(area) || area <= 0
    || !Number.isFinite(span) || span <= 0
    || !Number.isFinite(length) || length <= 0
    || !Number.isFinite(speed) || speed <= 0
  ) {
    throw new Error('parámetros de lluvia inválidos');
  }
  const positions = new Float32Array(count * 2 * 3);
  const random = new Float32Array(count * 2 * 3);
  for (let i = 0; i < count; i += 1) {
    const angle = hash2(i, 0, seed) * Math.PI * 2;
    const radius = Math.sqrt(hash2(i, 1, seed)) * area;
    const phase = hash2(i, 2, seed) * span;
    const cx = Math.cos(angle) * radius;
    const cz = Math.sin(angle) * radius;
    for (let k = 0; k < 2; k += 1) {
      const o = (i * 2 + k) * 3;
      positions[o] = 0;
      positions[o + 1] = k === 0 ? 0 : -length;
      positions[o + 2] = 0;
      random[o] = cx;
      random[o + 1] = phase;
      random[o + 2] = cz;
    }
  }
  return { positions, random, count, area, span, length, speed };
}
