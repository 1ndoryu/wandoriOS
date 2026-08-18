/* GAME-01 — Core puro del Editor de mapa 2D del Bosque.
 * [297A-64] Estado y operaciones de edición SIN DOM: documento MapVersion
 * (borrador), selección, herramienta, paleta y command stack con undo/redo.
 * Cada mutación produce un documento nuevo (inmutabilidad por spreads); el
 * stack guarda snapshots del documento para deshacer/rehacer. El documento se
 * revalida con `validateMapVersion` en cada operación y al publicar.
 *
 * Contrato del stack: el undo se limita a los últimos 49 snapshots (`slice(-49)`
 * en `applyMutation`; redo se limpia al mutar) para acotar memoria, y los
 * snapshots se clonan por round-trip JSON (`cloneDocument`) — los arrays
 * planos del MapVersion (alturas, cells, instancias, spawns) viajan sin
 * pérdida ni referencias compartidas; no hay estado oculto que serializar. */

import type { GameAssetAdminEntry } from '../../../../services/game-asset-admin.service';
import {
  validateMapVersion,
  type AssetInstance,
  type GameAssetVersion,
  type MapVersion,
  type MapValidationIssue,
  type SpawnPoint,
  type Vector2,
} from '../../../game-core';

export type MapEditorTool = 'select' | 'place' | 'spawn' | 'paint' | 'height' | 'terrain';

/* [297A-66] Superficies del pincel de terreno: enteros allowlisted 0..15 del
 * contrato. El valor es semántica de Bosque (suelo/agua/camino) que el
 * runtime traduce visualmente (297A-33: 0 pale, 1 water, 2 middle); el editor
 * no inventa valores fuera del contrato. [297A-68] Añade `path` (2) como
 * tercer valor: el runtime ya lo mapea al material medio; el pincel lo
 * ofrece con sombreado propio. */
export const TERRAIN_SURFACE_VALUES = {
  ground: 0,
  water: 1,
  path: 2,
} as const;

/* [297A-67] Niveles de altura del pincel: discretos, no negativos (sin cuevas
 * ni voladizos en el MVP) y dentro del rango -64..64 del contrato. Cada valor
 * pinta una malla de vértices compartidos entre chunks; el módulo de altura
 * resuelve y aplica. */
export const TERRAIN_HEIGHT_VALUES = [0, 0.25, 0.5, 1, 1.5, 2, 2.5, 3, 4] as const;

export type TerrainHeightValue = (typeof TERRAIN_HEIGHT_VALUES)[number];

export const TERRAIN_HEIGHT_LABEL: Record<number, string> = {
  0: 'plano',
  0.25: '0.25',
  0.5: '0.5',
  1: '1',
  1.5: '1.5',
  2: '2',
  2.5: '2.5',
  3: '3',
  4: '4',
};

export const TERRAIN_HEIGHT_MAX = Math.max(...TERRAIN_HEIGHT_VALUES);

export function isAllowedHeight(value: number): value is TerrainHeightValue {
  return (TERRAIN_HEIGHT_VALUES as readonly number[]).includes(value);
}

export type TerrainSurfaceValue = (typeof TERRAIN_SURFACE_VALUES)[keyof typeof TERRAIN_SURFACE_VALUES];

export const TERRAIN_SURFACE_LABEL: Record<keyof typeof TERRAIN_SURFACE_VALUES, string> = {
  ground: 'suelo',
  water: 'agua',
  path: 'camino',
};

export function isAllowedSurface(value: number): value is TerrainSurfaceValue {
  return Object.values(TERRAIN_SURFACE_VALUES).includes(value as TerrainSurfaceValue);
}

export interface PaintSurfacePoint {
  readonly x: number;
  readonly z: number;
  readonly surface: TerrainSurfaceValue;
}

