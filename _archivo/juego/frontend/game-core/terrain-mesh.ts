/* GAME-01 — Datos puros de malla para un TerrainChunk.
 * No importa Three.js: el adaptador visual decide cómo subir estos arrays a GPU.
 */

import type { TerrainChunk } from './map-version';

export const TERRAIN_MESH_LIMITS = {
  chunkSize: 16,
  maxHeight: 64,
} as const;

export interface TerrainMeshData {
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  /** Un valor por celda, en el mismo orden que los seis índices de cada celda. */
  readonly surfaces: Uint8Array;
}

export function buildTerrainMeshData(
  chunk: TerrainChunk,
  cellSize: number,
  originX = 0,
  originZ = 0,
): TerrainMeshData {
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error('cellSize inválido');
  }
  if (!Number.isSafeInteger(chunk.x) || !Number.isSafeInteger(chunk.z)) {
    throw new Error('coordenadas de chunk inválidas');
  }

  const size = TERRAIN_MESH_LIMITS.chunkSize;
  const vertexSide = size + 1;
  const expectedHeights = vertexSide * vertexSide;
  const expectedSurfaces = size * size;
  if (chunk.heights.length !== expectedHeights || chunk.surfaces.length !== expectedSurfaces) {
    throw new Error('datos de chunk incompletos');
  }
  if (!Number.isFinite(originX) || !Number.isFinite(originZ)) {
    throw new Error('origen de chunk inválido');
  }
  for (const height of chunk.heights) {
    if (!Number.isFinite(height) || Math.abs(height) > TERRAIN_MESH_LIMITS.maxHeight) {
      throw new Error('altura de chunk inválida');
    }
  }
  for (const surface of chunk.surfaces) {
    if (!Number.isSafeInteger(surface) || surface < 0 || surface > 15) {
      throw new Error('superficie de chunk inválida');
    }
  }

  const positions = new Float32Array(expectedHeights * 3);
  const indices = new Uint32Array(expectedSurfaces * 6);
  const surfaces = Uint8Array.from(chunk.surfaces);
  const chunkOriginX = originX + chunk.x * size * cellSize;
  const chunkOriginZ = originZ + chunk.z * size * cellSize;

  for (let z = 0; z < vertexSide; z += 1) {
    for (let x = 0; x < vertexSide; x += 1) {
      const vertex = z * vertexSide + x;
      const offset = vertex * 3;
      positions[offset] = chunkOriginX + x * cellSize;
      positions[offset + 1] = chunk.heights[vertex];
      positions[offset + 2] = chunkOriginZ + z * cellSize;
    }
  }

  let index = 0;
  for (let z = 0; z < size; z += 1) {
    for (let x = 0; x < size; x += 1) {
      const topLeft = z * vertexSide + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + vertexSide;
      const bottomRight = bottomLeft + 1;
      indices[index++] = topLeft;
      indices[index++] = bottomLeft;
      indices[index++] = topRight;
      indices[index++] = topRight;
      indices[index++] = bottomLeft;
      indices[index++] = bottomRight;
    }
  }

  return { positions, indices, surfaces };
}
