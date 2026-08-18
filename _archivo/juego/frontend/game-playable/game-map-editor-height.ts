/* GAME-01 — Pintado de altura del Editor de mapa 2D del Bosque.
 * [297A-67] Core puro SIN DOM para la herramienta 'height': resuelve la
 * posición de mundo al vértice más cercano de la malla de alturas y pinta ese
 * vértice en TODOS los chunks que lo comparten (bordes y esquinas), de modo
 * que el relieve no se descuadre entre chunks vecinos. Los valores de altura
 * son discretos y allowlisted (TERRAIN_HEIGHT_VALUES del core). */

import type { MapVersion, TerrainChunk, Vector2 } from '../../../game-core';
import {
  commit,
  isAllowedHeight,
  type MapEditorState,
  type TerrainHeightValue,
} from './game-map-editor-core';

export interface TerrainVertexRef {
  readonly chunk: TerrainChunk;
  readonly index: number;
}

/* [297A-67] Vértices de la malla (chunkSize+1)² por chunk. Un vértice global
 * puede pertenecer a 1, 2 o 4 chunks (interior, borde o esquina compartida):
 * se devuelven todos los refs existentes para que el pintado quede sincronizado.
 * Fail-closed: devuelve null fuera de bounds o si ningún chunk contiene el
 * vértice. */
export function terrainVertexAt(
  document: MapVersion,
  world: Vector2,
): readonly TerrainVertexRef[] | null {
  const terrain = document.terrain;
  const cellSize = terrain.cellSize;
  const chunkSize = terrain.chunkSize;
  const totalCellsX = Math.round((terrain.bounds.maxX - terrain.bounds.minX) / cellSize);
  const totalCellsZ = Math.round((terrain.bounds.maxZ - terrain.bounds.minZ) / cellSize);
  const gvx = Math.round((world.x - terrain.bounds.minX) / cellSize);
  const gvz = Math.round((world.z - terrain.bounds.minZ) / cellSize);
  if (gvx < 0 || gvz < 0 || gvx > totalCellsX || gvz > totalCellsZ) return null;

  const chunkXCandidates = new Set<number>([Math.floor(gvx / chunkSize)]);
  if (gvx % chunkSize === 0 && gvx > 0) chunkXCandidates.add(gvx / chunkSize - 1);
  const chunkZCandidates = new Set<number>([Math.floor(gvz / chunkSize)]);
  if (gvz % chunkSize === 0 && gvz > 0) chunkZCandidates.add(gvz / chunkSize - 1);

  const refs: TerrainVertexRef[] = [];
  for (const chunkX of chunkXCandidates) {
    for (const chunkZ of chunkZCandidates) {
      const chunk = terrain.chunks.find((c) => c.x === chunkX && c.z === chunkZ);
      if (!chunk) continue;
      const localX = gvx - chunkX * chunkSize;
      const localZ = gvz - chunkZ * chunkSize;
      if (localX < 0 || localX > chunkSize || localZ < 0 || localZ > chunkSize) continue;
      const index = localZ * (chunkSize + 1) + localX;
      if (index < 0 || index >= chunk.heights.length) continue;
      refs.push({ chunk, index });
    }
  }
  return refs.length > 0 ? refs : null;
}

export function setActiveHeight(
  state: MapEditorState,
  height: TerrainHeightValue,
): MapEditorState {
  return { ...state, activeHeight: height };
}

/** Pinta la altura del vértice bajo el cursor (tool 'height'). No-op si la
 * herramienta no es 'height', el nivel no está allowlisted o el vértice cae
 * fuera de los chunks existentes. Commitea solo si algún vértice compartido
 * cambia (arrastre limpio sin commits redundantes). */
export function paintHeight(
  state: MapEditorState,
  world: Vector2,
  height: TerrainHeightValue,
): MapEditorState {
  if (state.tool !== 'height') return state;
  if (!isAllowedHeight(height)) return state;
  const refs = terrainVertexAt(state.document, world);
  if (!refs || refs.length === 0) return state;
  const changed = refs.some((ref) => ref.chunk.heights[ref.index] !== height);
  if (!changed) return state;

  const heightsByChunk = new Map<TerrainChunk, number[]>();
  for (const ref of refs) {
    let heights = heightsByChunk.get(ref.chunk);
    if (!heights) {
      heights = [...ref.chunk.heights];
      heightsByChunk.set(ref.chunk, heights);
    }
    heights[ref.index] = height;
  }
  const chunks = state.document.terrain.chunks.map((chunk) => {
    const heights = heightsByChunk.get(chunk);
    return heights ? { ...chunk, heights } : chunk;
  });
  const next: MapVersion = {
    ...state.document,
    terrain: { ...state.document.terrain, chunks },
  };
  return commit(state, next);
}