export interface MapEditorState {
  /** Borrador actual (inmutable por operación). */
  readonly document: MapVersion;
  /** Documento cargado original: `hasChanges` compara contra él. */
  readonly baseDocument: MapVersion;
  /** Versión activa al cargar: `expectedVersion` para publicar (0 si ninguna). */
  readonly activeVersion: number;
  /** [297A-71] Revisión del borrador en el servidor: `expectedRevision` para
   * el próximo guardado (0 si aún no existe borrador). Sube tras cada guardado. */
  readonly draftRevision: number;
  readonly tool: MapEditorTool;
  /** Id de instancia o spawn seleccionado (tool 'select'). */
  readonly selectedId: string | null;
  /** Asset de la paleta activo para colocar (tool 'place'). */
  readonly activeAssetId: string | null;
  /** Superficie activa del pincel (tool 'paint'). */
  readonly activeSurface: TerrainSurfaceValue;
  /** Nivel de altura activo del pincel (tool 'height'). */
  readonly activeHeight: TerrainHeightValue;
  /** Catálogo de assets activos que alimenta la paleta y el manifest. */
  readonly catalog: readonly GameAssetAdminEntry[];
  /** Snapshots anteriores del documento (hasta 49), para undo. */
  readonly undoStack: readonly MapVersion[];
  /** Snapshots posteriores al último undo, para redo (se limpia al mutar). */
  readonly redoStack: readonly MapVersion[];
}

const DEFAULT_INSTANCE_SCALE = 1;
const DEFAULT_SPAWN_RADIUS = 0.5;

/** Ids de assets del catálogo permitidos en el manifest (evita colisiones con
 * ids reservados del documento). */
