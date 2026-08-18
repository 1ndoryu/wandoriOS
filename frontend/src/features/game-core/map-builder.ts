/* 138A-4 — Pipeline puro opciones de terreno → MapVersion (Constructor).
 * Materializa el heightfield parametrizado en chunks del contrato MapVersion,
 * genera el manifiesto de assets y las instancias de vegetación con
 * presupuestos, ubica spawns sobre tierra y valida fail-closed el documento.
 * También serializa/parsea el mundo a JSON (export/import local). Sin
 * Three/DOM/red: el mismo documento que consume el runtime lógico. */

import { MAP_VERSION_LIMITS, assertValidMapVersion } from './map-version';
import { assertWorldMatchesOptions } from './chunk-coverage';
export { assertWorldMatchesOptions } from './chunk-coverage';
import type {
  AssetInstance,
  GameAssetVersion,
  MapVersion,
  SpawnPoint,
  TerrainChunk,
} from './map-version';
import { generateTerrainHeightfield, placeVegetation } from './procedural';
import { normalizeTerrainOptions, validateTerrainOptions } from './procedural/terrain-options';
import type { TerrainOptions } from './procedural/terrain-options';
import {
  normalizeTerrainLayerStack,
  validateTerrainLayerStack,
  applyTerrainLayerStack,
  TERRAIN_SURFACE_IDS,
} from './terrain-layers';
import type { TerrainLayer } from './terrain-layers';

export const WORLD_SERIALIZATION_FORMAT = 'wandorius-map' as const;
export const WORLD_SERIALIZATION_VERSION = 1 as const;

export interface MapBuilderStats {
  readonly chunks: number;
  readonly instances: number;
  readonly trees: number;
  readonly rocks: number;
  readonly vertices: number;
  readonly triangles: number;
  readonly assets: number;
}

export interface SerializedWorld {
  readonly format: typeof WORLD_SERIALIZATION_FORMAT;
  readonly version: typeof WORLD_SERIALIZATION_VERSION;
  readonly options: TerrainOptions;
  readonly map: MapVersion;
  /** Stack de capas de terreno (138A-9); ausente en exports previos a 138A-9. */
  readonly layers?: readonly TerrainLayer[];
}

/* Manifiesto con los mismos ids que el fixture para que la escena jugable
 * pueda resolver los prototipos visuales sin cambios de adaptador. */
const BUILDER_ASSETS: readonly GameAssetVersion[] = [
  { id: 'asset-conifer', category: 'tree', contentHash: 'constructor-conifer', collisionProxy: { kind: 'circle', radius: 0.7 } },
  { id: 'asset-broadleaf', category: 'tree', contentHash: 'constructor-broadleaf', collisionProxy: { kind: 'circle', radius: 0.7 } },
  { id: 'asset-rock', category: 'rock', contentHash: 'constructor-rock', collisionProxy: { kind: 'circle', radius: 0.8 } },
  { id: 'asset-pond', category: 'water', contentHash: 'constructor-pond', collisionProxy: { kind: 'aabb', halfWidth: 2.6, halfDepth: 1.7 } },
];

