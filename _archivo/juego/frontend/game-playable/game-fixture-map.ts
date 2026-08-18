/* GAME-01 — Fixture jugable offline: mapa publicado pequeño y determinista.
 * El documento usa el contrato de MapVersion para probar el mismo boundary que
 * consumirá el futuro backend; todavía no hay red, persistencia ni editor. */

import {
  mapVersionToWorldMap,
  type AssetInstance,
  type GameAssetVersion,
  type MapVersion,
  type StaticCollider,
  type WorldMap,
} from '../../../game-core';

export interface FixtureProp {
  readonly id: string;
  readonly assetVersionId: string;
  readonly kind: 'conifer' | 'broadleaf' | 'rock' | 'pond';
  readonly x: number;
  readonly z: number;
  readonly scale: number;
  readonly width?: number;
  readonly depth?: number;
}

const FIXTURE_ASSETS: readonly GameAssetVersion[] = [
  { id: 'asset-conifer', category: 'tree', contentHash: 'fixture-conifer-v1' },
  { id: 'asset-broadleaf', category: 'tree', contentHash: 'fixture-broadleaf-v1' },
  { id: 'asset-rock', category: 'rock', contentHash: 'fixture-rock-v1', collisionProxy: { kind: 'circle', radius: 0.8 } },
  { id: 'asset-pond', category: 'water', contentHash: 'fixture-pond-v1', collisionProxy: { kind: 'aabb', halfWidth: 2.6, halfDepth: 1.7 } },
  { id: 'asset-tree-collider', category: 'tree', contentHash: 'fixture-tree-v1', collisionProxy: { kind: 'circle', radius: 0.7 } },
];

/* [GAME-01-VIS] Mapa limpio (05-ago): sin props para validar piso, cámara y
 * movimiento sin obstáculos visuales. El pipeline de instancias y el catálogo
 * de assets siguen intactos para cuando lleguen los assets definitivos. */
export const FIXTURE_PROPS: readonly FixtureProp[] = [];

const terrainHeights = Array.from({ length: 17 * 17 }, (_, index) => {
  const x = index % 17;
  const z = Math.floor(index / 17);
  return Number((Math.sin(x * 0.3) * Math.cos(z * 0.2) * 0.15).toFixed(3));
});

const terrainSurfaces = Array.from({ length: 16 * 16 }, (_, index) => index % 11 === 0 ? 1 : 0);
const FIXTURE_CHUNK = { x: 0, z: 0, heights: terrainHeights, surfaces: terrainSurfaces } as const;
const FIXTURE_EAST_CHUNK = { x: 1, z: 0, heights: terrainHeights, surfaces: terrainSurfaces } as const;

const FIXTURE_INSTANCES: readonly AssetInstance[] = FIXTURE_PROPS.map((prop) => ({
  id: prop.id,
  assetVersionId: prop.assetVersionId,
  position: { x: prop.x, z: prop.z },
  rotationY: 0,
  scale: prop.scale,
  terrainAnchor: 'surface',
}));

export const FIXTURE_MAP_VERSION: MapVersion = {
  schemaVersion: 1,
  id: 'fixture-bosque-v1',
  terrain: {
    schemaVersion: 1,
    bounds: { minX: -10, maxX: 22, minZ: -8, maxZ: 8 },
    cellSize: 1,
    chunkSize: 16,
    chunks: [FIXTURE_CHUNK, FIXTURE_EAST_CHUNK],
  },
  assetManifest: Object.fromEntries(FIXTURE_ASSETS.map(asset => [asset.id, asset])),
  instances: FIXTURE_INSTANCES,
  spawnPoints: [{ id: 'spawn-centre', position: { x: 0, z: -0.5 }, radius: 0.38 }],
};

export const FIXTURE_MAP: WorldMap = mapVersionToWorldMap(FIXTURE_MAP_VERSION);

export const FIXTURE_COLLIDERS: readonly StaticCollider[] = FIXTURE_MAP.colliders;
