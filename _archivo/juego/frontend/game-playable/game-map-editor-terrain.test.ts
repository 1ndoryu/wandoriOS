import { describe, expect, it } from 'vitest';
import {
  createMapEditorState,
  mergeCatalogIntoManifest,
  setTool,
  getValidationIssues,
  hasChanges,
  undo,
} from './game-map-editor-core';
import {
  addTerrainChunk,
  canCreateChunk,
  terrainChunkAt,
} from './game-map-editor-terrain';
import { FIXTURE_MAP_VERSION } from './game-fixture-map';
import type { GameAssetAdminEntry } from '../../../../services/game-asset-admin.service';

const CATALOG: readonly GameAssetAdminEntry[] = [
  { id: 'tree', displayName: 'Árbol', category: 'tree', isActive: true, createdAt: '2026-08-02T00:00:00Z' },
];

function makeState(): ReturnType<typeof createMapEditorState> {
  const base = mergeCatalogIntoManifest(FIXTURE_MAP_VERSION, CATALOG);
  return createMapEditorState(base, 3, CATALOG);
}

describe('game-map-editor-terrain (297A-69)', () => {
  it('resuelve las coordenadas de chunk bajo una posición de mundo', () => {
    const state = makeState();
    /* bounds.minX=-10, cellSize=1 → mundo x=-9 → celda global 1 → chunk 0. */
    expect(terrainChunkAt(state.document, { x: -9, z: -7 })).toEqual({ x: 0, z: 0 });
    /* Mundo x=7 → celda global 17 → chunk 1. */
    expect(terrainChunkAt(state.document, { x: 7, z: -7 })).toEqual({ x: 1, z: 0 });
  });

  it('no crea un chunk que ya existe (fail-closed)', () => {
    let state = makeState();
    state = setTool(state, 'terrain');
    const before = state.document.terrain.chunks.length;
    state = addTerrainChunk(state, { x: 0, z: 0 });
    expect(state.document.terrain.chunks).toHaveLength(before);
    expect(state.undoStack).toHaveLength(0);
  });

  it('no crea un chunk con coordenadas negativas (sin reindexar)', () => {
    let state = makeState();
    state = setTool(state, 'terrain');
    const before = state.document.terrain.chunks.length;
    state = addTerrainChunk(state, { x: -1, z: 0 });
    expect(state.document.terrain.chunks).toHaveLength(before);
    expect(canCreateChunk(state.document, { x: -1, z: 0 })).toBe(false);
  });

  it('no crea un chunk hueco no contiguo al rectángulo actual', () => {
    let state = makeState();
    state = setTool(state, 'terrain');
    /* Fixture cubre x=0..1; el chunk (3,0) dejaría un hueco en (2,0). */
    expect(canCreateChunk(state.document, { x: 3, z: 0 })).toBe(false);
  });

  it('crea un chunk contiguo a la derecha y expande maxX', () => {
    let state = makeState();
    state = setTool(state, 'terrain');
    expect(canCreateChunk(state.document, { x: 2, z: 0 })).toBe(true);
    const beforeMaxX = state.document.terrain.bounds.maxX;
    state = addTerrainChunk(state, { x: 2, z: 0 });
    expect(state.document.terrain.chunks).toHaveLength(FIXTURE_MAP_VERSION.terrain.chunks.length + 1);
    expect(state.document.terrain.bounds.maxX).toBeGreaterThan(beforeMaxX);
    /* El chunk nuevo es plano y válido. */
    const created = state.document.terrain.chunks.find((c) => c.x === 2 && c.z === 0)!;
    expect(created).toBeDefined();
    expect(created.heights.every((h) => h === 0)).toBe(true);
    expect(created.surfaces.every((s) => s === 0)).toBe(true);
    expect(getValidationIssues(state)).toHaveLength(0);
    expect(state.undoStack).toHaveLength(1);
  });

  it('crea un chunk contiguo hacia abajo (maxZ) y undo lo retira', () => {
    let state = makeState();
    state = setTool(state, 'terrain');
    /* El fixture cubre z=0..0; el chunk (0,1) es el contiguo hacia abajo
     * (z=2 dejaría un hueco en z=1). */
    expect(canCreateChunk(state.document, { x: 0, z: 2 })).toBe(false);
    expect(canCreateChunk(state.document, { x: 0, z: 1 })).toBe(true);
    state = addTerrainChunk(state, { x: 0, z: 1 });
    expect(state.document.terrain.chunks.some((c) => c.x === 0 && c.z === 1)).toBe(true);
    expect(getValidationIssues(state)).toHaveLength(0);
    state = undo(state);
    expect(state.document.terrain.chunks.some((c) => c.x === 0 && c.z === 1)).toBe(false);
    expect(hasChanges(state)).toBe(false);
  });

  it('no crea si la herramienta no es terrain', () => {
    let state = makeState();
    state = setTool(state, 'select');
    const before = state.document.terrain.chunks.length;
    state = addTerrainChunk(state, { x: 2, z: 0 });
    expect(state.document.terrain.chunks).toHaveLength(before);
  });
});
