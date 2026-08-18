/* GAME-01 — Contrato puro de mapa publicado.
 * Representa el snapshot que más adelante podrá venir del backend. No conoce
 * DOM, Three.js, almacenamiento ni red; el runtime lógico solo consume los
 * colliders derivados por mapVersionToWorldMap(). */

import type { ColliderShape, MapBounds, StaticCollider, Vector2, WorldMap } from './contracts';
import { assertValidWorldMap } from './map-validation';

export const MAP_VERSION_SCHEMA = 1 as const;

export const MAP_VERSION_LIMITS = {
  maxAssets: 256,
  maxChunks: 1_024,
  maxInstances: 10_000,
  maxSpawnPoints: 64,
  minCellSize: 0.25,
  maxCellSize: 8,
  chunkSize: 16,
  maxHeight: 64,
  minScale: 0.1,
  maxScale: 4,
  maxIdLength: 128,
  maxContentHashLength: 256,
  maxWorldWidth: 4096,
  maxWorldDepth: 4096,
  maxColliderSize: 256,
} as const;

export type AssetCategory = 'terrain' | 'tree' | 'rock' | 'water' | 'character' | 'generic';
export type TerrainAnchor = 'surface' | 'absolute';

export interface GameAssetVersion {
  readonly id: string;
  readonly category: AssetCategory;
  readonly contentHash: string;
  readonly collisionProxy?: ColliderShape;
}

export interface TerrainChunk {
  readonly x: number;
  readonly z: number;
  /** Alturas de una malla (chunkSize + 1)² para compartir bordes. */
  readonly heights: readonly number[];
  /** Superficies por celda: valores allowlisted, no código ni metadata. */
  readonly surfaces: readonly number[];
}

export interface TerrainDocument {
  readonly schemaVersion: 1;
  readonly bounds: MapBounds;
  readonly cellSize: number;
  readonly chunkSize: 16;
  readonly chunks: readonly TerrainChunk[];
}

export interface AssetInstance {
  readonly id: string;
  readonly assetVersionId: string;
  readonly position: Vector2;
  readonly rotationY: number;
  readonly scale: number;
  readonly terrainAnchor: TerrainAnchor;
}

export interface SpawnPoint {
  readonly id: string;
  readonly position: Vector2;
  readonly radius: number;
}

export interface MapVersion {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly terrain: TerrainDocument;
  readonly assetManifest: Readonly<Record<string, GameAssetVersion>>;
  readonly instances: readonly AssetInstance[];
  readonly spawnPoints: readonly SpawnPoint[];
}

export interface MapValidationIssue {
  readonly path: string;
  readonly message: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

const RESERVED_IDS = new Set(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']);

function validId(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && value.length <= MAP_VERSION_LIMITS.maxIdLength
    && !RESERVED_IDS.has(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function rejectUnknownKeys(
  record: UnknownRecord,
  allowed: readonly string[],
  path: string,
  issues: MapValidationIssue[],
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) {
      issues.push({ path: `${path}.${key}`, message: 'campo no permitido' });
    }
  }
}

function readBounds(value: unknown, path: string, issues: MapValidationIssue[]): MapBounds | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: 'requiere límites numéricos finitos' });
    return undefined;
  }
  rejectUnknownKeys(value, ['minX', 'maxX', 'minZ', 'maxZ'], path, issues);
  if (!finite(value.minX) || !finite(value.maxX) || !finite(value.minZ) || !finite(value.maxZ)) {
    issues.push({ path, message: 'requiere límites numéricos finitos' });
    return undefined;
  }
  const bounds = { minX: value.minX, maxX: value.maxX, minZ: value.minZ, maxZ: value.maxZ };
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    issues.push({ path, message: 'cada mínimo debe ser menor que su máximo' });
    return undefined;
  }
  if (bounds.maxX - bounds.minX > MAP_VERSION_LIMITS.maxWorldWidth) {
    issues.push({ path: `${path}.width`, message: 'supera el ancho máximo' });
  }
  if (bounds.maxZ - bounds.minZ > MAP_VERSION_LIMITS.maxWorldDepth) {
    issues.push({ path: `${path}.depth`, message: 'supera la profundidad máxima' });
  }
  return bounds;
}

function readPosition(value: unknown, path: string, issues: MapValidationIssue[]): Vector2 | undefined {
  if (!isRecord(value)) {
    issues.push({ path, message: 'requiere coordenadas finitas' });
    return undefined;
  }
  rejectUnknownKeys(value, ['x', 'z'], path, issues);
  if (!finite(value.x) || !finite(value.z)) {
    issues.push({ path, message: 'requiere coordenadas finitas' });
    return undefined;
  }
  return { x: value.x, z: value.z };
}

