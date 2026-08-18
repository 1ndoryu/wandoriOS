/* GAME-01 — Heightmap por bloques (Minecraft) del Bosque.
 * Datos puros, sin THREE: genera alturas enteras deterministas con una isla
 * ovalada rodeada de océano y garantiza que ningún vecino difiera en más de
 * un bloque (caminabilidad). La forma usa una superelipse (esquinas
 * redondeadas) para que el rect jugable quede siempre en tierra y el océano
 * sea el límite visible. */

export const OCEAN_LEVEL = -1;
export const BEACH_LEVEL = 0;

export interface BlockHeightmap {
  readonly width: number;
  readonly depth: number;
  /** `levels[j * width + i]`: -1 océano, 0 playa, 1..maxLevel hierba. */
  readonly levels: Int8Array;
  readonly maxLevel: number;
}

export interface HeightmapCell {
  readonly i: number;
  readonly j: number;
  readonly level: number;
}

/* ---------------- ruido determinista ---------------- */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * (3 - 2 * t);

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = fade(xf), v = fade(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let f = 1, amp = 0.5, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * f, y * f, seed + i * 977) * amp;
    norm += amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* Umbral de costa: mask = 1 - d + warp; por debajo es océano. */
const COAST = 0.16;
/* Exponente de superelipse: 4 redondea las esquinas del rect. */
const ROUND_EXP = 4;

export function generateBlockHeightmap(
  seed: number,
  width: number,
  depth: number,
  maxLevel: number,
): BlockHeightmap {
  const levels = new Int8Array(width * depth).fill(OCEAN_LEVEL);
  const cx = (width - 1) / 2;
  const cz = (depth - 1) / 2;

  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const nx = (i - cx) / (width * 0.5);
      const nz = (j - cz) / (depth * 0.5);
      const d = Math.pow(
        Math.pow(Math.abs(nx), ROUND_EXP) + Math.pow(Math.abs(nz), ROUND_EXP),
        1 / ROUND_EXP,
      );
      const warp = (fbm(i * 0.18, j * 0.18, seed, 4) - 0.5) * 0.20;
      const mask = 1.0 - d + warp;
      if (mask < COAST) continue;

      /* 0 en la costa → 1 en el interior; la banda de playa queda al borde. */
      const coast = Math.min(1, (mask - COAST) / 0.22);
      const e = fbm(i * 0.17 + 40.2, j * 0.17 + 11.9, seed + 9137, 3);
      const e2 = fbm(i * 0.42 + 71.2, j * 0.42 + 47.9, seed + 5511, 2);
      const raw = (e - 0.34) * 5.6 + (e2 - 0.5) * 1.0;
      const h = Math.max(0, Math.min(maxLevel, Math.round(raw * coast)));
      levels[j * width + i] = h;
    }
  }

  relaxWalkability(levels, width, depth);
  trimLonelyTiles(levels, width, depth);
  return { width, depth, maxLevel, levels };
}

/** Ningún vecino difiere en más de un bloque: la isla queda transitable. */
function relaxWalkability(levels: Int8Array, width: number, depth: number): void {
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (let j = 0; j < depth; j += 1) {
      for (let i = 0; i < width; i += 1) {
        const id = j * width + i;
        const h = levels[id];
        if (h < 0) continue;
        let lowest = 99;
        for (const [di, dj] of NEIGHBORS) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= width || nj >= depth) continue;
          const nh = levels[nj * width + ni];
          if (nh < lowest) lowest = nh;
        }
        if (lowest < 99 && h > lowest + 1) {
          levels[id] = lowest + 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

/** Elimina islotes de 1-2 celdas aislados en el mar (ruido de costa). */
function trimLonelyTiles(levels: Int8Array, width: number, depth: number): void {
  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const id = j * width + i;
      if (levels[id] < 0) continue;
      let land = 0;
      for (const [di, dj] of NEIGHBORS) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= width || nj >= depth) continue;
        if (levels[nj * width + ni] >= 0) land += 1;
      }
      if (land <= 1) levels[id] = OCEAN_LEVEL;
    }
  }
}

export function levelAt(h: BlockHeightmap, i: number, j: number): number {
  if (i < 0 || j < 0 || i >= h.width || j >= h.depth) return OCEAN_LEVEL;
  return h.levels[j * h.width + i];
}

/* Centro de la celda `i` en unidades de mundo local (1 bloque = 1 unidad). */
export function cellCenterX(h: BlockHeightmap, i: number): number {
  return i - h.width / 2 + 0.5;
}

export function cellCenterZ(h: BlockHeightmap, j: number): number {
  return j - h.depth / 2 + 0.5;
}

/** Convierte un punto de mundo local en celda (o null fuera del grid). */
export function cellAt(h: BlockHeightmap, x: number, z: number): HeightmapCell | null {
  const i = Math.floor(x + h.width / 2);
  const j = Math.floor(z + h.depth / 2);
  if (i < 0 || j < 0 || i >= h.width || j >= h.depth) return null;
  return { i, j, level: h.levels[j * h.width + i] };
}
