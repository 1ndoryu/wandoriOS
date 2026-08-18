/* 138A-9 — Editor de mapa por estilos con capas (lección del artefacto
 * Contour Terrain Editor). Las modificaciones del terreno son un STACK de
 * capas puras y serializables evaluadas de abajo arriba ("later layers win"),
 * nunca mutaciones destructivas del heightfield. Cada capa pregunta a cada
 * celda "¿a qué distancia estoy de la forma?" (SDF), convierte esa distancia
 * en un peso con falloff (curva elegible y bias) y mezcla contenido con
 * blend set/add/max/min; las capas de superficie (camino/arena/agua) pintan
 * ids de superficie y las de elevación suben/bajan el terreno, con taper
 * opcional en curvas (ríos que bajan y se ensanchan). Sin Three/DOM/red:
 * el mismo stack alimenta preview (comparador) y documento (MapVersion). */

import type { IslandHeightfield } from './procedural/heightmap';

export const TERRAIN_LAYER_LIMITS = {
  maxLayers: 32,
  maxShapePoints: 64,
  maxPaintedCells: 16_384,
  minRadius: 0.25,
  maxRadius: 512,
  minHalfWidth: 0.25,
  maxHalfWidth: 64,
  minFalloffRadius: 0.25,
  maxFalloffRadius: 256,
  minBias: 0.02,
  maxBias: 1,
  minStrength: 0.05,
  maxStrength: 16,
  minHeight: -64,
  maxHeight: 64,
  maxIdLength: 64,
} as const;

/** Contenido de una capa de terreno. */
export type TerrainLayerKind = 'path' | 'sand' | 'water' | 'vegetation' | 'elevation';

/** Curvas de decaimiento del peso del pincel con la distancia (SDF). */
export type FalloffKind = 'linear' | 'smooth' | 'gauss' | 'dome' | 'spike' | 'hard';

/** Cómo mezcla la capa su altura con la base. */
export type LayerBlend = 'set' | 'add' | 'max' | 'min';

/** Elevación absoluta (una altura concreta) o delta (subir/bajar relativo). */
export type ElevationMode = 'absolute' | 'delta';

/** Forma/alcance de la capa. Las coordenadas de mundo son unidades de mundo
 *  (mismo frame que las instancias del MapVersion: ±w/2·cellSize). */
export type TerrainLayerShape =
  | { readonly kind: 'circle'; readonly cx: number; readonly cz: number; readonly radius: number }
  | { readonly kind: 'curve'; readonly points: readonly (readonly [number, number])[]; readonly halfWidth: number }
  | { readonly kind: 'polygon'; readonly points: readonly (readonly [number, number])[] }
  | { readonly kind: 'painted'; readonly cells: readonly (readonly [number, number])[] };

/** Taper: interpola radio/ancho y altura a lo largo de una curva (ríos). */
export interface TerrainLayerTaper {
  readonly enabled: boolean;
  /** Fracción 0..1 del ancho/radio inicial respecto del nominal. */
  readonly widthStart: number;
  /** Fracción 0..1 del ancho/radio final respecto del nominal. */
  readonly widthEnd: number;
  /** Fracción 0..1 del delta de altura inicial respecto del nominal. */
  readonly heightStart: number;
  /** Fracción 0..1 del delta de altura final respecto del nominal. */
  readonly heightEnd: number;
}