function shapeSize(shape: ColliderShape): { halfWidth: number; halfDepth: number } {
  return shape.kind === 'circle'
    ? { halfWidth: shape.radius, halfDepth: shape.radius }
    : { halfWidth: shape.halfWidth, halfDepth: shape.halfDepth };
}

function readShape(value: unknown, path: string, issues: MapValidationIssue[]): ColliderShape | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    issues.push({ path, message: 'proxy de colisión ausente o no permitido' });
    return undefined;
  }
  const allowedKeys = value.kind === 'circle'
    ? ['kind', 'radius']
    : value.kind === 'aabb'
      ? ['kind', 'halfWidth', 'halfDepth']
      : ['kind'];
  rejectUnknownKeys(value, allowedKeys, path, issues);
  if (value.kind === 'circle' && finite(value.radius)
    && value.radius > 0 && value.radius <= MAP_VERSION_LIMITS.maxColliderSize) {
    return { kind: 'circle', radius: value.radius };
  }
  if (value.kind === 'aabb' && finite(value.halfWidth) && finite(value.halfDepth)
    && value.halfWidth > 0 && value.halfDepth > 0
    && value.halfWidth <= MAP_VERSION_LIMITS.maxColliderSize
    && value.halfDepth <= MAP_VERSION_LIMITS.maxColliderSize) {
    return { kind: 'aabb', halfWidth: value.halfWidth, halfDepth: value.halfDepth };
  }
  issues.push({ path, message: 'proxy de colisión fuera de límites' });
  return undefined;
}

function insideBounds(position: Vector2, size: { halfWidth: number; halfDepth: number }, bounds: MapBounds): boolean {
  return position.x - size.halfWidth >= bounds.minX
    && position.x + size.halfWidth <= bounds.maxX
    && position.z - size.halfDepth >= bounds.minZ
    && position.z + size.halfDepth <= bounds.maxZ;
}

function validateTerrain(value: unknown, issues: MapValidationIssue[]): TerrainDocument | undefined {
  if (!isRecord(value)) {
    issues.push({ path: 'terrain', message: 'debe ser un objeto' });
    return undefined;
  }
  rejectUnknownKeys(value, ['schemaVersion', 'bounds', 'cellSize', 'chunkSize', 'chunks'], 'terrain', issues);
  if (value.schemaVersion !== 1) issues.push({ path: 'terrain.schemaVersion', message: 'versión no soportada' });
  const bounds = readBounds(value.bounds, 'terrain.bounds', issues);
  const cellSize = value.cellSize;
  if (!finite(cellSize) || cellSize < MAP_VERSION_LIMITS.minCellSize || cellSize > MAP_VERSION_LIMITS.maxCellSize) {
    issues.push({ path: 'terrain.cellSize', message: 'fuera de límites' });
  }
  if (value.chunkSize !== MAP_VERSION_LIMITS.chunkSize) {
    issues.push({ path: 'terrain.chunkSize', message: `debe ser ${MAP_VERSION_LIMITS.chunkSize}` });
  }
  if (!Array.isArray(value.chunks)) {
    issues.push({ path: 'terrain.chunks', message: 'debe ser una lista' });
    return undefined;
  }
  if (value.chunks.length > MAP_VERSION_LIMITS.maxChunks) {
    issues.push({ path: 'terrain.chunks', message: 'supera la cuota de chunks' });
  }
  const expectedHeights = (MAP_VERSION_LIMITS.chunkSize + 1) ** 2;
  const expectedCells = MAP_VERSION_LIMITS.chunkSize ** 2;
  const chunkKeys = new Set<string>();
  value.chunks.slice(0, MAP_VERSION_LIMITS.maxChunks).forEach((raw, index) => {
    const path = `terrain.chunks[${index}]`;
    if (!isRecord(raw)) {
      issues.push({ path, message: 'coordenadas de chunk inválidas' });
      return;
    }
    rejectUnknownKeys(raw, ['x', 'z', 'heights', 'surfaces'], path, issues);
    if (!Number.isSafeInteger(raw.x) || !Number.isSafeInteger(raw.z)) {
      issues.push({ path, message: 'coordenadas de chunk inválidas' });
      return;
    }
    const chunkX = raw.x as number;
    const chunkZ = raw.z as number;
    const key = `${chunkX}:${chunkZ}`;
    if (chunkKeys.has(key)) issues.push({ path, message: 'chunk duplicado' });
    chunkKeys.add(key);
    if (bounds && finite(cellSize)) {
      /* Los índices de chunk son locales al documento: 0,0 comienza en
       * bounds.minX/minZ. Así un mapa puede conservar coordenadas de juego
       * negativas sin convertir el índice espacial en coordenada mundial. */
      const chunkMinX = bounds.minX + chunkX * MAP_VERSION_LIMITS.chunkSize * cellSize;
      const chunkMaxX = chunkMinX + MAP_VERSION_LIMITS.chunkSize * cellSize;
      const chunkMinZ = bounds.minZ + chunkZ * MAP_VERSION_LIMITS.chunkSize * cellSize;
      const chunkMaxZ = chunkMinZ + MAP_VERSION_LIMITS.chunkSize * cellSize;
      if (!Number.isFinite(chunkMinX) || !Number.isFinite(chunkMaxX)
        || chunkMinX < bounds.minX || chunkMaxX > bounds.maxX
        || chunkMinZ < bounds.minZ || chunkMaxZ > bounds.maxZ) {
        issues.push({ path, message: 'chunk fuera de bounds' });
      }
    }
    for (const field of ['heights', 'surfaces'] as const) {
      const values = raw[field];
      const expected = field === 'heights' ? expectedHeights : expectedCells;
      if (!Array.isArray(values) || values.length !== expected) {
        issues.push({ path: `${path}.${field}`, message: `debe contener ${expected} valores` });
        continue;
      }
      values.forEach((entry, valueIndex) => {
        if (!finite(entry) || (field === 'heights' && Math.abs(entry) > MAP_VERSION_LIMITS.maxHeight)
          || (field === 'surfaces' && (!Number.isSafeInteger(entry) || entry < 0 || entry > 15))) {
          issues.push({ path: `${path}.${field}[${valueIndex}]`, message: 'valor fuera de límites' });
        }
      });
    }
  });
  if (!bounds) return undefined;
  return {
    schemaVersion: 1,
    bounds,
    cellSize: cellSize as number,
    chunkSize: 16,
    chunks: value.chunks as TerrainChunk[],
  };
}

