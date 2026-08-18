import { describe, expect, it } from 'vitest';
import { buildPreviewChunkData } from './game-map-preview';
import { FIXTURE_MAP_VERSION } from './game-fixture-map';

describe('game-map-preview (297A-70)', () => {
  it('genera una malla por chunk del borrador con la misma transformación del runtime', () => {
    const data = buildPreviewChunkData(FIXTURE_MAP_VERSION);
    expect(data).toHaveLength(FIXTURE_MAP_VERSION.terrain.chunks.length);
    for (const entry of data) {
      /* (chunkSize+1)² vértices × 3 componentes; 16² celdas × 6 índices. */
      expect(entry.positions).toHaveLength(17 * 17 * 3);
      expect(entry.indices).toHaveLength(16 * 16 * 6);
      expect(entry.surfaces).toHaveLength(16 * 16);
    }
    expect(data[0].key).toBe('0:0');
    expect(data[1].key).toBe('1:0');
  });

  it('respeta las alturas del documento en la posición Y', () => {
    const data = buildPreviewChunkData(FIXTURE_MAP_VERSION);
    const chunk = FIXTURE_MAP_VERSION.terrain.chunks[0];
    const entry = data[0];
    for (let v = 0; v < chunk.heights.length; v += 1) {
      /* Float32 pierde precisión decimal: comparar con tolerancia. */
      expect(entry.positions[v * 3 + 1]).toBeCloseTo(chunk.heights[v], 4);
    }
  });

  it('traduce los bounds a orígenes de chunk consistentes con el runtime', () => {
    const data = buildPreviewChunkData(FIXTURE_MAP_VERSION);
    const { bounds, cellSize } = FIXTURE_MAP_VERSION.terrain;
    /* Primer vértice del chunk (0,0) → esquina minX/minZ. */
    expect(data[0].positions[0]).toBe(bounds.minX);
    expect(data[0].positions[2]).toBe(bounds.minZ);
    /* Primer vértice del chunk (1,0) → minX + 16 celdas. */
    expect(data[1].positions[0]).toBe(bounds.minX + 16 * cellSize);
    expect(data[1].positions[2]).toBe(bounds.minZ);
  });
});
