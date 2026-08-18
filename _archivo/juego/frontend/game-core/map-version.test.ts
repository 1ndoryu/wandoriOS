import { describe, expect, it } from 'vitest';
import {
  MAP_VERSION_LIMITS,
  assertValidMapVersion,
  mapVersionToWorldMap,
  validateMapVersion,
  type MapVersion,
} from './map-version';

const asset = {
  id: 'tree-v1',
  category: 'tree' as const,
  contentHash: 'sha256:tree-v1',
  collisionProxy: { kind: 'circle' as const, radius: 0.5 },
};

const validMap: MapVersion = {
  schemaVersion: 1,
  id: 'map-v1',
  terrain: {
    schemaVersion: 1,
    bounds: { minX: 0, maxX: 32, minZ: 0, maxZ: 32 },
    cellSize: 2,
    chunkSize: 16,
    chunks: [{ x: 0, z: 0, heights: Array(289).fill(0), surfaces: Array(256).fill(0) }],
  },
  assetManifest: { 'tree-v1': asset },
  instances: [{
    id: 'tree-instance', assetVersionId: 'tree-v1', position: { x: 8, z: 8 },
    rotationY: 0, scale: 1, terrainAnchor: 'surface',
  }],
  spawnPoints: [{ id: 'spawn', position: { x: 2, z: 2 }, radius: 0.5 }],
};

describe('GAME-01 MapVersion', () => {
  it('accepts the versioned document and derives a static WorldMap', () => {
    expect(validateMapVersion(validMap)).toEqual([]);
    expect(() => assertValidMapVersion(validMap)).not.toThrow();
    expect(mapVersionToWorldMap(validMap)).toEqual({
      schemaVersion: 1,
      bounds: validMap.terrain.bounds,
      colliders: [{ id: 'tree-instance', position: { x: 8, z: 8 }, shape: { kind: 'circle', radius: 0.5 } }],
    });
  });

  it('rejects malformed containers, unsupported schema and broken references', () => {
    expect(validateMapVersion(null)).toEqual([{ path: 'mapVersion', message: 'debe ser un objeto' }]);
    expect(validateMapVersion({ ...validMap, schemaVersion: 99 })).toContainEqual({ path: 'schemaVersion', message: 'versión no soportada' });
    expect(validateMapVersion({
      ...validMap,
      instances: [{ ...validMap.instances[0], assetVersionId: 'missing' }],
    })).toContainEqual({ path: 'instances[0].assetVersionId', message: 'referencia de asset inexistente' });
    expect(validateMapVersion({
      ...validMap,
      spawnPoints: [],
    })).toContainEqual({ path: 'spawnPoints', message: 'cuota de spawns inválida' });
  });

  it('rejects invalid chunk arrays and values without scanning past the quota', () => {
    const invalid = {
      ...validMap,
      terrain: {
        ...validMap.terrain,
        chunks: [{ x: 0, z: 0, heights: [], surfaces: [] }],
      },
    };
    expect(validateMapVersion(invalid)).toEqual(expect.arrayContaining([
      { path: 'terrain.chunks[0].heights', message: 'debe contener 289 valores' },
      { path: 'terrain.chunks[0].surfaces', message: 'debe contener 256 valores' },
    ]));

    const oversized = {
      ...validMap,
      terrain: {
        ...validMap.terrain,
        chunks: Array.from({ length: MAP_VERSION_LIMITS.maxChunks + 1 }, (_, index) => ({
          x: index, z: 0, heights: Array(289).fill(0), surfaces: Array(256).fill(0),
        })),
      },
    };
    const issues = validateMapVersion(oversized);
    expect(issues).toContainEqual({ path: 'terrain.chunks', message: 'supera la cuota de chunks' });
    expect(issues).not.toContainEqual(expect.objectContaining({ path: `terrain.chunks[${MAP_VERSION_LIMITS.maxChunks}]` }));
  });

  it('rejects unknown fields at each nested contract boundary', () => {
    const cases = [
      { ...validMap, unexpected: true },
      { ...validMap, terrain: { ...validMap.terrain, metadata: true } },
      {
        ...validMap,
        assetManifest: {
          'tree-v1': { ...asset, metadata: true },
        },
      },
      {
        ...validMap,
        instances: [{ ...validMap.instances[0], metadata: true }],
      },
      {
        ...validMap,
        terrain: {
          ...validMap.terrain,
          chunks: [{ ...validMap.terrain.chunks[0], metadata: true }],
        },
      },
      {
        ...validMap,
        assetManifest: {
          'tree-v1': {
            ...asset,
            collisionProxy: { kind: 'circle' as const, radius: 0.5, metadata: true },
          },
        },
      },
    ];

    for (const candidate of cases) {
      expect(validateMapVersion(candidate)).not.toEqual([]);
    }
  });

  it('rejects instances and spawns outside the published bounds', () => {
    expect(validateMapVersion({
      ...validMap,
      instances: [{ ...validMap.instances[0], position: { x: 31.8, z: 8 } }],
    })).toContainEqual({ path: 'instances[0].position', message: 'instancia fuera de bounds' });
    expect(validateMapVersion({
      ...validMap,
      spawnPoints: [{ id: 'spawn', position: { x: 0.1, z: 2 }, radius: 0.5 }],
    })).toContainEqual({ path: 'spawnPoints[0].position', message: 'spawn fuera de bounds' });
    expect(() => mapVersionToWorldMap({ ...validMap, instances: [{ ...validMap.instances[0], scale: 99 }] })).toThrow('MapVersion inválido');
  });
});
