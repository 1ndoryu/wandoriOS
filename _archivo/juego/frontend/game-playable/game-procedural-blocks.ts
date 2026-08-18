/* GAME-01 — Adaptador del toolkit → mesher de bloques del 128A-1 (138A-1).
 * Convierte el heightfield continuo del toolkit en un BlockHeightmap (misma
 * cuantización + caminabilidad) para que el comparador alimente el mesher del
 * experimento SIN mover ni duplicar sus módulos. Solo glue de datos. */

import {
  quantizeBlockLevels,
  relaxBlockWalkability,
  trimLonelyIslands,
  type IslandHeightfield,
} from '../../../game-core';
import type { BlockHeightmap } from '../../../game-core/blocks/game-block-heightmap';

export function buildBlockHeightmapFromIsland(
  h: IslandHeightfield,
  maxLevel: number,
): BlockHeightmap {
  const levels = quantizeBlockLevels(h, maxLevel);
  relaxBlockWalkability(levels, h.width, h.depth);
  trimLonelyIslands(levels, h.width, h.depth);
  return { width: h.width, depth: h.depth, maxLevel, levels };
}