export type TerrainLayer =
  | {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly kind: 'path' | 'sand';
    readonly shape: TerrainLayerShape;
    readonly falloff: FalloffKind;
    readonly falloffRadius: number;
    readonly bias: number;
    readonly blend: LayerBlend;
    /** Umbral 0..1 del peso para pintar la superficie. */
    readonly hardness: number;
    readonly taper?: TerrainLayerTaper;
  }
  | {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly kind: 'water';
    readonly shape: TerrainLayerShape;
    readonly falloff: FalloffKind;
    readonly falloffRadius: number;
    readonly bias: number;
    readonly blend: LayerBlend;
    readonly hardness: number;
    /** Baja el terreno bajo el nivel del agua al pintar (charcos). */
    readonly lowerToWater: boolean;
    readonly taper?: TerrainLayerTaper;
  }
  | {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly kind: 'vegetation';
    readonly shape: TerrainLayerShape;
    readonly falloff: FalloffKind;
    readonly falloffRadius: number;
    readonly bias: number;
    readonly blend: LayerBlend;
    /** Umbral 0..1 del peso para pintar la máscara de vegetación. */
    readonly hardness: number;
    /** add = forzar pasto donde pinta; remove = prohibirlo (later wins). */
    readonly mode: 'add' | 'remove';
    readonly taper?: TerrainLayerTaper;
  }
  | {
    readonly id: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly kind: 'elevation';
    readonly shape: TerrainLayerShape;
    readonly falloff: FalloffKind;
    readonly falloffRadius: number;
    readonly bias: number;
    readonly blend: LayerBlend;
    readonly height: number;
    readonly elevationMode: ElevationMode;
    readonly taper?: TerrainLayerTaper;
  };

/** Ids de superficie permitidos (0..15 del contrato MapVersion). */
export const TERRAIN_SURFACE_IDS = {
  grass: 0,
  water: 1,
  sand: 2,
  path: 3,
} as const;

/** Resultado de aplicar el stack sobre un heightfield. */
export interface TerrainLayerStackResult {
  /** Alturas editadas (copia; la base no se muta). */
  readonly heights: Float32Array;
  /** Superficies por celda (0..15) tras las capas. */
  readonly surfaces: Uint8Array;
  /** Máscara de vegetación por celda: 0 = sin override, 1 = forzar pasto,
   *  -1 = prohibir pasto (later layers win). Solo la leen los generadores
   *  de césped; el documento MapVersion no la serializa. */
  readonly vegetationMask: Int8Array;
  /** Celdas afectadas por al menos una capa habilitada. */
  readonly affectedCells: number;
}

const FALLOFFS: readonly FalloffKind[] = ['linear', 'smooth', 'gauss', 'dome', 'spike', 'hard'];
const KINDS: readonly TerrainLayerKind[] = ['path', 'sand', 'water', 'vegetation', 'elevation'];
const BLENDS: readonly LayerBlend[] = ['set', 'add', 'max', 'min'];
const ELEVATION_MODES: readonly ElevationMode[] = ['absolute', 'delta'];
const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validLayerId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
    && value.length <= TERRAIN_LAYER_LIMITS.maxIdLength && !RESERVED_IDS.has(value);
}

