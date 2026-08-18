/* 138A-11 — Validación cruzada opciones↔mapa del Constructor (contrato
 * MapVersion). Comprueba que el documento corresponde EXACTAMENTE a las
 * opciones serializadas: bounds = ±dimension×cellSize/2, mismo cellSize y
 * chunks completos con las coordenadas 0..chunksX/Z. Datos puros, sin
 * Three/DOM/red; separado de map-builder.ts para mantener el pipeline bajo
 * el umbral de meta (<300 líneas efectivas). */

import { MAP_VERSION_LIMITS } from './map-version';
import type { MapVersion } from './map-version';
import type { TerrainOptions } from './procedural/terrain-options';

/** Devuelve mensajes en español de las incoherencias entre opciones y
 *  documento (vacío = consistente). */
export function chunkCoverageIssues(
  options: TerrainOptions,
  map: MapVersion,
): readonly string[] {
  const { width, depth, cellSize } = options;
  const { bounds, cellSize: mapCellSize, chunks } = map.terrain;
  const close = (a: number, b: number): boolean =>
    Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));
  const halfWidth = (width * cellSize) / 2;
  const halfDepth = (depth * cellSize) / 2;
  const issues: string[] = [];
  if (!close(mapCellSize, cellSize)) {
    issues.push('cellSize del mapa no coincide con las opciones');
  }
  if (!close(bounds.minX, -halfWidth) || !close(bounds.maxX, halfWidth)) {
    issues.push('bounds X no coinciden con width×cellSize');
  }
  if (!close(bounds.minZ, -halfDepth) || !close(bounds.maxZ, halfDepth)) {
    issues.push('bounds Z no coinciden con depth×cellSize');
  }
  const chunksX = width / MAP_VERSION_LIMITS.chunkSize;
  const chunksZ = depth / MAP_VERSION_LIMITS.chunkSize;
  if (chunks.length !== chunksX * chunksZ) {
    issues.push(`cantidad de chunks (${chunks.length}) no coincide con width×depth`);
  } else {
    const seen = new Set(chunks.map(chunk => `${chunk.x}:${chunk.z}`));
    for (let cz = 0; cz < chunksZ; cz += 1) {
      for (let cx = 0; cx < chunksX; cx += 1) {
        if (!seen.has(`${cx}:${cz}`)) {
          issues.push(`falta el chunk ${cx}:${cz}`);
          break;
        }
      }
    }
  }
  return issues;
}

/** Lanza ante cualquier incoherencia (fail-closed, mensajes en español). */
export function assertWorldMatchesOptions(options: TerrainOptions, map: MapVersion): void {
  const issues = chunkCoverageIssues(options, map);
  if (issues.length > 0) {
    throw new Error(`mundo inconsistente con sus opciones: ${issues.join('; ')}`);
  }
}
