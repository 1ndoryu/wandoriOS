/* 138A-4 — Contrato puro de opciones de terreno del Constructor de mundo.
 * El constructor convierte estas opciones en un MapVersion jugable (pipeline
 * en map-builder.ts) y el comparador las usa para probar estilos. Sin
 * Three/DOM/red: solo datos validados y presets de forma. */

import { MAP_VERSION_LIMITS } from '../map-version';

/** Forma de máscara del mundo (cómo se reparte tierra y agua). */
export type ShapePreset = 'isla' | 'continente' | 'archipielago' | 'valle';

/** Estilo de render del constructor (138A-6: solo bloques/suave; la isla
 *  curva queda como referencia histórica sin selector). */
export type RenderStyle = 'bloques' | 'suave';

export interface TerrainOptions {
  readonly seed: number;
  readonly shape: ShapePreset;
  readonly style: RenderStyle;
  /** Celdas de ancho/profundidad: múltiplos de 16 (chunkSize del contrato). */
  readonly width: number;
  readonly depth: number;
  readonly cellSize: number;
  readonly maxHeight: number;
  readonly waterLevel: number;
  readonly coast: number;
  readonly warp: number;
  readonly octaves: number;
  /** Multiplicador 0..1 de vegetación (césped/árboles/rocas del toolkit). */
  readonly vegetationDensity: number;
}

export const TERRAIN_OPTIONS_DEFAULTS: Readonly<Required<TerrainOptions>> = {
  seed: 1337,
  shape: 'isla',
  style: 'bloques',
  width: 48,
  depth: 32,
  cellSize: 1,
  maxHeight: 4,
  waterLevel: 0,
  coast: 0.16,
  warp: 0.2,
  octaves: 4,
  vegetationDensity: 1,
};

export const TERRAIN_OPTIONS_LIMITS = {
  minSeed: 0,
  maxSeed: 2_147_483_647,
  minDimension: 16,
  maxDimension: 256,
  minCellSize: 0.5,
  maxCellSize: 2,
  minMaxHeight: 0.5,
  maxMaxHeight: 32,
  minWaterLevel: -8,
  maxWaterLevel: 8,
  minCoast: 0.05,
  maxCoast: 0.49,
  minWarp: 0,
  maxWarp: 0.49,
  minOctaves: 1,
  maxOctaves: 8,
} as const;

export const SHAPE_PRESETS: readonly { readonly key: ShapePreset; readonly label: string }[] = [
  { key: 'isla', label: 'Isla' },
  { key: 'continente', label: 'Continente' },
  { key: 'archipielago', label: 'Archipiélago' },
  { key: 'valle', label: 'Valle' },
];

export const RENDER_STYLES: readonly { readonly key: RenderStyle; readonly label: string }[] = [
  { key: 'bloques', label: 'Bloques' },
  { key: 'suave', label: 'Suave' },
];

/** Opciones válidas por defecto para una forma dada (reutilizables como preset). */
export function terrainOptionsPreset(shape: ShapePreset): TerrainOptions {
  const base = { ...TERRAIN_OPTIONS_DEFAULTS };
  const seeds: Record<ShapePreset, number> = {
    isla: 1337,
    continente: 90210,
    archipielago: 4207,
    valle: 65537,
  };
  return { ...base, shape, seed: seeds[shape] };
}

/** Presets de mundo completos del constructor (Fase 5). */
export const WORLD_PRESETS: readonly { readonly key: string; readonly label: string; readonly options: TerrainOptions }[] = [
  { key: 'isla', label: 'Isla acogedora', options: terrainOptionsPreset('isla') },
  { key: 'continente', label: 'Continente verde', options: terrainOptionsPreset('continente') },
  { key: 'archipielago', label: 'Archipiélago', options: terrainOptionsPreset('archipielago') },
  { key: 'valle', label: 'Valle lacustre', options: terrainOptionsPreset('valle') },
];

