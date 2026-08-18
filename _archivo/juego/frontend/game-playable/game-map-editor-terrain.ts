/* GAME-01 — Creación de terreno del Editor de mapa 2D del Bosque.
 * [297A-69] Core puro SIN DOM para la tool 'terrain': crea un chunk plano
 * (heights 0, superficies suelo) en la celda bajo el cursor y expande los
 * bounds hacia maxX/maxZ cuando el chunk cae fuera del rectángulo actual.
 * Nunca expande hacia minX/minZ: reindexar chunks negativos rompería la
 * invariante del contrato (el chunk (0,0) comienza en bounds.minX/minZ y los
 * chunks existentes deben seguir dentro de bounds). Fail-closed si el chunk
 * ya existe o la cuota está agotada. */

import { MAP_VERSION_LIMITS, type MapVersion, type TerrainChunk, type Vector2 } from '../../../game-core';
import {
  commit,
  type MapEditorState,
} from './game-map-editor-core';

export interface TerrainChunkCoords {
  readonly x: number;
  readonly z: number;
}

/** Coordenadas de chunk bajo una posición de mundo (índices locales). */
export function terrainChunkAt(document: MapVersion, world: Vector2): TerrainChunkCoords {
  const terrain = document.terrain;
  const gx = Math.floor((world.x - terrain.bounds.minX) / terrain.cellSize);
  const gz = Math.floor((world.z - terrain.bounds.minZ) / terrain.cellSize);
  return {
    x: Math.floor(gx / terrain.chunkSize),
    z: Math.floor(gz / terrain.chunkSize),
  };
}

/** ¿El chunk con estos índices queda dentro de bounds y no existe? */
export function canCreateChunk(document: MapVersion, coords: TerrainChunkCoords): boolean {
  const terrain = document.terrain;
  if (terrain.chunks.length >= MAP_VERSION_LIMITS.maxChunks) return false;
  if (terrain.chunks.some((c) => c.x === coords.x && c.z === coords.z)) return false;
  if (coords.x < 0 || coords.z < 0) return false;
  const requiredMaxX = terrain.bounds.minX + (coords.x + 1) * terrain.chunkSize * terrain.cellSize;
  const requiredMaxZ = terrain.bounds.minZ + (coords.z + 1) * terrain.chunkSize * terrain.cellSize;
  if (requiredMaxX - terrain.bounds.minX > MAP_VERSION_LIMITS.maxWorldWidth) return false;
  if (requiredMaxZ - terrain.bounds.minZ > MAP_VERSION_LIMITS.maxWorldDepth) return false;
  /* El chunk debe ser contiguo al rectángulo actual (adyacente al borde
   * derecho/inferior); un hueco interior no se rellena sin reindexar. */
  const withinX = requiredMaxX <= terrain.bounds.maxX + terrain.cellSize * terrain.chunkSize;
  const withinZ = requiredMaxZ <= terrain.bounds.maxZ + terrain.cellSize * terrain.chunkSize;
  return withinX && withinZ;
}

/** Crea un chunk plano y expande bounds hacia maxX/maxZ si hace falta. */
export function addTerrainChunk(
  state: MapEditorState,
  coords: TerrainChunkCoords,
): MapEditorState {
  if (state.tool !== 'terrain') return state;
  if (!canCreateChunk(state.document, coords)) return state;
  const terrain = state.document.terrain;
  const vertexSide = terrain.chunkSize + 1;
  const cells = terrain.chunkSize * terrain.chunkSize;
  const chunk: TerrainChunk = {
    x: coords.x,
    z: coords.z,
    heights: Array.from({ length: vertexSide * vertexSide }, () => 0),
    surfaces: Array.from({ length: cells }, () => 0),
  };
  const requiredMaxX = terrain.bounds.minX + (coords.x + 1) * terrain.chunkSize * terrain.cellSize;
  const requiredMaxZ = terrain.bounds.minZ + (coords.z + 1) * terrain.chunkSize * terrain.cellSize;
  const next: MapVersion = {
    ...state.document,
    terrain: {
      ...terrain,
      bounds: {
        ...terrain.bounds,
        maxX: Math.max(terrain.bounds.maxX, requiredMaxX),
        maxZ: Math.max(terrain.bounds.maxZ, requiredMaxZ),
      },
      chunks: [...terrain.chunks, chunk],
    },
  };
  return commit(state, next);
}