/** Construye el MapVersion completo a partir de opciones del constructor. */
export function buildMapVersionFromOptions(
  value: TerrainOptions,
  mapId = 'constructor-bosque',
  layers?: readonly TerrainLayer[],
): MapVersion {
  const options = normalizeTerrainOptions(value);
  const { width, depth, cellSize, waterLevel, seed } = options;
  const heightfield = generateTerrainHeightfield(options);
  /* 138A-9: el stack de capas se aplica SIEMPRE sobre la base generada
   * (deltas acotados) para que sobreviva a regeneraciones; las superficies
   * resultantes alimentan chunks y vegetación. */
  const normalizedLayers = layers === undefined ? [] : normalizeTerrainLayerStack(layers);
  const layered = normalizedLayers.length > 0
    ? applyTerrainLayerStack(heightfield, normalizedLayers, cellSize)
    : undefined;
  const terrainHeights = layered?.heights ?? heightfield.heights;
  const terrainSurfaces = layered?.surfaces;
  const chunkSide = MAP_VERSION_LIMITS.chunkSize;
  const chunksX = width / chunkSide;
  const chunksZ = depth / chunkSide;

  const chunks: TerrainChunk[] = [];
  for (let cz = 0; cz < chunksZ; cz += 1) {
    for (let cx = 0; cx < chunksX; cx += 1) {
      const heights: number[] = [];
      for (let lz = 0; lz <= chunkSide; lz += 1) {
        for (let lx = 0; lx <= chunkSide; lx += 1) {
          /* El heightfield genera una altura por celda (width×depth); el
           * borde de vértices del último chunk comparte la última fila/columna
           * de celdas para no pedir muestras fuera de rango. */
          const gi = Math.min(cx * chunkSide + lx, width - 1);
          const gj = Math.min(cz * chunkSide + lz, depth - 1);
          heights.push(clampHeight(terrainHeights[gj * width + gi]));
        }
      }
      const surfaces: number[] = [];
      for (let lz = 0; lz < chunkSide; lz += 1) {
        for (let lx = 0; lx < chunkSide; lx += 1) {
          const gi = cx * chunkSide + lx;
          const gj = cz * chunkSide + lz;
          surfaces.push(terrainSurfaces !== undefined
            ? terrainSurfaces[gj * width + gi]
            : (heightfield.heights[gj * width + gi] < waterLevel ? TERRAIN_SURFACE_IDS.water : TERRAIN_SURFACE_IDS.grass));
        }
      }
      chunks.push({ x: cx, z: cz, heights, surfaces });
    }
  }

  const assetManifest = Object.fromEntries(
    BUILDER_ASSETS.map(asset => [asset.id, { ...asset, contentHash: `${asset.contentHash}-${seed}` }]),
  ) as Readonly<Record<string, GameAssetVersion>>;

  const instances = buildInstances(options, heightfield, assetManifest, terrainHeights, terrainSurfaces);
  const bounds = {
    minX: -(width * cellSize) / 2,
    maxX: (width * cellSize) / 2,
    minZ: -(depth * cellSize) / 2,
    maxZ: (depth * cellSize) / 2,
  };
  const map: MapVersion = {
    schemaVersion: 1,
    id: mapId,
    terrain: {
      schemaVersion: 1,
      bounds,
      cellSize,
      chunkSize: chunkSide,
      chunks,
    },
    assetManifest,
    instances,
    spawnPoints: buildSpawnPoints({ ...heightfield, heights: terrainHeights }, options),
  };
  assertValidMapVersion(map);
  return map;
}

/** Instancias de vegetación con presupuestos por densidad y posiciones
 * recortadas al rectángulo de collider para que el documento sea válido. */
function buildInstances(
  options: TerrainOptions,
  heightfield: ReturnType<typeof generateTerrainHeightfield>,
  manifest: Readonly<Record<string, GameAssetVersion>>,
  terrainHeights?: Float32Array,
  terrainSurfaces?: Uint8Array,
): readonly AssetInstance[] {
  const budgets = {
    maxGrass: Math.round(420 * options.vegetationDensity),
    /* [138A-6] En estilo suave el mundo no tiene árboles (solo césped/rocas);
     * el estilo bloques conserva el presupuesto normal. */
    maxTrees: options.style === 'suave' ? 0 : Math.round(64 * options.vegetationDensity),
    maxRocks: Math.round(26 * options.vegetationDensity),
  };
  /* 138A-9: la vegetación se posiciona sobre el heightfield ya editado por
   * las capas para no sembrar sobre tierra hundida o elevada. */
  const placementHeightfield = terrainHeights !== undefined
    ? { ...heightfield, heights: terrainHeights }
    : heightfield;
  const placements = placeVegetation(placementHeightfield, options.seed, budgets);
  const instances: AssetInstance[] = [];
  const colliderHalf = (assetId: string, scale: number): number => {
    const proxy = manifest[assetId]?.collisionProxy;
    if (!proxy) return 0;
    return (proxy.kind === 'circle' ? proxy.radius : Math.max(proxy.halfWidth, proxy.halfDepth)) * scale;
  };
  let index = 0;
  for (const placement of placements.placements) {
    if (placement.kind === 'grass') continue;
    /* 138A-9: la vegetación generada no pisa superficies pintadas
     * (camino/arena/agua); solo crece sobre hierba. */
    if (terrainSurfaces !== undefined) {
      const cellI = Math.floor(placement.x);
      const cellJ = Math.floor(placement.z);
      if (cellI >= 0 && cellI < options.width && cellJ >= 0 && cellJ < options.depth
        && terrainSurfaces[cellJ * options.width + cellI] !== TERRAIN_SURFACE_IDS.grass) {
        continue;
      }
    }
    const assetVersionId = placement.kind === 'rock'
      ? 'asset-rock'
      : (placement.seed % 2 === 0 ? 'asset-conifer' : 'asset-broadleaf');
    const scale = Math.min(1.25, Math.max(0.1, placement.scale));
    const half = colliderHalf(assetVersionId, scale);
    const min = options.width * options.cellSize / 2;
    const depth = options.depth * options.cellSize / 2;
    /* El redondeo a 3 decimales posterior puede empujar la posición unos
     * 0.0005 fuera del límite exacto; el margen garantiza contención. */
    const clamp = (v: number, bound: number): number => {
      const margin = Math.min(half, bound - 0.1) + 0.001;
      return Math.min(bound - margin, Math.max(-bound + margin, v));
    };
    instances.push({
      id: `inst-${index}`,
      assetVersionId,
      position: {
        x: round3(clamp(placement.x * options.cellSize, min)),
        z: round3(clamp(placement.z * options.cellSize, depth)),
      },
      rotationY: Math.floor(placement.seed * 360) % 360,
      scale: round3(scale),
      terrainAnchor: 'surface',
    });
    index += 1;
  }
  return instances;
}

