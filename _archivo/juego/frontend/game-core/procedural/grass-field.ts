/* 138A-10 — Campo de césped procedural por chunks (adaptación de
 * GrassSystemThreeJS orientada a rendimiento). El generador es un pipeline
 * puro que divide el grid en chunks de `chunkSize` celdas y produce, por
 * chunk, una lista de briznas instanciadas (coordenadas de CELDA con jitter;
 * la presentación multiplica por cellSize). Sin Three/DOM/red: el comparador
 * sube cada chunk como un único InstancedMesh y solo regenera la zona
 * afectada al pintar (chunkFilter). Presupuestos fail-closed: ≤1024 chunks,
 * ≤10000 briznas y teardown total en dispose (sin geometrías por brizna). */

import { hash2 } from './noise';
import type { IslandHeightfield } from './heightmap';
import { TERRAIN_SURFACE_IDS } from '../terrain-layers';

export const GRASS_FIELD_DEFAULTS = {
  enabled: true,
  density: 1,
  size: 1,
  color: 0x86c65c,
} as const;

export const GRASS_FIELD_LIMITS = {
  maxChunks: 1024,
  maxInstances: 10_000,
  chunkSize: 16,
  minSize: 0.25,
  maxSize: 4,
} as const;

export interface GrassFieldOptions {
  readonly enabled?: boolean;
  /** Fracción 0..1 de briznas por celda (1 = patrón completo). */
  readonly density?: number;
  /** Escala relativa de cada mata (0.25..4; la presentación la multiplica
   *  por cellSize). */
  readonly size?: number;
  /** Color hex (0xRRGGBB) de las briznas; independiente de la paleta. */
  readonly color?: number;
}

/** Opciones ya normalizadas: todos los campos presentes y válidos. */
export interface NormalizedGrassFieldOptions {
  readonly enabled: boolean;
  readonly density: number;
  readonly size: number;
  readonly color: number;
}

export interface GrassFieldBudgets {
  readonly maxChunks?: number;
  readonly maxInstances?: number;
  readonly chunkSize?: number;
}

/** Brizna en coordenadas de CELDA: x/z son centros de celda + jitter y la
 *  presentación las multiplica por cellSize; y es la altura del terreno. */
export interface GrassBladeInstance {
  readonly x: number;
  readonly z: number;
  readonly y: number;
  /** Seed de la mata (forma determinista). */
  readonly seed: number;
  /** Escala de la mata en unidades de celda (antes de cellSize). */
  readonly scale: number;
}

export interface GrassChunkField {
  readonly cx: number;
  readonly cz: number;
  readonly blades: readonly GrassBladeInstance[];
}

export interface GrassFieldResult {
  readonly chunks: readonly GrassChunkField[];
  readonly bladeCount: number;
  readonly chunkCount: number;
  /** Celdas con override de la máscara de vegetación (add/remove). */
  readonly overriddenCells: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Valida opciones de césped; devuelve mensajes en español (vacío = válida). */
export function validateGrassFieldOptions(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['requiere un objeto de opciones'];
  const issues: string[] = [];
  const allowed = ['enabled', 'density', 'size', 'color'];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`campo no permitido: ${key}`);
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    issues.push('enabled debe ser booleano');
  }
  if (value.density !== undefined
    && (!finite(value.density) || value.density < 0 || value.density > 1)) {
    issues.push('density fuera de rango');
  }
  if (value.size !== undefined
    && (!finite(value.size)
      || value.size < GRASS_FIELD_LIMITS.minSize || value.size > GRASS_FIELD_LIMITS.maxSize)) {
    issues.push('size fuera de rango');
  }
  if (value.color !== undefined
    && (!finite(value.color) || value.color < 0 || value.color > 0xffffff)) {
    issues.push('color fuera de rango');
  }
  return issues;
}

/** Normaliza opciones de césped (fail-closed: lanza ante cualquier valor
 *  inválido; los campos ausentes —y un valor ausente— caen a los defaults). */
export function normalizeGrassFieldOptions(value: unknown): NormalizedGrassFieldOptions {
  if (value === undefined || value === null) return { ...GRASS_FIELD_DEFAULTS };
  const issues = validateGrassFieldOptions(value);
  if (issues.length > 0) throw new Error(`opciones de pasto inválidas: ${issues.join('; ')}`);
  const record = value as Record<string, unknown>;
  return {
    enabled: record.enabled === undefined ? GRASS_FIELD_DEFAULTS.enabled : record.enabled as boolean,
    density: record.density === undefined ? GRASS_FIELD_DEFAULTS.density : record.density as number,
    size: record.size === undefined ? GRASS_FIELD_DEFAULTS.size : record.size as number,
    color: record.color === undefined ? GRASS_FIELD_DEFAULTS.color : record.color as number,
  };
}

export function grassChunkKey(cx: number, cz: number): string {
  return `${cx}:${cz}`;
}

