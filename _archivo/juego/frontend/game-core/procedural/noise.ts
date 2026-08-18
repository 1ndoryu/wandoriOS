/* GAME-01 — Ruido determinista del toolkit procedural (138A-1).
 * Patrón adoptado del spike de motores open source (FastNoiseLite/Godot) y
 * del experimento 128A-1: hash entero + ruido de valor con fade suave + fbm
 * por octavas con seed derivado. Datos puros: no importa Three/DOM/red y el
 * resultado es idéntico entre ejecuciones y navegadores (solo aritmética
 * entera e IEEE-754, sin Math.random). */

/** Hash 2D determinista en [0, 1). x/y/seed se truncan a entero de 32 bits. */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

/** Ruido de valor interpolado suavemente en [0, 1). */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf);
  const v = fade(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** fbm normalizado en [0, 1]: suma de octavas con amplitud 2^-i y seed por octava. */
export function fbm2(x: number, y: number, seed: number, octaves: number): number {
  if (!Number.isSafeInteger(octaves) || octaves < 1 || octaves > 8) {
    throw new Error('octaves fuera de rango');
  }
  let f = 1;
  let amp = 0.5;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * f, y * f, seed + i * 977) * amp;
    norm += amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}
