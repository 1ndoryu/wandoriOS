/* GAME-01 — Contratos puros del streaming lógico de mapas. */

import type { AssetInstance, GameAssetVersion, TerrainChunk } from './map-version';
import type { Vector2 } from './contracts';

export const MAP_STREAMING_LIMITS = {
  maxVisibleChunks: 9,
  maxCachedChunks: 12,
  maxVisibleInstances: 512,
  maxVisibleAssets: 128,
  defaultMarginCells: 1,
} as const;

export interface MapStreamingLimits {
  readonly maxVisibleChunks?: number;
  readonly maxCachedChunks?: number;
  readonly maxVisibleInstances?: number;
  readonly maxVisibleAssets?: number;
}

export interface VisibleMapRequest {
  readonly center: Vector2;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly marginCells?: number;
  /** Culling avanzado por distancia: radio circular de visibilidad en unidades
   * de mundo desde el centro. Sin él, la ventana es rectangular; con él, los
   * chunks/instancias más allá del radio se descartan aunque caigan dentro de
   * la ventana (recorta esquinas y presupuesto de draw calls). */
  readonly maxDistance?: number;
}

export interface VisibleMapContent {
  readonly chunkKeys: readonly string[];
  readonly chunks: readonly TerrainChunk[];
  readonly instances: readonly AssetInstance[];
  readonly assets: readonly GameAssetVersion[];
  readonly assetVersionIds: readonly string[];
  readonly evictedChunkKeys: readonly string[];
  readonly cacheSize: number;
}

export function chunkKey(x: number, z: number): string {
  return `${x}:${z}`;
}

export function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function distanceSquared(instance: AssetInstance, center: Vector2): number {
  const x = instance.position.x - center.x;
  const z = instance.position.z - center.z;
  return x * x + z * z;
}

export function validateStreamingLimits(limits: Required<MapStreamingLimits>): void {
  if (!Number.isSafeInteger(limits.maxVisibleChunks) || limits.maxVisibleChunks < 1) {
    throw new Error('maxVisibleChunks inválido');
  }
  if (!Number.isSafeInteger(limits.maxCachedChunks)
    || limits.maxCachedChunks < limits.maxVisibleChunks) {
    throw new Error('maxCachedChunks debe cubrir los chunks visibles');
  }
  if (!Number.isSafeInteger(limits.maxVisibleInstances) || limits.maxVisibleInstances < 1) {
    throw new Error('maxVisibleInstances inválido');
  }
  if (!Number.isSafeInteger(limits.maxVisibleAssets) || limits.maxVisibleAssets < 1) {
    throw new Error('maxVisibleAssets inválido');
  }
}
