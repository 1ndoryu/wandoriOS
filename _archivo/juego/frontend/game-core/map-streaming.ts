/* GAME-01 — Streaming lógico acotado de mapas.
 * No conoce DOM, Three.js, red ni storage: indexa un MapVersion ya validado y
 * devuelve únicamente los chunks/instancias/asset IDs dentro de la ventana.
 */

import type { MapVersion, TerrainChunk } from './map-version';
import type { Vector2 } from './contracts';
import {
  chunkKey,
  distanceSquared,
  finitePositive,
  MAP_STREAMING_LIMITS,
  validateStreamingLimits,
  type MapStreamingLimits,
  type VisibleMapContent,
  type VisibleMapRequest,
} from './map-streaming-contracts';

export { MAP_STREAMING_LIMITS } from './map-streaming-contracts';
export type {
  MapStreamingLimits,
  VisibleMapContent,
  VisibleMapRequest,
} from './map-streaming-contracts';

export function chunkKeyForPosition(map: MapVersion, position: Vector2): string {
  const span = map.terrain.chunkSize * map.terrain.cellSize;
  const x = Math.floor((position.x - map.terrain.bounds.minX) / span);
  const z = Math.floor((position.z - map.terrain.bounds.minZ) / span);
  return chunkKey(x, z);
}

interface ChunkRecord {
  readonly key: string;
  readonly chunk: TerrainChunk;
  readonly instanceIds: readonly string[];
}

/** Índice reutilizable del documento publicado; no muta el MapVersion. */
export class MapChunkCache {
  private readonly chunks = new Map<string, ChunkRecord>();
  private readonly instancesById = new Map<string, MapVersion['instances'][number]>();
  private readonly cached = new Set<string>();
  private readonly recency: string[] = [];
  private readonly limits: Required<MapStreamingLimits>;

  public constructor(
    private readonly map: MapVersion,
    limits: MapStreamingLimits = {},
  ) {
    this.limits = {
      maxVisibleChunks: limits.maxVisibleChunks ?? MAP_STREAMING_LIMITS.maxVisibleChunks,
      maxCachedChunks: limits.maxCachedChunks ?? MAP_STREAMING_LIMITS.maxCachedChunks,
      maxVisibleInstances: limits.maxVisibleInstances ?? MAP_STREAMING_LIMITS.maxVisibleInstances,
      maxVisibleAssets: limits.maxVisibleAssets ?? MAP_STREAMING_LIMITS.maxVisibleAssets,
    };
    validateStreamingLimits(this.limits);

    const instanceIdsByChunk = new Map<string, string[]>();
    for (const instance of map.instances) {
      this.instancesById.set(instance.id, instance);
      const key = chunkKeyForPosition(map, instance.position);
      const instanceIds = instanceIdsByChunk.get(key) ?? [];
      instanceIds.push(instance.id);
      instanceIdsByChunk.set(key, instanceIds);
    }
    for (const terrainChunk of map.terrain.chunks) {
      const key = chunkKey(terrainChunk.x, terrainChunk.z);
      this.chunks.set(key, {
        key,
        chunk: terrainChunk,
        instanceIds: instanceIdsByChunk.get(key) ?? [],
      });
    }
  }

