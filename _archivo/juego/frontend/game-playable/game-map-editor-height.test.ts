import { describe, expect, it } from 'vitest';
import {
  createMapEditorState,
  mergeCatalogIntoManifest,
  isAllowedHeight,
  TERRAIN_HEIGHT_VALUES,
  setTool,
  getValidationIssues,
  hasChanges,
  undo,
  redo,
  type TerrainHeightValue,
} from './game-map-editor-core';
import {
  paintHeight,
  setActiveHeight,
  terrainVertexAt,
} from './game-map-editor-height';
import { FIXTURE_MAP_VERSION } from './game-fixture-map';
import type { GameAssetAdminEntry } from '../../../../services/game-asset-admin.service';
import type { MapVersion } from '../../../game-core';

const CATALOG: readonly GameAssetAdminEntry[] = [
  { id: 'tree', displayName: 'Árbol', category: 'tree', isActive: true, createdAt: '2026-08-02T00:00:00Z' },
];

function makeState(): ReturnType<typeof createMapEditorState> {
  const base = mergeCatalogIntoManifest(FIXTURE_MAP_VERSION, CATALOG);
  return createMapEditorState(base, 3, CATALOG);
}

/* [297A-67] Documento con dos chunks adyacentes (0,0) y (1,0) para probar
 * vértices compartidos en el borde X y esquinas. */
function makeTwoChunkMap(): MapVersion {
  const heightCount = 17 * 17;
  const surfaceCount = 16 * 16;
  return {
    ...FIXTURE_MAP_VERSION,
    terrain: {
      schemaVersion: 1,
      bounds: { minX: -10, maxX: 22, minZ: -8, maxZ: 8 },
      cellSize: 1,
      chunkSize: 16,
      chunks: [
        {
          x: 0, z: 0,
          heights: Array.from({ length: heightCount }, (_, i) => i % 2 === 0 ? 0 : 0.5),
          surfaces: Array.from({ length: surfaceCount }, () => 0),
        },
        {
          x: 1, z: 0,
          heights: Array.from({ length: heightCount }, () => 0),
          surfaces: Array.from({ length: surfaceCount }, () => 0),
        },
      ],
    },
  };
}

/* [297A-67] Documento con 2×2 chunks (0,0),(1,0),(0,1),(1,1) para probar la
 * esquina compartida por cuatro chunks y el borde Z. */
function makeFourChunkMap(): MapVersion {
  const heightCount = 17 * 17;
  const surfaceCount = 16 * 16;
  const flat = (): { x: number; z: number }[] => [
    { x: 0, z: 0 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 1 },
  ];
  return {
    ...FIXTURE_MAP_VERSION,
    terrain: {
      schemaVersion: 1,
      bounds: { minX: -10, maxX: 22, minZ: -8, maxZ: 24 },
      cellSize: 1,
      chunkSize: 16,
      chunks: flat().map((c) => ({
        x: c.x, z: c.z,
        heights: Array.from({ length: heightCount }, () => 0),
        surfaces: Array.from({ length: surfaceCount }, () => 0),
      })),
    },
  };
}