function within(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/** Valida una capa; devuelve mensajes en español (vacío = válida). */
export function validateTerrainLayer(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['requiere un objeto de capa'];
  const issues: string[] = [];
  const allowed = ['id', 'name', 'enabled', 'kind', 'shape', 'falloff', 'falloffRadius', 'bias', 'blend', 'hardness', 'mode', 'lowerToWater', 'height', 'elevationMode', 'taper'];
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(`campo no permitido: ${key}`);
  }
  if (!validLayerId(value.id)) issues.push('id inválido');
  if (typeof value.name !== 'string' || value.name.trim().length === 0
    || value.name.length > TERRAIN_LAYER_LIMITS.maxIdLength) {
    issues.push('nombre inválido');
  }
  if (typeof value.enabled !== 'boolean') issues.push('enabled debe ser booleano');
  if (typeof value.kind !== 'string' || !KINDS.includes(value.kind as TerrainLayerKind)) {
    issues.push('kind no permitido');
  }
  if (typeof value.falloff !== 'string' || !FALLOFFS.includes(value.falloff as FalloffKind)) {
    issues.push('falloff no permitido');
  }
  if (!finite(value.falloffRadius)
    || !within(value.falloffRadius, TERRAIN_LAYER_LIMITS.minFalloffRadius, TERRAIN_LAYER_LIMITS.maxFalloffRadius)) {
    issues.push('falloffRadius fuera de rango');
  }
  if (!finite(value.bias) || !within(value.bias, TERRAIN_LAYER_LIMITS.minBias, TERRAIN_LAYER_LIMITS.maxBias)) {
    issues.push('bias fuera de rango');
  }
  if (typeof value.blend !== 'string' || !BLENDS.includes(value.blend as LayerBlend)) {
    issues.push('blend no permitido');
  }
  if (!isRecord(value.shape)) {
    issues.push('shape inválida');
  } else {
    issues.push(...validateShape(value.shape));
  }
  const kind = value.kind as TerrainLayerKind;
  if (kind === 'path' || kind === 'sand' || kind === 'water' || kind === 'vegetation') {
    if (!finite(value.hardness) || !within(value.hardness, 0, 1)) {
      issues.push('hardness fuera de rango');
    }
    if (kind === 'water' && typeof value.lowerToWater !== 'boolean') {
      issues.push('lowerToWater debe ser booleano');
    }
    if (kind === 'vegetation' && value.mode !== 'add' && value.mode !== 'remove') {
      issues.push('mode debe ser add o remove');
    }
  } else if (kind === 'elevation') {
    if (!finite(value.height) || !within(value.height, TERRAIN_LAYER_LIMITS.minHeight, TERRAIN_LAYER_LIMITS.maxHeight)) {
      issues.push('height fuera de rango');
    }
    if (typeof value.elevationMode !== 'string'
      || !ELEVATION_MODES.includes(value.elevationMode as ElevationMode)) {
      issues.push('elevationMode no permitido');
    }
  }
  if (value.taper !== undefined) {
    if (!isRecord(value.taper)) {
      issues.push('taper inválido');
    } else {
      for (const key of Object.keys(value.taper)) {
        if (!['enabled', 'widthStart', 'widthEnd', 'heightStart', 'heightEnd'].includes(key)) {
          issues.push(`taper: campo no permitido: ${key}`);
        }
      }
      const taper = value.taper;
      if (typeof taper.enabled !== 'boolean') issues.push('taper.enabled debe ser booleano');
      for (const field of ['widthStart', 'widthEnd', 'heightStart', 'heightEnd'] as const) {
        if (!finite(taper[field]) || !within(taper[field], 0, 1)) {
          issues.push(`taper.${field} fuera de rango`);
        }
      }
    }
  }
  return issues;
}

function validateShape(shape: Record<string, unknown>): readonly string[] {
  const issues: string[] = [];
  if (typeof shape.kind !== 'string') {
    return ['shape.kind inválido'];
  }
  if (shape.kind === 'circle') {
    for (const key of Object.keys(shape)) {
      if (!['kind', 'cx', 'cz', 'radius'].includes(key)) issues.push(`shape: campo no permitido: ${key}`);
    }
    if (!finite(shape.cx) || !finite(shape.cz)) issues.push('centro de círculo inválido');
    if (!finite(shape.radius)
      || !within(shape.radius, TERRAIN_LAYER_LIMITS.minRadius, TERRAIN_LAYER_LIMITS.maxRadius)) {
      issues.push('radio fuera de rango');
    }
  } else if (shape.kind === 'curve' || shape.kind === 'polygon') {
    const pointKeys = ['kind', 'points'];
    if (shape.kind === 'curve') pointKeys.push('halfWidth');
    for (const key of Object.keys(shape)) {
      if (!pointKeys.includes(key)) issues.push(`shape: campo no permitido: ${key}`);
    }
    const points = shape.points;
    if (!Array.isArray(points)) {
      issues.push('points debe ser una lista');
    } else if (points.length < 2 || points.length > TERRAIN_LAYER_LIMITS.maxShapePoints) {
      issues.push('points fuera de rango (2..64)');
    } else {
      points.forEach((point, index) => {
        if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1])) {
          issues.push(`points[${index}] inválido`);
        }
      });
    }
    if (shape.kind === 'curve' && (!finite(shape.halfWidth)
      || !within(shape.halfWidth, TERRAIN_LAYER_LIMITS.minHalfWidth, TERRAIN_LAYER_LIMITS.maxHalfWidth))) {
      issues.push('halfWidth fuera de rango');
    }
  } else if (shape.kind === 'painted') {
    for (const key of Object.keys(shape)) {
      if (!['kind', 'cells'].includes(key)) issues.push(`shape: campo no permitido: ${key}`);
    }
    const cells = shape.cells;
    if (!Array.isArray(cells)) {
      issues.push('cells debe ser una lista');
    } else if (cells.length > TERRAIN_LAYER_LIMITS.maxPaintedCells) {
      issues.push('cells supera la cuota de celdas pintadas');
    } else {
      const seen = new Set<string>();
      cells.forEach((cell, index) => {
        if (!Array.isArray(cell) || cell.length !== 2
          || !Number.isSafeInteger(cell[0]) || !Number.isSafeInteger(cell[1])) {
          issues.push(`cells[${index}] inválido`);
          return;
        }
        const key = `${cell[0]}:${cell[1]}`;
        if (seen.has(key)) issues.push(`cells[${index}] duplicado`);
        seen.add(key);
      });
    }
  } else {
    issues.push('shape.kind no permitido');
  }
  return issues;
}