  public select(request: VisibleMapRequest): VisibleMapContent {
    if (!finitePositive(request.halfWidth) || !finitePositive(request.halfDepth)) {
      throw new Error('ventana visible inválida');
    }
    if (!Number.isFinite(request.center.x) || !Number.isFinite(request.center.z)) {
      throw new Error('centro visible inválido');
    }
    const marginCells = request.marginCells ?? MAP_STREAMING_LIMITS.defaultMarginCells;
    if (!Number.isSafeInteger(marginCells) || marginCells < 0 || marginCells > 8) {
      throw new Error('marginCells inválido');
    }
    const maxDistance = request.maxDistance;
    if (maxDistance !== undefined
      && (!Number.isFinite(maxDistance) || maxDistance <= 0)) {
      throw new Error('maxDistance inválido');
    }

    const span = this.map.terrain.chunkSize * this.map.terrain.cellSize;
    const minX = Math.floor((request.center.x - request.halfWidth - this.map.terrain.bounds.minX) / span)
      - marginCells;
    const maxX = Math.floor((request.center.x + request.halfWidth - this.map.terrain.bounds.minX) / span)
      + marginCells;
    const minZ = Math.floor((request.center.z - request.halfDepth - this.map.terrain.bounds.minZ) / span)
      - marginCells;
    const maxZ = Math.floor((request.center.z + request.halfDepth - this.map.terrain.bounds.minZ) / span)
      + marginCells;
    const maxDistanceSquared = maxDistance === undefined
      ? undefined
      : maxDistance * maxDistance;
    const candidates = Array.from(this.chunks.values())
      .filter(record => record.chunk.x >= minX
        && record.chunk.x <= maxX
        && record.chunk.z >= minZ
        && record.chunk.z <= maxZ)
      .filter(record => maxDistanceSquared === undefined
        || this.chunkDistanceSquared(record.chunk, request.center, span) <= maxDistanceSquared)
      .sort((a, b) => {
        const aDistance = this.chunkDistanceSquared(a.chunk, request.center, span);
        const bDistance = this.chunkDistanceSquared(b.chunk, request.center, span);
        return aDistance - bDistance || a.key.localeCompare(b.key);
      })
      .slice(0, this.limits.maxVisibleChunks);

    const visibleKeys = candidates.map(record => record.key);
    for (const key of visibleKeys) this.touch(key);
    const evictedChunkKeys: string[] = [];
    while (this.cached.size > this.limits.maxCachedChunks) {
      const oldest = this.recency.shift();
      if (!oldest) break;
      if (this.cached.delete(oldest)) evictedChunkKeys.push(oldest);
    }

    const visibleRecords = candidates.filter(record => this.cached.has(record.key));
    const candidateInstances = visibleRecords
      .flatMap(record => record.instanceIds)
      .map(id => this.instancesById.get(id))
      .filter((instance): instance is MapVersion['instances'][number] => instance !== undefined)
      .filter(instance => maxDistanceSquared === undefined
        || distanceSquared(instance, request.center) <= maxDistanceSquared)
      .sort((a, b) => distanceSquared(a, request.center) - distanceSquared(b, request.center));
    const assetVersionIds = Array.from(new Set(candidateInstances.map(instance => instance.assetVersionId)))
      .filter(id => this.map.assetManifest[id] !== undefined)
      .slice(0, this.limits.maxVisibleAssets);
    const allowedAssets = new Set(assetVersionIds);
    const instances = candidateInstances
      .filter(instance => allowedAssets.has(instance.assetVersionId))
      .slice(0, this.limits.maxVisibleInstances);
    const assets = assetVersionIds
      .map(id => this.map.assetManifest[id])
      .filter((asset): asset is NonNullable<typeof asset> => asset !== undefined);

    return {
      chunkKeys: visibleRecords.map(record => record.key),
      chunks: visibleRecords.map(record => record.chunk),
      instances,
      assets,
      assetVersionIds,
      evictedChunkKeys,
      cacheSize: this.cached.size,
    };
  }

  public get cacheSize(): number {
    return this.cached.size;
  }

  private touch(key: string): void {
    if (!this.chunks.has(key)) return;
    const index = this.recency.indexOf(key);
    if (index >= 0) this.recency.splice(index, 1);
    this.recency.push(key);
    this.cached.add(key);
  }

  private chunkDistanceSquared(chunk: TerrainChunk, center: Vector2, span: number): number {
    const x = this.map.terrain.bounds.minX + (chunk.x + 0.5) * span;
    const z = this.map.terrain.bounds.minZ + (chunk.z + 0.5) * span;
    const dx = x - center.x;
    const dz = z - center.z;
    return dx * dx + dz * dz;
  }
}
