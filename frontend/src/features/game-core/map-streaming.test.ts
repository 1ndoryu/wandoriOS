import { describe, expect, it } from 'vitest';
import type { MapVersion, TerrainChunk } from './map-version';
import { MapChunkCache } from './map-streaming';

function chunk(x: number): TerrainChunk {
  return { x, z: 0, heights: Array(289).fill(0), surfaces: Array(256).fill(0) };
}

function fixtureMap(): MapVersion {
  return {
    schemaVersion: 1,
    id: 'streaming-test-map',
    terrain: {
      schemaVersion: 1,
      bounds: { minX: -10, maxX: 38, minZ: -8, maxZ: 8 },
      cellSize: 1,
      chunkSize: 16,
      chunks: [chunk(0), chunk(1), chunk(2)],
    },
    assetManifest: {
      'asset-a': { id: 'asset-a', category: 'tree', contentHash: 'hash-a' },
      'asset-b': { id: 'asset-b', category: 'rock', contentHash: 'hash-b' },
    },
    instances: [
      { id: 'instance-a', assetVersionId: 'asset-a', position: { x: 0, z: 0 }, rotationY: 0, scale: 1, terrainAnchor: 'surface' },
      { id: 'instance-b', assetVersionId: 'asset-b', position: { x: 16, z: 0 }, rotationY: 0, scale: 1, terrainAnchor: 'surface' },
      { id: 'instance-c', assetVersionId: 'asset-a', position: { x: 32, z: 0 }, rotationY: 0, scale: 1, terrainAnchor: 'surface' },
    ],
    spawnPoints: [{ id: 'spawn', position: { x: 0, z: 0 }, radius: 0.5 }],
  };
}

describe('MapChunkCache', () => {
  it('selects the chunk at the visible center using map-relative coordinates', () => {
    const cache = new MapChunkCache(fixtureMap(), {
      maxVisibleChunks: 1,
      maxCachedChunks: 1,
    });

    const west = cache.select({ center: { x: 0, z: -0.5 }, halfWidth: 4, halfDepth: 4, marginCells: 0 });
    const east = cache.select({ center: { x: 15, z: -0.5 }, halfWidth: 4, halfDepth: 4, marginCells: 0 });

    expect(west.chunkKeys).toEqual(['0:0']);
    expect(east.chunkKeys).toEqual(['1:0']);
    expect(east.cacheSize).toBe(1);
    expect(east.evictedChunkKeys).toEqual(['0:0']);
  });

  it('keeps visible instances and assets under hard limits', () => {
    const cache = new MapChunkCache(fixtureMap(), {
      maxVisibleChunks: 3,
      maxCachedChunks: 3,
      maxVisibleInstances: 2,
      maxVisibleAssets: 1,
    });

    const visible = cache.select({ center: { x: 14, z: 0 }, halfWidth: 24, halfDepth: 20 });

    /* Un solo asset permitido implica que solo sus instancias sobreviven al
     * presupuesto; no se cargan props cuyo asset quedó fuera de la ventana. */
    expect(visible.instances).toHaveLength(1);
    expect(visible.assets).toHaveLength(1);
    expect(visible.assetVersionIds).toHaveLength(1);
    expect(visible.cacheSize).toBeLessThanOrEqual(3);
  });

  it('evicts the least recently used chunk when the camera crosses chunks', () => {
    const cache = new MapChunkCache(fixtureMap(), {
      maxVisibleChunks: 1,
      maxCachedChunks: 2,
    });

    cache.select({ center: { x: 0, z: 0 }, halfWidth: 2, halfDepth: 2, marginCells: 0 });
    cache.select({ center: { x: 17, z: 0 }, halfWidth: 2, halfDepth: 2, marginCells: 0 });
    const third = cache.select({ center: { x: 33, z: 0 }, halfWidth: 2, halfDepth: 2, marginCells: 0 });

    expect(third.chunkKeys).toEqual(['2:0']);
    expect(third.evictedChunkKeys).toEqual(['0:0']);
    expect(third.cacheSize).toBe(2);
  });

  it('rejects invalid visible windows and cache limits', () => {
    expect(() => new MapChunkCache(fixtureMap(), { maxCachedChunks: 0 })).toThrow('maxCachedChunks');
    const cache = new MapChunkCache(fixtureMap());
    expect(() => cache.select({ center: { x: 0, z: 0 }, halfWidth: 0, halfDepth: 1 })).toThrow('ventana visible');
    expect(() => cache.select({ center: { x: 0, z: 0 }, halfWidth: 1, halfDepth: 1, marginCells: 9 })).toThrow('marginCells');
  });

  it('culls chunks beyond the circular maxDistance even inside the window', () => {
    const cache = new MapChunkCache(fixtureMap(), {
      maxVisibleChunks: 3,
      maxCachedChunks: 3,
    });

    /* La ventana rectangular cubre los chunks 0/1/2 (x: -10..38), pero el
     * radio de visibilidad solo alcanza el centro del chunk 0 desde (0,0). */
    const visible = cache.select({
      center: { x: 0, z: 0 },
      halfWidth: 30,
      halfDepth: 20,
      marginCells: 0,
      maxDistance: 10,
    });

    expect(visible.chunkKeys).toEqual(['0:0']);
    expect(visible.instances.map(instance => instance.id)).toEqual(['instance-a']);
    /* El chunk 1 queda dentro de la ventana pero fuera del radio circular. */
    expect(visible.chunkKeys).not.toContain('1:0');
  });

  it('culls instances beyond maxDistance while keeping nearer chunks', () => {
    const cache = new MapChunkCache(fixtureMap(), {
      maxVisibleChunks: 3,
      maxCachedChunks: 3,
      maxVisibleInstances: 3,
    });

    const visible = cache.select({
      center: { x: 0, z: 0 },
      halfWidth: 30,
      halfDepth: 20,
      marginCells: 0,
      maxDistance: 20,
    });

    /* Chunk 0 (x≈0) y chunk 1 (x≈16) entran por radio; la instancia en x=32
     * (chunk 2, centro a 32) queda fuera del radio y se descarta. */
    expect([...visible.chunkKeys].sort()).toEqual(['0:0', '1:0']);
    expect(visible.instances.map(instance => instance.id).sort()).toEqual(['instance-a', 'instance-b']);
  });

  it('rejects an invalid maxDistance', () => {
    const cache = new MapChunkCache(fixtureMap());
    expect(() => cache.select({
      center: { x: 0, z: 0 },
      halfWidth: 1,
      halfDepth: 1,
      maxDistance: 0,
    })).toThrow('maxDistance');
    expect(() => cache.select({
      center: { x: 0, z: 0 },
      halfWidth: 1,
      halfDepth: 1,
      maxDistance: Number.NaN,
    })).toThrow('maxDistance');
  });
});