/** Valida un stack completo (orden = orden de aplicación, later wins). */
export function validateTerrainLayerStack(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return ['requiere una lista de capas'];
  if (value.length > TERRAIN_LAYER_LIMITS.maxLayers) {
    return ['supera la cuota de capas'];
  }
  const issues: string[] = [];
  const ids = new Set<string>();
  value.forEach((layer, index) => {
    const layerIssues = validateTerrainLayer(layer);
    if (layerIssues.length > 0) {
      issues.push(`capa[${index}]: ${layerIssues.join('; ')}`);
      return;
    }
    const id = (layer as TerrainLayer).id;
    if (ids.has(id)) issues.push(`capa[${index}]: id duplicado ${id}`);
    ids.add(id);
  });
  return issues;
}

/** Normaliza un stack (fail-closed: lanza ante cualquier capa inválida). */
export function normalizeTerrainLayerStack(value: unknown): readonly TerrainLayer[] {
  const issues = validateTerrainLayerStack(value);
  if (issues.length > 0) throw new Error(`capas de terreno inválidas: ${issues.join('; ')}`);
  return (value as readonly TerrainLayer[]).map(layer => ({ ...layer }));
}

/** Cuenta celdas efectivas de una forma pintada (para el panel). */
export function paintedCellCount(layer: TerrainLayer): number {
  return layer.shape.kind === 'painted' ? layer.shape.cells.length : 0;
}

/** Fusiona celdas pintadas existentes con una pincelada nueva, deduplicando
 *  y respetando la cuota fail-closed (nunca supera maxPaintedCells). El orden
 *  de inserción se conserva para estabilidad del contrato; la aplicación del
 *  stack deriva un Set una sola vez por capa (lookups O(1), ver R8). */
