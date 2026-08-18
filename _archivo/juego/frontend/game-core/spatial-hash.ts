/* GAME-01 — Spatial hash determinista para objetos estáticos. */

import type { StaticCollider, Vector2 } from './contracts';
import { GAME_CORE_LIMITS } from './limits';

export interface SpatialEntry {
  readonly id: string;
  readonly position: Vector2;
  readonly halfWidth: number;
  readonly halfDepth: number;
}

function cellKey(x: number, z: number): string {
  return `${x}:${z}`;
}

export class SpatialHash<T extends SpatialEntry> {
  private readonly cells = new Map<string, Set<string>>();
  private readonly entries = new Map<string, T>();
  private readonly entryCells = new Map<string, readonly string[]>();

  public constructor(private readonly cellSize: number) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('cellSize inválido');
  }

  public clear(): void {
    this.cells.clear();
    this.entries.clear();
    this.entryCells.clear();
  }

  public upsert(entry: T): void {
    this.remove(entry.id);
    const cells = this.cellsFor(entry);
    this.entries.set(entry.id, entry);
    this.entryCells.set(entry.id, cells);
    for (const key of cells) {
      const ids = this.cells.get(key) ?? new Set<string>();
      ids.add(entry.id);
      this.cells.set(key, ids);
    }
  }

  public remove(id: string): void {
    const cells = this.entryCells.get(id);
    if (!cells) return;
    for (const key of cells) {
      const ids = this.cells.get(key);
      ids?.delete(id);
      if (ids?.size === 0) this.cells.delete(key);
    }
    this.entryCells.delete(id);
    this.entries.delete(id);
  }

  public queryAabb(minX: number, maxX: number, minZ: number, maxZ: number): T[] {
    if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX > maxX || minZ > maxZ) {
      throw new Error('consulta espacial inválida');
    }
    const minCellX = Math.floor(minX / this.cellSize);
    const maxCellX = Math.floor(maxX / this.cellSize);
    const minCellZ = Math.floor(minZ / this.cellSize);
    const maxCellZ = Math.floor(maxZ / this.cellSize);
    const queryCellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
    if (!Number.isSafeInteger(queryCellCount) || queryCellCount > GAME_CORE_LIMITS.maxSpatialCellsPerEntry) {
      throw new Error(`consulta espacial demasiado grande: ${queryCellCount} celdas`);
    }
    const ids = new Set<string>();
    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let z = minCellZ; z <= maxCellZ; z += 1) {
        for (const id of this.cells.get(cellKey(x, z)) ?? []) ids.add(id);
      }
    }
    return Array.from(ids)
      .map(id => this.entries.get(id))
      .filter((entry): entry is T => entry !== undefined)
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }

  private cellsFor(entry: T): readonly string[] {
    const minCellX = Math.floor((entry.position.x - entry.halfWidth) / this.cellSize);
    const maxCellX = Math.floor((entry.position.x + entry.halfWidth) / this.cellSize);
    const minCellZ = Math.floor((entry.position.z - entry.halfDepth) / this.cellSize);
    const maxCellZ = Math.floor((entry.position.z + entry.halfDepth) / this.cellSize);
    const cells: string[] = [];
    const cellCount = (maxCellX - minCellX + 1) * (maxCellZ - minCellZ + 1);
    if (!Number.isSafeInteger(cellCount) || cellCount > GAME_CORE_LIMITS.maxSpatialCellsPerEntry) {
      throw new Error(`entrada espacial demasiado grande: ${cellCount} celdas`);
    }
    for (let x = minCellX; x <= maxCellX; x += 1) {
      for (let z = minCellZ; z <= maxCellZ; z += 1) cells.push(cellKey(x, z));
    }
    return cells;
  }
}

function colliderEntry(collider: StaticCollider): SpatialEntry {
  const halfWidth = collider.shape.kind === 'circle' ? collider.shape.radius : collider.shape.halfWidth;
  const halfDepth = collider.shape.kind === 'circle' ? collider.shape.radius : collider.shape.halfDepth;
  return { id: collider.id, position: collider.position, halfWidth, halfDepth };
}

export function createColliderIndex(colliders: readonly StaticCollider[], cellSize: number): SpatialHash<SpatialEntry> {
  const index = new SpatialHash<SpatialEntry>(cellSize);
  for (const collider of colliders) index.upsert(colliderEntry(collider));
  return index;
}