export function grassCellChunk(i: number, j: number, chunkSize: number = GRASS_FIELD_LIMITS.chunkSize): {
  readonly cx: number;
  readonly cz: number;
} {
  return {
    cx: Math.floor(i / chunkSize),
    cz: Math.floor(j / chunkSize),
  };
}

/** Chunks afectados por una lista de celdas pintadas (regeneración de zona). */
export function affectedChunksForCells(
  cells: readonly (readonly [number, number])[],
  chunkSize: number = GRASS_FIELD_LIMITS.chunkSize,
): readonly string[] {
  const keys = new Set<string>();
  for (const [i, j] of cells) {
    if (!Number.isSafeInteger(i) || !Number.isSafeInteger(j)) continue;
    const { cx, cz } = grassCellChunk(i, j, chunkSize);
    keys.add(grassChunkKey(cx, cz));
  }
  return [...keys].sort();
}

/** Genera el campo de césped: una lista de briznas por chunk sobre tierra
 *  (y >= waterLevel) donde la superficie es hierba o la máscara fuerza pasto
 *  (mask == 1), y nunca donde la máscara lo prohíbe (mask == -1). */
export function buildGrassField(
  heightfield: IslandHeightfield,
  surfaces: Uint8Array | undefined,
  vegetationMask: Int8Array | undefined,
  seed: number,
  options: GrassFieldOptions = {},
  budgets: GrassFieldBudgets = {},
  chunkFilter?: ReadonlySet<string>,
): GrassFieldResult {
  const normalized = normalizeGrassFieldOptions(options);
  const maxChunks = budgets.maxChunks ?? GRASS_FIELD_LIMITS.maxChunks;
  const maxInstances = budgets.maxInstances ?? GRASS_FIELD_LIMITS.maxInstances;
  const chunkSize = budgets.chunkSize ?? GRASS_FIELD_LIMITS.chunkSize;
  if (!Number.isSafeInteger(maxChunks) || maxChunks <= 0) throw new Error('maxChunks inválido');
  if (!Number.isSafeInteger(maxInstances) || maxInstances <= 0) throw new Error('maxInstances inválido');
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) throw new Error('chunkSize inválido');
  const { width, depth, heights, waterLevel } = heightfield;
  if (surfaces !== undefined && surfaces.length !== width * depth) {
    throw new Error('superficies incompletas');
  }
  if (vegetationMask !== undefined && vegetationMask.length !== width * depth) {
    throw new Error('máscara de vegetación incompleta');
  }
  if (!normalized.enabled) return { chunks: [], bladeCount: 0, chunkCount: 0, overriddenCells: 0 };
  if (width * depth > maxChunks * chunkSize * chunkSize) {
    throw new Error('el grid supera la cuota de chunks');
  }

  const byChunk = new Map<string, { readonly cx: number; readonly cz: number; blades: GrassBladeInstance[] }>();
  let bladeCount = 0;
  let overriddenCells = 0;

  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const id = j * width + i;
      const y = heights[id];
      if (y < waterLevel) continue;
      const mask = vegetationMask === undefined ? 0 : vegetationMask[id];
      if (mask === -1) continue;
      if (mask === 0 && surfaces !== undefined && surfaces[id] !== TERRAIN_SURFACE_IDS.grass) continue;

      const { cx, cz } = grassCellChunk(i, j, chunkSize);
      const key = grassChunkKey(cx, cz);
      if (chunkFilter !== undefined && !chunkFilter.has(key)) continue;

      /* Briznas por celda deterministas: 0..4 según densidad. */
      const blades = Math.round(hash2(i, j, seed + 31) * 4 * normalized.density);
      if (blades <= 0) continue;
      if (bladeCount + blades > maxInstances) continue;

      let chunk = byChunk.get(key);
      if (!chunk) {
        if (byChunk.size >= maxChunks) continue;
        chunk = { cx, cz, blades: [] };
        byChunk.set(key, chunk);
      }
      const baseX = i - width / 2 + 0.5;
      const baseZ = j - depth / 2 + 0.5;
      const bladeSeed = hash2(i, j, seed + 7);
      const scale = normalized.size * (0.8 + hash2(i, j, seed + 3) * 0.45);
      for (let b = 0; b < blades; b += 1) {
        chunk.blades.push({
          x: baseX + (hash2(i, j, seed + 1 + b * 17) - 0.5) * 0.45,
          z: baseZ + (hash2(i, j, seed + 2 + b * 23) - 0.5) * 0.45,
          y,
          seed: bladeSeed + b * 97,
          scale,
        });
      }
      bladeCount += blades;
    }
  }
  if (vegetationMask !== undefined) {
    for (let k = 0; k < vegetationMask.length; k += 1) {
      if (vegetationMask[k] !== 0 && heights[k] >= waterLevel) overriddenCells += 1;
    }
  }
  const chunks = [...byChunk.values()]
    .sort((a, b) => (a.cz - b.cz) || (a.cx - b.cx))
    .map(chunk => ({ cx: chunk.cx, cz: chunk.cz, blades: chunk.blades }));
  return {
    chunks,
    bladeCount,
    chunkCount: chunks.length,
    overriddenCells,
  };
}
