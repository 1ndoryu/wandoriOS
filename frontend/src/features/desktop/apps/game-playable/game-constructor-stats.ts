/* 138A-15 — Estadísticas compactas del constructor en una sola línea. */

import { type MapBuilderStats } from '../../../game-core';

export function formatConstructorStats(stats: MapBuilderStats): string {
  return `mundo · chunks ${stats.chunks} · instancias ${stats.instances}`
    + ` · árboles ${stats.trees} · rocas ${stats.rocks}`
    + ` · tris ${stats.triangles} · vértices ${stats.vertices}`;
}