export function validateMapVersion(value: unknown): readonly MapValidationIssue[] {
  if (!isRecord(value)) return [{ path: 'mapVersion', message: 'debe ser un objeto' }];
  const issues: MapValidationIssue[] = [];
  rejectUnknownKeys(value, ['schemaVersion', 'id', 'terrain', 'assetManifest', 'instances', 'spawnPoints'], 'mapVersion', issues);
  if (value.schemaVersion !== MAP_VERSION_SCHEMA) issues.push({ path: 'schemaVersion', message: 'versión no soportada' });
  if (!validId(value.id)) issues.push({ path: 'id', message: 'requiere un id válido' });
  const terrain = validateTerrain(value.terrain, issues);
  const manifest = value.assetManifest;
  if (!isRecord(manifest)) {
    issues.push({ path: 'assetManifest', message: 'debe ser un objeto' });
  } else {
    const assets = Object.entries(manifest);
    if (assets.length > MAP_VERSION_LIMITS.maxAssets) issues.push({ path: 'assetManifest', message: 'supera la cuota de assets' });
    assets.slice(0, MAP_VERSION_LIMITS.maxAssets).forEach(([key, raw]) => {
      const path = `assetManifest[${key}]`;
      if (!isRecord(raw)) {
        issues.push({ path, message: 'asset version inválida' });
        return;
      }
      rejectUnknownKeys(raw, ['id', 'category', 'contentHash', 'collisionProxy'], path, issues);
      if (!validId(key) || key !== raw.id || !validId(raw.id)
        || typeof raw.contentHash !== 'string'
        || !raw.contentHash.trim() || raw.contentHash.length > MAP_VERSION_LIMITS.maxContentHashLength
        || !['terrain', 'tree', 'rock', 'water', 'character', 'generic'].includes(raw.category as string)) {
        issues.push({ path, message: 'asset version inválida' });
        return;
      }
      if (raw.collisionProxy !== undefined) readShape(raw.collisionProxy, `${path}.collisionProxy`, issues);
    });
  }
  const bounds = terrain?.bounds;
  const instances = value.instances;
  if (!Array.isArray(instances)) {
    issues.push({ path: 'instances', message: 'debe ser una lista' });
  } else {
    if (instances.length > MAP_VERSION_LIMITS.maxInstances) issues.push({ path: 'instances', message: 'supera la cuota de instancias' });
    const ids = new Set<string>();
    instances.slice(0, MAP_VERSION_LIMITS.maxInstances).forEach((raw, index) => {
      const path = `instances[${index}]`;
      if (!isRecord(raw)) {
        issues.push({ path, message: 'id de instancia inválido o duplicado' });
        return;
      }
      rejectUnknownKeys(raw, ['id', 'assetVersionId', 'position', 'rotationY', 'scale', 'terrainAnchor'], path, issues);
      if (!validId(raw.id) || ids.has(raw.id as string)) {
        issues.push({ path, message: 'id de instancia inválido o duplicado' });
        return;
      }
      ids.add(raw.id as string);
      const assetVersionId = raw.assetVersionId;
      const hasAsset = isRecord(manifest)
        && typeof assetVersionId === 'string'
        && validId(assetVersionId)
        && hasOwn(manifest, assetVersionId)
        && isRecord(manifest[assetVersionId]);
      if (!hasAsset) {
        issues.push({ path: `${path}.assetVersionId`, message: 'referencia de asset inexistente' });
      }
      const position = readPosition(raw.position, `${path}.position`, issues);
      const rotationY = raw.rotationY;
      const scale = raw.scale;
      const validTransform = finite(rotationY) && finite(scale)
        && scale >= MAP_VERSION_LIMITS.minScale && scale <= MAP_VERSION_LIMITS.maxScale;
      if (!validTransform) {
        issues.push({ path, message: 'transform fuera de límites' });
      }
      if (raw.terrainAnchor !== 'surface' && raw.terrainAnchor !== 'absolute') {
        issues.push({ path: `${path}.terrainAnchor`, message: 'anclaje no permitido' });
      }
      if (bounds && position && validTransform && hasAsset && isRecord(manifest)) {
        const manifestAsset = manifest[assetVersionId];
        const proxyValue = isRecord(manifestAsset) ? manifestAsset.collisionProxy : undefined;
        const proxy = proxyValue === undefined
          ? undefined
          : readShape(proxyValue, `${path}.collisionProxy`, []);
        if (proxy !== undefined) {
          if (proxy.kind === 'aabb' && rotationY !== 0) {
            issues.push({ path: `${path}.rotationY`, message: 'AABB con rotación no permitida' });
          }
          const size = shapeSize(proxy);
          const effectiveWidth = size.halfWidth * scale;
          const effectiveDepth = size.halfDepth * scale;
          if (effectiveWidth > MAP_VERSION_LIMITS.maxColliderSize || effectiveDepth > MAP_VERSION_LIMITS.maxColliderSize) {
            issues.push({ path: `${path}.scale`, message: 'collider escalado fuera de límites' });
          }
          if (!insideBounds(position, { halfWidth: effectiveWidth, halfDepth: effectiveDepth }, bounds)) {
            issues.push({ path: `${path}.position`, message: 'instancia fuera de bounds' });
          }
        }
      }
    });
  }
  const spawns = value.spawnPoints;
  if (!Array.isArray(spawns)) {
    issues.push({ path: 'spawnPoints', message: 'debe ser una lista' });
  } else {
    if (spawns.length === 0 || spawns.length > MAP_VERSION_LIMITS.maxSpawnPoints) issues.push({ path: 'spawnPoints', message: 'cuota de spawns inválida' });
    const ids = new Set<string>();
    spawns.slice(0, MAP_VERSION_LIMITS.maxSpawnPoints).forEach((raw, index) => {
      const path = `spawnPoints[${index}]`;
      if (isRecord(raw)) rejectUnknownKeys(raw, ['id', 'position', 'radius'], path, issues);
      const position = isRecord(raw) ? readPosition(raw.position, `${path}.position`, issues) : undefined;
      const id = isRecord(raw) ? raw.id : undefined;
      const radius = isRecord(raw) ? raw.radius : undefined;
      if (!isRecord(raw) || !validId(id) || ids.has(id) || !finite(radius) || radius <= 0 || radius > 8) {
        issues.push({ path, message: 'spawn inválido' });
      } else {
        ids.add(id);
      }
      if (bounds && position && finite(radius) && radius <= 8
        && !insideBounds(position, { halfWidth: radius, halfDepth: radius }, bounds)) {
        issues.push({ path: `${path}.position`, message: 'spawn fuera de bounds' });
      }
    });
  }
  return issues;
}

export function assertValidMapVersion(value: unknown): asserts value is MapVersion {
  const issues = validateMapVersion(value);
  if (issues.length > 0) throw new Error(`MapVersion inválido: ${issues.map(issue => `${issue.path} ${issue.message}`).join('; ')}`);
}

export function mapVersionToWorldMap(value: unknown): WorldMap {
  assertValidMapVersion(value);
  const colliders: StaticCollider[] = [];
  for (const instance of value.instances) {
    const asset = value.assetManifest[instance.assetVersionId];
    const proxy = asset.collisionProxy;
    if (!proxy) continue;
    const shape = proxy.kind === 'circle'
      ? { kind: 'circle' as const, radius: proxy.radius * instance.scale }
      : { kind: 'aabb' as const, halfWidth: proxy.halfWidth * instance.scale, halfDepth: proxy.halfDepth * instance.scale };
    colliders.push({ id: instance.id, position: instance.position, shape });
  }
  const worldMap: WorldMap = { schemaVersion: 1, bounds: value.terrain.bounds, colliders };
  assertValidWorldMap(worldMap);
  return worldMap;
}