/** Primer spawn sobre tierra buscando desde el centro hacia afuera. */
function buildSpawnPoints(
  heightfield: ReturnType<typeof generateTerrainHeightfield>,
  options: TerrainOptions,
): readonly SpawnPoint[] {
  const { width, depth, cellSize, waterLevel } = options;
  const cx = Math.floor(width / 2);
  const cz = Math.floor(depth / 2);
  const maxRadius = Math.min(width, depth);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let j = Math.max(0, cz - radius); j <= Math.min(depth - 1, cz + radius); j += 1) {
      for (let i = Math.max(0, cx - radius); i <= Math.min(width - 1, cx + radius); i += 1) {
        const y = heightfield.heights[j * width + i];
        if (y >= waterLevel + 0.2) {
          return [{
            id: 'spawn-inicio',
            position: {
              x: round3((i - width / 2 + 0.5) * cellSize),
              z: round3((j - depth / 2 + 0.5) * cellSize),
            },
            radius: 0.5,
          }];
        }
      }
    }
  }
  /* Fail-closed: siempre existe un spawn; el centro como último recurso. */
  return [{
    id: 'spawn-inicio',
    position: { x: 0, z: 0 },
    radius: 0.5,
  }];
}

/** Métricas estructurales del documento construido para el panel. */
export function mapBuilderStats(map: MapVersion): MapBuilderStats {
  const trees = map.instances.filter(instance =>
    map.assetManifest[instance.assetVersionId]?.category === 'tree').length;
  const rocks = map.instances.filter(instance =>
    map.assetManifest[instance.assetVersionId]?.category === 'rock').length;
  const chunkCells = MAP_VERSION_LIMITS.chunkSize ** 2;
  return {
    chunks: map.terrain.chunks.length,
    instances: map.instances.length,
    trees,
    rocks,
    vertices: map.terrain.chunks.length * (MAP_VERSION_LIMITS.chunkSize + 1) ** 2,
    triangles: map.terrain.chunks.length * chunkCells * 2,
    assets: Object.keys(map.assetManifest).length,
  };
}

/** Serializa mundo + opciones a JSON (export local, Fase 5). */
export function serializeWorld(
  options: TerrainOptions,
  map: MapVersion,
  layers?: readonly TerrainLayer[],
): string {
  const envelope: SerializedWorld = {
    format: WORLD_SERIALIZATION_FORMAT,
    version: WORLD_SERIALIZATION_VERSION,
    options: normalizeTerrainOptions(options),
    map,
    layers: layers === undefined ? undefined : normalizeTerrainLayerStack(layers),
  };
  assertValidMapVersion(map);
  return JSON.stringify(envelope, null, 2);
}

/** Parsea JSON del constructor; falla cerrado ante formato o documento inválido. */
export function parseSerializedWorld(text: string): SerializedWorld {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON del mundo inválido');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('mundo serializado inválido');
  }
  const envelope = value as Partial<SerializedWorld>;
  if (envelope.format !== WORLD_SERIALIZATION_FORMAT || envelope.version !== WORLD_SERIALIZATION_VERSION) {
    throw new Error('formato de mundo no soportado');
  }
  const issues = validateTerrainOptions(envelope.options);
  if (issues.length > 0) throw new Error(`opciones del mundo inválidas: ${issues.join('; ')}`);
  assertValidMapVersion(envelope.map);
  /* [138A-11] Validación cruzada opciones↔mapa: antes solo se validaban por
   * separado y un JSON con opciones y documento de mundos distintos entraba
   * silenciosamente (bounds/cellSize/chunks incoherentes con width×depth). */
  assertWorldMatchesOptions(normalizeTerrainOptions(envelope.options), envelope.map);
  if (envelope.layers !== undefined) {
    const layerIssues = validateTerrainLayerStack(envelope.layers);
    if (layerIssues.length > 0) throw new Error(`capas del mundo inválidas: ${layerIssues.join('; ')}`);
  }
  return {
    format: WORLD_SERIALIZATION_FORMAT,
    version: WORLD_SERIALIZATION_VERSION,
    options: normalizeTerrainOptions(envelope.options),
    map: envelope.map,
    layers: envelope.layers === undefined ? undefined : normalizeTerrainLayerStack(envelope.layers),
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampHeight(value: number): number {
  return Math.min(MAP_VERSION_LIMITS.maxHeight, Math.max(-MAP_VERSION_LIMITS.maxHeight, round3(value)));
}
