/* GAME-01 — Heightfield del toolkit procedural (138A-1/138A-4).
 * Generadores de altura continua (máscara de forma + fbm + warp + banda
 * costera) de los que se derivan AMBOS estilos del comparador: 'suave' usa la
 * altura tal cual y 'bloques' la cuantiza con relajación de caminabilidad.
 * 138A-4 añade `generateTerrainHeightfield` con presets de forma
 * (isla/continente/archipiélago/valle) sin romper la API de la isla clásica.
 * Misma familia matemática que el experimento 128A-1 para que el comparador
 * compare estilos, no formas. Datos puros, sin Three/DOM/red. */

import { fbm2 } from './noise';
import {
  normalizeTerrainOptions,
  type ShapePreset,
  type TerrainOptions,
} from './terrain-options';

export const ISLAND_HEIGHTFIELD_DEFAULTS = {
  maxHeight: 4,
  waterLevel: 0,
  coast: 0.16,
  warp: 0.2,
  octaves: 4,
} as const;

export interface IslandHeightfieldOptions {
  readonly seed: number;
  readonly width: number;
  readonly depth: number;
  readonly maxHeight?: number;
  readonly waterLevel?: number;
  /** Amplitud pico del warp costero (el fbm se desplaza ±warp/2). */
  readonly coast?: number;
  readonly warp?: number;
  readonly octaves?: number;
}

export interface IslandHeightfield {
  readonly width: number;
  readonly depth: number;
  /** Altura por celda `j * width + i` en unidades de mundo (agua = waterLevel). */
  readonly heights: Float32Array;
  readonly waterLevel: number;
  readonly maxHeight: number;
}

/* Exponente de superelipse: 4 redondea las esquinas del rect jugable. */
const ROUND_EXP = 4;
/* Banda de transición costa → interior (misma escala que el experimento). */
const COAST_BAND = 0.22;
/* Divisor del relieve crudo: normaliza picos a 1 sin aplanar el interior. */
const RELIEF_SCALE = 3.2;
/* Fracción de altura mínima del interior: evita que la isla quede plana. */
const LAND_FLOOR = 0.22;
/* Profundidad de fondo marino en el borde de la rejilla. */
const SEAFLOOR_DROP = 1.4;

export function generateIslandHeightfield(options: IslandHeightfieldOptions): IslandHeightfield {
  const { seed, width, depth } = options;
  const maxHeight = options.maxHeight ?? ISLAND_HEIGHTFIELD_DEFAULTS.maxHeight;
  const waterLevel = options.waterLevel ?? ISLAND_HEIGHTFIELD_DEFAULTS.waterLevel;
  const coast = options.coast ?? ISLAND_HEIGHTFIELD_DEFAULTS.coast;
  const warp = options.warp ?? ISLAND_HEIGHTFIELD_DEFAULTS.warp;
  const octaves = options.octaves ?? ISLAND_HEIGHTFIELD_DEFAULTS.octaves;
  if (!Number.isSafeInteger(width) || width < 2 || !Number.isSafeInteger(depth) || depth < 2) {
    throw new Error('dimensiones de heightfield inválidas');
  }
  if (!Number.isFinite(maxHeight) || maxHeight <= 0) throw new Error('maxHeight inválido');
  if (!Number.isFinite(coast) || coast <= 0 || coast >= 0.5) throw new Error('coast inválido');
  /* El desvío pico del fbm es warp/2: debe quedar bajo el umbral de costa para
   * que las esquinas de la rejilla sean siempre océano (isla rodeada de agua). */
  if (!Number.isFinite(warp) || warp < 0 || warp >= coast * 2) throw new Error('warp inválido');
  return generateHeightfieldCore({
    seed,
    width,
    depth,
    maxHeight,
    waterLevel,
    coast,
    warp,
    octaves,
    shape: 'isla',
  });
}

/** Genera el heightfield parametrizado del constructor de mundo (138A-4).
 * Acepta opciones completas (forma, estilo, tamaño, densidad de vegetación)
 * y valida fail-closed antes de calcular; `generateIslandHeightfield` queda
 * como caso particular con la API histórica. */
export function generateTerrainHeightfield(options: TerrainOptions): IslandHeightfield {
  const normalized = normalizeTerrainOptions(options);
  return generateHeightfieldCore({
    seed: normalized.seed,
    width: normalized.width,
    depth: normalized.depth,
    maxHeight: normalized.maxHeight,
    waterLevel: normalized.waterLevel,
    coast: normalized.coast,
    warp: normalized.warp,
    octaves: normalized.octaves,
    shape: normalized.shape,
  });
}

interface HeightfieldCoreOptions {
  readonly seed: number;
  readonly width: number;
  readonly depth: number;
  readonly maxHeight: number;
  readonly waterLevel: number;
  readonly coast: number;
  readonly warp: number;
  readonly octaves: number;
  readonly shape: ShapePreset;
}