export function mergePaintedCells(
  existing: readonly (readonly [number, number])[],
  added: readonly (readonly [number, number])[],
  limit: number = TERRAIN_LAYER_LIMITS.maxPaintedCells,
): readonly (readonly [number, number])[] {
  const seen = new Set<string>();
  const merged: (readonly [number, number])[] = [];
  for (const cell of [...existing, ...added]) {
    if (!Number.isSafeInteger(cell[0]) || !Number.isSafeInteger(cell[1])) continue;
    const key = `${cell[0]}:${cell[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cell);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** Peso del falloff para una distancia con signo (≤0 dentro de la forma). */
function falloffWeight(d: number, radius: number, kind: FalloffKind): number {
  if (d <= 0) return 1;
  if (radius <= 0) return 0;
  const t = Math.min(1, d / radius);
  switch (kind) {
    case 'hard':
      return 0;
    case 'linear':
      return 1 - t;
    case 'smooth':
      return 1 - t * t * (3 - 2 * t);
    case 'gauss':
      return Math.exp(-((d * d) / (2 * (radius / 2) ** 2)));
    case 'dome':
      return 1 - t * t;
    case 'spike':
      return (1 - t) ** 2;
  }
}

/** Distancia con signo de un punto a un segmento (negativa dentro). */
function sdfSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= 1e-12) return Math.hypot(px - ax, pz - az);
  const t = Math.min(1, Math.max(0, ((px - ax) * abx + (pz - az) * abz) / lengthSq));
  return Math.hypot(px - (ax + t * abx), pz - (az + t * abz));
}

/** SDF 2D de un polígono (negativo dentro, positivo fuera). */
function sdfPolygon(
  px: number,
  pz: number,
  points: readonly (readonly [number, number])[],
): number {
  let inside = false;
  let minDistance = Infinity;
  const count = points.length;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[j];
    const distance = sdfSegment(px, pz, ax, az, bx, bz);
    if (distance < minDistance) minDistance = distance;
    /* Ray casting (paridad de cruces) para el signo. */
    if ((az > pz) !== (bz > pz)
      && px < ((bx - ax) * (pz - az)) / (bz - az) + ax) {
      inside = !inside;
    }
  }
  return (inside ? -1 : 1) * minDistance;
}

/** Distancia con signo de una celda a la forma de la capa. */
function shapeSdf(
  shape: TerrainLayerShape,
  worldX: number,
  worldZ: number,
  cellI: number,
  cellJ: number,
  paintedSet: Set<string> | undefined,
): number {
  switch (shape.kind) {
    case 'circle':
      return Math.hypot(worldX - shape.cx, worldZ - shape.cz) - shape.radius;
    case 'curve':
      return distanceToPolyline(worldX, worldZ, shape.points) - shape.halfWidth;
    case 'polygon':
      return sdfPolygon(worldX, worldZ, shape.points);
    case 'painted':
      /* Máscara exacta: dentro en las celdas pintadas, fuera infinito. */
      return paintedSet?.has(`${cellI}:${cellJ}`) === true ? -1 : Infinity;
  }
}

function distanceToPolyline(
  px: number,
  pz: number,
  points: readonly (readonly [number, number])[],
): number {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    min = Math.min(min, sdfSegment(px, pz, ax, az, bx, bz));
  }
  return min;
}

/** AABB de la forma en celdas (recortada al grid) para iterar solo lo
 *  afectado; las capas se aplican sobre su zona, no sobre todo el mundo.
 *  Absorbe `falloffRadius` en todas las formas: el peso del borde (d>0 pero
 *  d≤falloff) era recortado por el AABB anterior, truncando la transición
 *  de círculos, curvas y polígonos (R9). */
function shapeCellBounds(
  shape: TerrainLayerShape,
  width: number,
  depth: number,
  cellSize: number,
  falloffRadius: number,
): { minI: number; maxI: number; minJ: number; maxJ: number } {
  const halfX = (width * cellSize) / 2;
  const halfZ = (depth * cellSize) / 2;
  const falloff = Number.isFinite(falloffRadius) ? Math.max(0, falloffRadius) : 0;
  const toCellI = (x: number): number => Math.floor((x + halfX) / cellSize);
  const toCellJ = (z: number): number => Math.floor((z + halfZ) / cellSize);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const absorb = (x: number, z: number): void => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  };
  switch (shape.kind) {
    case 'circle':
      absorb(shape.cx - shape.radius - falloff, shape.cz - shape.radius - falloff);
      absorb(shape.cx + shape.radius + falloff, shape.cz + shape.radius + falloff);
      break;
    case 'curve':
      for (const [x, z] of shape.points) {
        absorb(x - shape.halfWidth - falloff, z - shape.halfWidth - falloff);
        absorb(x + shape.halfWidth + falloff, z + shape.halfWidth + falloff);
      }
      break;
    case 'polygon':
      for (const [x, z] of shape.points) {
        absorb(x - falloff, z - falloff);
        absorb(x + falloff, z + falloff);
      }
      break;
    case 'painted':
      /* La celda ocupa el rect [i·cellSize, (i+1)·cellSize]; usar sus bordes
       * (no el centro) más el falloff mantiene la cobertura exacta. */
      for (const [i, j] of shape.cells) {
        absorb(i * cellSize - halfX - falloff, j * cellSize - halfZ - falloff);
        absorb((i + 1) * cellSize - halfX + falloff, (j + 1) * cellSize - halfZ + falloff);
      }
      break;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return { minI: 0, maxI: 0, minJ: 0, maxJ: 0 };
  return {
    minI: Math.max(0, toCellI(minX)),
    maxI: Math.min(width - 1, toCellI(maxX)),
    minJ: Math.max(0, toCellJ(minZ)),
    maxJ: Math.min(depth - 1, toCellJ(maxZ)),
  };
}

/** Aplica el stack de capas sobre un heightfield; later layers win. */
export function applyTerrainLayerStack(
  base: IslandHeightfield,
  layers: readonly TerrainLayer[],
  cellSize = 1,
): TerrainLayerStackResult {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('cellSize inválido');
  const { width, depth, waterLevel } = base;
  const heights = new Float32Array(base.heights);
  const surfaces = new Uint8Array(width * depth);
  const vegetationMask = new Int8Array(width * depth);
  for (let k = 0; k < width * depth; k += 1) {
    surfaces[k] = base.heights[k] < waterLevel ? TERRAIN_SURFACE_IDS.water : TERRAIN_SURFACE_IDS.grass;
  }
  let affectedCells = 0;
  const affected = new Uint8Array(width * depth);

  for (const layer of layers) {
    if (!layer.enabled) continue;
    /* R8: para máscaras pintadas se indexan las celdas una sola vez por capa;
     * la búsqueda lineal O(cells) por celda evaluada era O(cells×AABB) y en
     * el peor caso (16k pintadas sobre un AABB 256×256) ~1e9 comparaciones. */
    const paintedSet = layer.shape.kind === 'painted'
      ? new Set(layer.shape.cells.map(([i, j]) => `${i}:${j}`))
      : undefined;
    const bounds = shapeCellBounds(layer.shape, width, depth, cellSize, layer.falloffRadius);
    const layerAffected = applyLayerRegion(
      layer,
      base,
      heights,
      surfaces,
      vegetationMask,
      affected,
      bounds,
      cellSize,
      paintedSet,
    );
    affectedCells += layerAffected;
  }
  /* Las alturas quedan acotadas al contrato MapVersion (fail-closed). */
  for (let k = 0; k < heights.length; k += 1) {
    heights[k] = Math.min(64, Math.max(-64, heights[k]));
  }
  return { heights, surfaces, vegetationMask, affectedCells };
}

function applyLayerRegion(
  layer: TerrainLayer,
  base: IslandHeightfield,
  heights: Float32Array,
  surfaces: Uint8Array,
  vegetationMask: Int8Array,
  affected: Uint8Array,
  bounds: { minI: number; maxI: number; minJ: number; maxJ: number },
  cellSize: number,
  paintedSet: Set<string> | undefined,
): number {
  const { width, depth, waterLevel } = base;
  const halfX = (width * cellSize) / 2;
  const halfZ = (depth * cellSize) / 2;
  let count = 0;
  for (let j = bounds.minJ; j <= bounds.maxJ; j += 1) {
    for (let i = bounds.minI; i <= bounds.maxI; i += 1) {
      const id = j * width + i;
      const worldX = (i + 0.5) * cellSize - halfX;
      const worldZ = (j + 0.5) * cellSize - halfZ;
      const d = shapeSdf(layer.shape, worldX, worldZ, i, j, paintedSet);
      if (!Number.isFinite(d)) continue;
      const weight = falloffWeight(d, layer.falloffRadius, layer.falloff) * layer.bias;
      if (weight <= 0) continue;

      const taperScale = taperAt(layer, worldX, worldZ, d);
      const effectiveWeight = Math.min(1, weight * taperScale);
      if (effectiveWeight <= 0) continue;

      const original = base.heights[id];
      const current = heights[id];
      if (layer.kind === 'elevation') {
        const target = layer.elevationMode === 'absolute'
          ? layer.height
          : original + layer.height;
        const next = blendHeight(current, original, target, effectiveWeight, layer.blend);
        if (Math.abs(next - current) > 1e-6) {
          heights[id] = next;
          if (affected[id] === 0) {
            affected[id] = 1;
            count += 1;
          }
        }
        continue;
      }

      /* [138A-10] Capa de vegetación: pinta la máscara de césped (add/remove)
       * donde el peso supera hardness, sin tocar superficie ni altura. */
      if (layer.kind === 'vegetation') {
        if (effectiveWeight >= layer.hardness) {
          const next = layer.mode === 'add' ? 1 : -1;
          if (vegetationMask[id] !== next) {
            vegetationMask[id] = next;
            if (affected[id] === 0) {
              affected[id] = 1;
              count += 1;
            }
          }
        }
        continue;
      }

      /* Capas de superficie: pintan el id donde el peso supera hardness. */
      if (effectiveWeight >= layer.hardness) {
        const surfaceId = layer.kind === 'path'
          ? TERRAIN_SURFACE_IDS.path
          : layer.kind === 'sand'
            ? TERRAIN_SURFACE_IDS.sand
            : TERRAIN_SURFACE_IDS.water;
        if (surfaces[id] !== surfaceId) {
          surfaces[id] = surfaceId;
          if (affected[id] === 0) {
            affected[id] = 1;
            count += 1;
          }
        }
        if (layer.kind === 'water' && layer.lowerToWater) {
          const target = waterLevel - 0.05;
          const next = blendHeight(current, original, target, effectiveWeight, 'set');
          if (Math.abs(next - current) > 1e-6) {
            heights[id] = next;
            if (affected[id] === 0) {
              affected[id] = 1;
              count += 1;
            }
          }
        }
      }
    }
  }
  return count;
}

/** Interpolación del blend para una celda. */
function blendHeight(
  current: number,
  original: number,
  target: number,
  weight: number,
  blend: LayerBlend,
): number {
  const lerped = current + (target - original) * weight;
  switch (blend) {
    case 'set':
      return original + (target - original) * weight;
    case 'add':
      return current + (target - original) * weight;
    case 'max':
      return Math.max(current, lerped);
    case 'min':
      return Math.min(current, lerped);
  }
}

/** Factor de taper por posición (0..1). Para curvas se proyecta la celda
 *  sobre la polilínea (ríos que bajan/ensanchan a lo largo del recorrido);
 *  el resto de formas usa el interior (t=0) salvo en el falloff del borde. */
function taperAt(
  layer: TerrainLayer,
  worldX: number,
  worldZ: number,
  d: number,
): number {
  const taper = layer.taper;
  if (!taper || !taper.enabled) return 1;
  let t: number;
  if (layer.shape.kind === 'curve') {
    t = polylineParam(layer.shape.points, worldX, worldZ);
  } else if (d < 0) {
    t = 0;
  } else {
    /* Borde del falloff: decae de inicio a fin en la transición. */
    t = Math.min(1, Math.max(0, 1 - d / Math.max(1e-6, layer.falloffRadius)));
  }
  const widthScale = taper.widthStart + (taper.widthEnd - taper.widthStart) * t;
  const heightScale = taper.heightStart + (taper.heightEnd - taper.heightStart) * t;
  return Math.min(widthScale, heightScale);
}

/** Proyección de la celda sobre la polilínea: t ∈ 0..1 del recorrido total. */
function polylineParam(
  points: readonly (readonly [number, number])[],
  worldX: number,
  worldZ: number,
): number {
  let total = 0;
  const segments: number[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const len = Math.hypot(
      points[i + 1][0] - points[i][0],
      points[i + 1][1] - points[i][1],
    );
    segments.push(len);
    total += len;
  }
  if (total <= 1e-6) return 0;
  let walked = 0;
  let bestT = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [ax, az] = points[i];
    const [bx, bz] = points[i + 1];
    const d = sdfSegment(worldX, worldZ, ax, az, bx, bz);
    if (d < bestDistance) {
      bestDistance = d;
      const lengthSq = (bx - ax) ** 2 + (bz - az) ** 2;
      const u = lengthSq <= 1e-12
        ? 0
        : Math.min(1, Math.max(0, ((worldX - ax) * (bx - ax) + (worldZ - az) * (bz - az)) / lengthSq));
      bestT = (walked + segments[i] * u) / total;
    }
    walked += segments[i];
  }
  return bestT;
}