const RESERVED_MANIFEST_IDS = new Set(['__proto__', 'prototype', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']);

export function createMapEditorState(
  baseDocument: MapVersion,
  activeVersion: number,
  catalog: readonly GameAssetAdminEntry[],
  draftRevision = 0,
): MapEditorState {
  return {
    document: baseDocument,
    baseDocument,
    activeVersion,
    draftRevision,
    tool: 'select',
    selectedId: null,
    activeAssetId: catalog[0]?.id ?? null,
    activeSurface: TERRAIN_SURFACE_VALUES.ground,
    activeHeight: TERRAIN_HEIGHT_VALUES[0],
    catalog,
    undoStack: [],
    redoStack: [],
  };
}

/** Clona un documento para que los snapshots del stack sean independientes. */
function cloneDocument(document: MapVersion): MapVersion {
  return JSON.parse(JSON.stringify(document)) as MapVersion;
}

/** Manifest del documento con los assets del catálogo activo fusionados: el
 * documento cargado (fixture o publicación) conserva sus entradas (una
 * instancia existente puede referenciar un id fuera del catálogo) y el editor
 * añade los assets activos del catálogo para poder colocarlos. */
export function mergeCatalogIntoManifest(
  document: MapVersion,
  catalog: readonly GameAssetAdminEntry[],
): MapVersion {
  const manifest: Record<string, GameAssetVersion> = { ...document.assetManifest };
  for (const asset of catalog) {
    if (!asset.isActive) continue;
    if (RESERVED_MANIFEST_IDS.has(asset.id)) continue;
    if (manifest[asset.id]) continue;
    manifest[asset.id] = {
      id: asset.id,
      category: isAllowedCategory(asset.category) ? asset.category : 'generic',
      contentHash: `catalog:${asset.id}`,
    };
  }
  return { ...document, assetManifest: manifest };
}

function isAllowedCategory(category: string): category is GameAssetVersion['category'] {
  return category === 'terrain' || category === 'tree' || category === 'rock'
    || category === 'water' || category === 'character' || category === 'generic';
}

/** Siguiente id numérico de instancia (`inst-N`) o spawn (`spawn-N`). */
function nextNumericId(ids: readonly string[], prefix: string): string {
  let max = 0;
  for (const id of ids) {
    if (id.startsWith(prefix)) {
      const suffix = Number(id.slice(prefix.length));
      if (Number.isInteger(suffix) && suffix > max) max = suffix;
    }
  }
  return `${prefix}${max + 1}`;
}

/** Aplica una mutación y apila el snapshot anterior (undo), limpiando redo.
 * Exportado para el módulo de altura (segundo consumidor real del editor). */
export function commit(
  state: MapEditorState,
  nextDocument: MapVersion,
): MapEditorState {
  return {
    ...state,
    document: nextDocument,
    undoStack: [...state.undoStack.slice(-49), cloneDocument(state.document)],
    redoStack: [],
  };
}

/** [297A-71] Registra la revisión devuelta por el servidor tras guardar el
 * borrador. El documento no cambia; la base de la próxima operación optimista
 * se actualiza al documento guardado para que `hasChanges` (y el pie del
 * editor) reflejen que ya no hay cambios sin persistir. */
export function setDraftRevision(state: MapEditorState, revision: number): MapEditorState {
  return {
    ...state,
    draftRevision: revision,
    baseDocument: cloneDocument(state.document),
  };
}

export function setTool(state: MapEditorState, tool: MapEditorTool): MapEditorState {
  return { ...state, tool };
}

export function select(state: MapEditorState, id: string | null): MapEditorState {
  return { ...state, selectedId: id };
}

export function setActiveAsset(state: MapEditorState, assetId: string | null): MapEditorState {
  return { ...state, activeAssetId: assetId };
}

export function setActiveSurface(state: MapEditorState, surface: TerrainSurfaceValue): MapEditorState {
  return { ...state, activeSurface: surface };
}

/* [297A-66] Celda (chunk local + índice) bajo una posición de mundo. El chunk
 * (0,0) comienza en bounds.minX/minZ; los índices de chunk son locales al
 * documento. Devuelve null si la celda cae fuera de un chunk existente. */
export function terrainCellAt(
  document: MapVersion,
  world: Vector2,
): { chunk: MapVersion['terrain']['chunks'][number]; index: number } | null {
  const terrain = document.terrain;
  const gx = Math.floor((world.x - terrain.bounds.minX) / terrain.cellSize);
  const gz = Math.floor((world.z - terrain.bounds.minZ) / terrain.cellSize);
  const chunkX = Math.floor(gx / terrain.chunkSize);
  const chunkZ = Math.floor(gz / terrain.chunkSize);
  const chunk = terrain.chunks.find((c) => c.x === chunkX && c.z === chunkZ);
  if (!chunk) return null;
  const localX = gx - chunkX * terrain.chunkSize;
  const localZ = gz - chunkZ * terrain.chunkSize;
  const index = localZ * terrain.chunkSize + localX;
  if (index < 0 || index >= chunk.surfaces.length) return null;
  return { chunk, index };
}

/** Pinta la superficie de la celda bajo la posición (tool 'paint'). No-op si
 * la celda no existe (fuera de chunks) o ya tiene esa superficie (evita
 * commits redundantes en el arrastre del pincel). */
export function paintSurface(
  state: MapEditorState,
  world: Vector2,
  surface: TerrainSurfaceValue,
): MapEditorState {
  if (state.tool !== 'paint') return state;
  const cell = terrainCellAt(state.document, world);
  if (!cell || cell.chunk.surfaces[cell.index] === surface) return state;
  const surfaces = [...cell.chunk.surfaces];
  surfaces[cell.index] = surface;
  const chunks = state.document.terrain.chunks.map((c) => (
    c === cell.chunk ? { ...c, surfaces } : c
  ));
  const next: MapVersion = {
    ...state.document,
    terrain: { ...state.document.terrain, chunks },
  };
  return commit(state, next);
}

/** Coloca una instancia del asset de la paleta en la posición dada (mundo). */
export function placeInstance(state: MapEditorState, position: Vector2): MapEditorState {
  const assetId = state.activeAssetId;
  if (state.tool !== 'place' || !assetId) return state;
  const instanceId = nextNumericId(state.document.instances.map((i) => i.id), 'inst-');
  const instance: AssetInstance = {
    id: instanceId,
    assetVersionId: assetId,
    position: { x: position.x, z: position.z },
    rotationY: 0,
    scale: DEFAULT_INSTANCE_SCALE,
    terrainAnchor: 'surface',
  };
  const next: MapVersion = {
    ...state.document,
    instances: [...state.document.instances, instance],
  };
  return { ...commit(state, next), selectedId: instanceId };
}

export function moveInstance(state: MapEditorState, id: string, position: Vector2): MapEditorState {
  const index = state.document.instances.findIndex((i) => i.id === id);
  if (index < 0) return state;
  const instances = state.document.instances.map((instance, i) => (
    i === index
      ? { ...instance, position: { x: position.x, z: position.z } }
      : instance
  ));
  return commit(state, { ...state.document, instances });
}

export function duplicateInstance(state: MapEditorState, id: string): MapEditorState {
  const source = state.document.instances.find((i) => i.id === id);
  if (!source) return state;
  const newId = nextNumericId(state.document.instances.map((i) => i.id), 'inst-');
  const instance: AssetInstance = {
    ...source,
    id: newId,
    position: { x: source.position.x + 1, z: source.position.z + 1 },
  };
  const next: MapVersion = {
    ...state.document,
    instances: [...state.document.instances, instance],
  };
  return { ...commit(state, next), selectedId: newId };
}

export function deleteInstance(state: MapEditorState, id: string): MapEditorState {
  const next: MapVersion = {
    ...state.document,
    instances: state.document.instances.filter((i) => i.id !== id),
  };
  return { ...commit(state, next), selectedId: null };
}

/** Añade un spawn en la posición dada (tool 'spawn'). */
export function addSpawnPoint(state: MapEditorState, position: Vector2): MapEditorState {
  if (state.tool !== 'spawn') return state;
  const spawnId = nextNumericId(state.document.spawnPoints.map((s) => s.id), 'spawn-');
  const spawn: SpawnPoint = {
    id: spawnId,
    position: { x: position.x, z: position.z },
    radius: DEFAULT_SPAWN_RADIUS,
  };
  const next: MapVersion = {
    ...state.document,
    spawnPoints: [...state.document.spawnPoints, spawn],
  };
  return { ...commit(state, next), selectedId: spawnId };
}

export function moveSpawnPoint(state: MapEditorState, id: string, position: Vector2): MapEditorState {
  const index = state.document.spawnPoints.findIndex((s) => s.id === id);
  if (index < 0) return state;
  const spawnPoints = state.document.spawnPoints.map((spawn, i) => (
    i === index
      ? { ...spawn, position: { x: position.x, z: position.z } }
      : spawn
  ));
  return commit(state, { ...state.document, spawnPoints });
}

export function deleteSpawnPoint(state: MapEditorState, id: string): MapEditorState {
  const next: MapVersion = {
    ...state.document,
    spawnPoints: state.document.spawnPoints.filter((s) => s.id !== id),
  };
  return { ...commit(state, next), selectedId: null };
}

export function undo(state: MapEditorState): MapEditorState {
  const previous = state.undoStack[state.undoStack.length - 1];
  if (!previous) return state;
  return {
    ...state,
    document: previous,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, cloneDocument(state.document)],
    selectedId: null,
  };
}

export function redo(state: MapEditorState): MapEditorState {
  const next = state.redoStack[state.redoStack.length - 1];
  if (!next) return state;
  return {
    ...state,
    document: next,
    redoStack: state.redoStack.slice(0, -1),
    undoStack: [...state.undoStack, cloneDocument(state.document)],
    selectedId: null,
  };
}

export function getValidationIssues(state: MapEditorState): readonly MapValidationIssue[] {
  return validateMapVersion(state.document);
}

export function hasChanges(state: MapEditorState): boolean {
  return JSON.stringify(state.document) !== JSON.stringify(state.baseDocument);
}