function generateHeightfieldCore(options: HeightfieldCoreOptions): IslandHeightfield {
  const { seed, width, depth, maxHeight, waterLevel, coast, warp, octaves, shape } = options;
  const heights = new Float32Array(width * depth);
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
      const mask = shapeMask(shape, d, i, j, seed, octaves, warp);
      let h: number;
      if (mask < coast) {
        /* Fondo marino: se hunde suavemente hacia los bordes, siempre bajo el agua. */
        h = waterLevel - 0.25 - (coast - mask) * SEAFLOOR_DROP;
      } else {
        /* 0 en la costa → 1 en el interior; la banda costera queda de playa. */
        const land = Math.min(1, (mask - coast) / COAST_BAND);
        const e = fbm2(i * 0.17 + 40.2, j * 0.17 + 11.9, seed + 9137, 3);
        const e2 = fbm2(i * 0.42 + 71.2, j * 0.42 + 47.9, seed + 5511, 2);
        const raw = Math.max(0, (e - 0.34) * 5.6 + (e2 - 0.5) * 1.0);
        const n = Math.min(1, raw / RELIEF_SCALE);
        /* El continente mantiene un interior elevado aunque el ruido dé cero:
         * su centro nunca queda pegado al nivel del mar. */
        const floor = shape === 'continente' ? 0.5 : LAND_FLOOR;
        h = waterLevel + land * (floor + (1 - floor) * n) * maxHeight;
      }
      heights[j * width + i] = h;
    }
  }
  return { width, depth, heights, waterLevel, maxHeight };
}

/** Máscara de forma normalizada: 0..1 es la transición costa→interior y los
 * valores negativos caen al fondo marino. `isla` reproduce EXACTAMENTE la
 * fórmula histórica (1 - d + warp) para no romper comparadores ni tests. */
function shapeMask(
  shape: ShapePreset,
  d: number,
  i: number,
  j: number,
  seed: number,
  octaves: number,
  warp: number,
): number {
  const warpV = (fbm2(i * 0.18, j * 0.18, seed, octaves) - 0.5) * warp;
  switch (shape) {
    case 'isla':
      return 1 - d + warpV;
    /* Continente: masa grande con costa irregular; las esquinas alternan
     * océano según el seed (la pendiente deja un margen bajo el umbral de
     * costa incluso con el warp máximo), el interior queda siempre en tierra. */
    case 'continente':
      return 1 - 0.9 * d + warpV;
    /* Archipiélago: ruido de baja frecuencia reparte islas y canales; las
     * esquinas de la rejilla son siempre océano (d alto). */
    case 'archipielago': {
      const clusters = (fbm2(i * 0.06, j * 0.06, seed + 777, 3) - 0.5) * 1.1;
      return 1 - 1.35 * d + clusters + warpV * 0.8;
    }
    /* Valle: anillo montañoso en los bordes con una hondonada central que
     * queda bajo el agua (lago); las esquinas son tierra alta. */
    case 'valle':
      return 1 - 0.45 * d - 1.1 * Math.exp(-((d * 3.2) ** 2)) + warpV * 0.8;
  }
}

/**
 * Cuantiza el heightfield a niveles de bloque: -1 océano, 0 playa, 1..maxLevel
 * hierba. Es la misma base continua → ambos estilos comparten forma y seed.
 */
export function quantizeBlockLevels(h: IslandHeightfield, maxLevel: number): Int8Array {
  if (!Number.isSafeInteger(maxLevel) || maxLevel < 1 || maxLevel > 16) {
    throw new Error('maxLevel fuera de rango');
  }
  const levels = new Int8Array(h.width * h.depth);
  for (let k = 0; k < h.width * h.depth; k += 1) {
    const y = h.heights[k];
    if (y < h.waterLevel) {
      levels[k] = -1;
    } else {
      const t = Math.min(1, Math.max(0, (y - h.waterLevel) / h.maxHeight));
      levels[k] = Math.min(maxLevel, Math.round(t * maxLevel));
    }
  }
  return levels;
}

const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Ningún vecino difiere en más de un bloque: la isla queda transitable. */
export function relaxBlockWalkability(
  levels: Int8Array,
  width: number,
  depth: number,
  passes = 8,
): void {
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false;
    for (let j = 0; j < depth; j += 1) {
      for (let i = 0; i < width; i += 1) {
        const id = j * width + i;
        const h = levels[id];
        if (h < 0) continue;
        let lowest = 99;
        for (const [di, dj] of NEIGHBORS) {
          const ni = i + di;
          const nj = j + dj;
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
export function trimLonelyIslands(levels: Int8Array, width: number, depth: number): void {
  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const id = j * width + i;
      if (levels[id] < 0) continue;
      let land = 0;
      for (const [di, dj] of NEIGHBORS) {
        const ni = i + di;
        const nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= width || nj >= depth) continue;
        if (levels[nj * width + ni] >= 0) land += 1;
      }
      if (land <= 1) levels[id] = -1;
    }
  }
}