/** Valida opciones con mensajes en español; devuelve lista vacía si son válidas. */
export function validateTerrainOptions(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['requiere un objeto de opciones'];
  }
  const options = value as Record<string, unknown>;
  const issues: string[] = [];
  const finite = (field: string): number | null => {
    const v = options[field];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      issues.push(`${field} debe ser un número finito`);
      return null;
    }
    return v;
  };
  const seed = finite('seed');
  if (seed !== null && (seed < TERRAIN_OPTIONS_LIMITS.minSeed || seed > TERRAIN_OPTIONS_LIMITS.maxSeed)) {
    issues.push('seed fuera de rango');
  }
  const width = finite('width');
  const depth = finite('depth');
  for (const field of ['width', 'depth'] as const) {
    const v = options[field];
    if (typeof v !== 'number' || !Number.isSafeInteger(v)) {
      issues.push(`${field} debe ser un entero`);
    }
  }
  if (width !== null && Number.isSafeInteger(width)
    && (width < TERRAIN_OPTIONS_LIMITS.minDimension || width > TERRAIN_OPTIONS_LIMITS.maxDimension
      || width % 16 !== 0)) {
    issues.push('width debe ser múltiplo de 16 y estar entre 16 y 256');
  }
  if (depth !== null && Number.isSafeInteger(depth)
    && (depth < TERRAIN_OPTIONS_LIMITS.minDimension || depth > TERRAIN_OPTIONS_LIMITS.maxDimension
      || depth % 16 !== 0)) {
    issues.push('depth debe ser múltiplo de 16 y estar entre 16 y 256');
  }
  if (width !== null && depth !== null && Number.isSafeInteger(width) && Number.isSafeInteger(depth)
    && (width / 16) * (depth / 16) > MAP_VERSION_LIMITS.maxChunks) {
    issues.push('el tamaño supera la cuota de chunks');
  }
  const cellSize = finite('cellSize');
  if (cellSize !== null
    && (cellSize < TERRAIN_OPTIONS_LIMITS.minCellSize || cellSize > TERRAIN_OPTIONS_LIMITS.maxCellSize)) {
    issues.push('cellSize fuera de rango');
  }
  const maxHeight = finite('maxHeight');
  if (maxHeight !== null
    && (maxHeight < TERRAIN_OPTIONS_LIMITS.minMaxHeight || maxHeight > TERRAIN_OPTIONS_LIMITS.maxMaxHeight)) {
    issues.push('maxHeight fuera de rango');
  }
  const waterLevel = finite('waterLevel');
  if (waterLevel !== null
    && (waterLevel < TERRAIN_OPTIONS_LIMITS.minWaterLevel || waterLevel > TERRAIN_OPTIONS_LIMITS.maxWaterLevel)) {
    issues.push('waterLevel fuera de rango');
  }
  const coast = finite('coast');
  if (coast !== null && (coast < TERRAIN_OPTIONS_LIMITS.minCoast || coast >= TERRAIN_OPTIONS_LIMITS.maxCoast)) {
    issues.push('coast fuera de rango');
  }
  const warp = finite('warp');
  if (warp !== null && (warp < TERRAIN_OPTIONS_LIMITS.minWarp || warp >= TERRAIN_OPTIONS_LIMITS.maxWarp)) {
    issues.push('warp fuera de rango');
  }
  const octaves = finite('octaves');
  if (octaves !== null
    && (!Number.isSafeInteger(octaves) || octaves < TERRAIN_OPTIONS_LIMITS.minOctaves
      || octaves > TERRAIN_OPTIONS_LIMITS.maxOctaves)) {
    issues.push('octaves fuera de rango');
  }
  const vegetationDensity = finite('vegetationDensity');
  if (vegetationDensity !== null && (vegetationDensity < 0 || vegetationDensity > 1)) {
    issues.push('vegetationDensity fuera de rango');
  }
  if (typeof options.shape !== 'string'
    || !SHAPE_PRESETS.some(preset => preset.key === options.shape)) {
    issues.push('shape no permitido');
  }
  if (typeof options.style !== 'string'
    || !RENDER_STYLES.some(style => style.key === options.style)) {
    issues.push('style no permitido');
  }
  return issues;
}

/** Normaliza opciones parciales a un objeto completo válido (fail-closed). */
export function normalizeTerrainOptions(value: unknown): TerrainOptions {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('opciones de terreno inválidas');
  }
  const partial = value as Partial<TerrainOptions>;
  const options: TerrainOptions = {
    seed: partial.seed ?? TERRAIN_OPTIONS_DEFAULTS.seed,
    shape: partial.shape ?? TERRAIN_OPTIONS_DEFAULTS.shape,
    style: partial.style ?? TERRAIN_OPTIONS_DEFAULTS.style,
    width: partial.width ?? TERRAIN_OPTIONS_DEFAULTS.width,
    depth: partial.depth ?? TERRAIN_OPTIONS_DEFAULTS.depth,
    cellSize: partial.cellSize ?? TERRAIN_OPTIONS_DEFAULTS.cellSize,
    maxHeight: partial.maxHeight ?? TERRAIN_OPTIONS_DEFAULTS.maxHeight,
    waterLevel: partial.waterLevel ?? TERRAIN_OPTIONS_DEFAULTS.waterLevel,
    coast: partial.coast ?? TERRAIN_OPTIONS_DEFAULTS.coast,
    warp: partial.warp ?? TERRAIN_OPTIONS_DEFAULTS.warp,
    octaves: partial.octaves ?? TERRAIN_OPTIONS_DEFAULTS.octaves,
    vegetationDensity: partial.vegetationDensity ?? TERRAIN_OPTIONS_DEFAULTS.vegetationDensity,
  };
  const issues = validateTerrainOptions(options);
  if (issues.length > 0) throw new Error(`opciones de terreno inválidas: ${issues.join('; ')}`);
  return options;
}