describe('game-map-editor-height (297A-67)', () => {
  describe('terrainVertexAt', () => {
    it('resuelve un vértice interior a un único chunk con el índice local', () => {
      const refs = terrainVertexAt(FIXTURE_MAP_VERSION, { x: -9, z: -7 });
      /* bounds.minX=-10, cellSize=1 → vértice global (1,1) → chunk (0,0). */
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(1);
      expect(refs![0].chunk.x).toBe(0);
      expect(refs![0].chunk.z).toBe(0);
      expect(refs![0].index).toBe(1 * 17 + 1);
    });

    it('devuelve refs a ambos chunks para un vértice del borde X compartido', () => {
      const refs = terrainVertexAt(makeTwoChunkMap(), { x: 6, z: -7 });
      /* Vértice global (16,1): borde derecho del chunk (0,0) y borde
       * izquierdo del chunk (1,0). */
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(2);
      const xs = refs!.map((ref) => ref.chunk.x).sort();
      expect(xs).toEqual([0, 1]);
      const rightEdge = refs!.find((ref) => ref.chunk.x === 0)!;
      const leftEdge = refs!.find((ref) => ref.chunk.x === 1)!;
      expect(rightEdge.index).toBe(1 * 17 + 16);
      expect(leftEdge.index).toBe(1 * 17 + 0);
    });

    it('devuelve refs a ambos chunks para un vértice del borde Z compartido', () => {
      const refs = terrainVertexAt(makeFourChunkMap(), { x: -9, z: 8 });
      /* Vértice global (1,16): borde inferior del chunk (0,0) y borde superior
       * del chunk (0,1). */
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(2);
      const zs = refs!.map((ref) => ref.chunk.z).sort();
      expect(zs).toEqual([0, 1]);
      const lower = refs!.find((ref) => ref.chunk.z === 0)!;
      const upper = refs!.find((ref) => ref.chunk.z === 1)!;
      expect(lower.index).toBe(16 * 17 + 1);
      expect(upper.index).toBe(0 * 17 + 1);
    });

    it('devuelve refs a los cuatro chunks para una esquina compartida', () => {
      const refs = terrainVertexAt(makeFourChunkMap(), { x: 6, z: 8 });
      /* Vértice global (16,16): esquina común a (0,0),(1,0),(0,1),(1,1). */
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(4);
      const keys = refs!.map((ref) => `${ref.chunk.x}:${ref.chunk.z}`).sort();
      expect(keys).toEqual(['0:0', '0:1', '1:0', '1:1']);
      /* Cada chunk la ve en su índice local de esquina. */
      const c00 = refs!.find((ref) => ref.chunk.x === 0 && ref.chunk.z === 0)!;
      const c10 = refs!.find((ref) => ref.chunk.x === 1 && ref.chunk.z === 0)!;
      const c01 = refs!.find((ref) => ref.chunk.x === 0 && ref.chunk.z === 1)!;
      const c11 = refs!.find((ref) => ref.chunk.x === 1 && ref.chunk.z === 1)!;
      expect(c00.index).toBe(16 * 17 + 16);
      expect(c10.index).toBe(16 * 17 + 0);
      expect(c01.index).toBe(0 * 17 + 16);
      expect(c11.index).toBe(0 * 17 + 0);
    });

    it('resuelve el vértice del borde derecho del mundo aunque el chunk primario no exista', () => {
      const refs = terrainVertexAt(makeTwoChunkMap(), { x: 22, z: -7 });
      /* bounds maxX=22, cellSize=1 → totalCellsX=32 → gvx=32; el chunk
       * "primario" (2,0) no existe; solo el (1,0) lo contiene en localX=16. */
      expect(refs).not.toBeNull();
      expect(refs).toHaveLength(1);
      expect(refs![0].chunk.x).toBe(1);
      expect(refs![0].index).toBe(1 * 17 + 16);
    });

    it('falla cerrado fuera de bounds', () => {
      expect(terrainVertexAt(FIXTURE_MAP_VERSION, { x: 500, z: 500 })).toBeNull();
      expect(terrainVertexAt(FIXTURE_MAP_VERSION, { x: -9, z: 500 })).toBeNull();
    });
  });

  describe('paintHeight', () => {
    it('pinta el vértice bajo el cursor y commitea una vez', () => {
      let state = makeState();
      state = setTool(state, 'height');
      state = setActiveHeight(state, 1);
      const before = state.document.terrain.chunks[0].heights[1 * 17 + 1];
      state = paintHeight(state, { x: -9, z: -7 }, 1);
      expect(state.document.terrain.chunks[0].heights[1 * 17 + 1]).toBe(1);
      expect(before).not.toBe(1);
      expect(state.undoStack).toHaveLength(1);
      expect(getValidationIssues(state)).toHaveLength(0);
    });

    it('pinta el vértice compartido en AMBOS chunks para no descuadrar bordes', () => {
      let state = createMapEditorState(makeTwoChunkMap(), 0, CATALOG);
      state = setTool(state, 'height');
      state = paintHeight(state, { x: 6, z: -7 }, 2);
      const chunk0 = state.document.terrain.chunks.find((c) => c.x === 0)!;
      const chunk1 = state.document.terrain.chunks.find((c) => c.x === 1)!;
      expect(chunk0.heights[1 * 17 + 16]).toBe(2);
      expect(chunk1.heights[1 * 17 + 0]).toBe(2);
      expect(state.undoStack).toHaveLength(1);
    });

    it('pinta la esquina compartida en los CUATRO chunks (sin descuadres)', () => {
      let state = createMapEditorState(makeFourChunkMap(), 0, CATALOG);
      state = setTool(state, 'height');
      state = paintHeight(state, { x: 6, z: 8 }, 3);
      const byKey = new Map(state.document.terrain.chunks.map((c) => [`${c.x}:${c.z}`, c]));
      expect(byKey.get('0:0')!.heights[16 * 17 + 16]).toBe(3);
      expect(byKey.get('1:0')!.heights[16 * 17 + 0]).toBe(3);
      expect(byKey.get('0:1')!.heights[0 * 17 + 16]).toBe(3);
      expect(byKey.get('1:1')!.heights[0 * 17 + 0]).toBe(3);
      /* Un solo commit para toda la operación. */
      expect(state.undoStack).toHaveLength(1);
      expect(getValidationIssues(state)).toHaveLength(0);
    });

    it('no pinta si la herramienta no es height', () => {
      let state = makeState();
      state = setTool(state, 'select');
      const before = state.document.terrain.chunks[0].heights[1 * 17 + 1];
      state = paintHeight(state, { x: -9, z: -7 }, 1);
      expect(state.document.terrain.chunks[0].heights[1 * 17 + 1]).toBe(before);
      expect(state.undoStack).toHaveLength(0);
    });

    it('no pinta niveles fuera del allowlist (fail-closed)', () => {
      let state = makeState();
      state = setTool(state, 'height');
      const before = state.document.terrain.chunks[0].heights[1 * 17 + 1];
      state = paintHeight(state, { x: -9, z: -7 }, 12 as TerrainHeightValue);
      expect(state.document.terrain.chunks[0].heights[1 * 17 + 1]).toBe(before);
      expect(state.undoStack).toHaveLength(0);
    });

    it('no commitea si el vértice ya tiene esa altura (arrastre limpio)', () => {
      let state = makeState();
      state = setTool(state, 'height');
      state = paintHeight(state, { x: -9, z: -7 }, 1);
      expect(state.undoStack).toHaveLength(1);
      state = paintHeight(state, { x: -9, z: -7 }, 1);
      expect(state.undoStack).toHaveLength(1);
    });

    it('deshacer/rehacer restaura la altura pintada', () => {
      /* Documento plano (no el fixture ondulado) para una base determinista. */
      let state = createMapEditorState(makeTwoChunkMap(), 0, CATALOG);
      state = setTool(state, 'height');
      state = paintHeight(state, { x: -9, z: -7 }, 1);
      expect(state.document.terrain.chunks[0].heights[1 * 17 + 1]).toBe(1);
      state = undo(state);
      expect(state.document.terrain.chunks[0].heights[1 * 17 + 1]).toBe(0);
      state = redo(state);
      expect(state.document.terrain.chunks[0].heights[1 * 17 + 1]).toBe(1);
    });

    it('hasChanges detecta el pintado de altura', () => {
      let state = makeState();
      expect(hasChanges(state)).toBe(false);
      state = setTool(state, 'height');
      state = paintHeight(state, { x: -9, z: -7 }, 1);
      expect(hasChanges(state)).toBe(true);
    });

    it('setActiveHeight actualiza el nivel activo sin tocar el documento', () => {
      let state = makeState();
      state = setActiveHeight(state, 2.5);
      expect(state.activeHeight).toBe(2.5);
      expect(state.document).toBe(state.baseDocument);
    });

    it('isAllowedHeight valida solo los niveles discretos del contrato', () => {
      for (const value of TERRAIN_HEIGHT_VALUES) {
        expect(isAllowedHeight(value)).toBe(true);
      }
      expect(isAllowedHeight(-1)).toBe(false);
      expect(isAllowedHeight(7)).toBe(false);
      expect(isAllowedHeight(Number.NaN)).toBe(false);
    });
  });
});
