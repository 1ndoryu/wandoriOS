/* wandori.us — RebaseOverlay Tests
 * [Auditoría v4 §6.1] rebaseOverlay extraído de merge.test.ts para respetar
 * el limite de lineas por archivo (300). */

import { describe, it, expect } from "vitest";
import { rebaseOverlay } from "./merge";
import type { WorkspaceTree, WorkspaceOverlay } from "./types";

const emptyOverlay: WorkspaceOverlay = {
  version: 1,
  addedItems: {},
  fieldOverrides: {},
  tombstones: [],
};

describe('rebaseOverlay', () => {
  const oldRelease: WorkspaceTree = {
    version: 1,
    nodes: {
      a: { id: 'a', parentId: 'desktop', type: 'folder', label: 'A', requires: 'public' },
      b: { id: 'b', parentId: 'desktop', type: 'folder', label: 'B', requires: 'public' },
    },
  };

  const newRelease: WorkspaceTree = {
    version: 2,
    nodes: {
      a: { id: 'a', parentId: 'desktop', type: 'folder', label: 'A v2', requires: 'public' },
      // b fue eliminado en el nuevo release
      c: { id: 'c', parentId: 'desktop', type: 'app', label: 'C', requires: 'public' },
    },
  };

  it('debe retornar mismo overlay si no hay cambios necesarios', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: [], // sin tombstones que referencien nodos eliminados
    };
    const result = rebaseOverlay(oldRelease, overlay);
    expect(result).toBe(overlay); // misma referencia si no cambió
  });

  it('debe remover tombstones de nodos que ya no existen en nuevo release', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['b', 'no-existe'],
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.tombstones).not.toContain('b'); // b no existe en newRelease
    expect(result.tombstones).not.toContain('no-existe'); // nunca existió
    expect(result.tombstones).toHaveLength(0);
  });

  it('debe preservar tombstones de nodos que aún existen', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['a'], // a aún existe en newRelease
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.tombstones).toContain('a');
  });

  it('debe remover fieldOverrides de nodos que ya no existen', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      fieldOverrides: {
        b: { label: 'B renamed' }, // b no existe en newRelease
      },
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.fieldOverrides['b']).toBeUndefined();
  });

  it('debe preservar fieldOverrides de nodos que aún existen', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      fieldOverrides: {
        a: { position: { col: 10, row: 10 } }, // a existe en newRelease
      },
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.fieldOverrides['a']).toBeDefined();
    expect(result.fieldOverrides['a'].position).toEqual({ col: 10, row: 10 });
  });

  it('debe preservar overrides de nodos creados por el usuario durante rebase', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      addedItems: {
        userItem: { id: 'userItem', parentId: 'desktop', type: 'folder', label: 'Usuario', requires: 'public' },
      },
      fieldOverrides: {
        userItem: { position: { col: 4, row: 2 }, label: 'Usuario editado' },
      },
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.fieldOverrides.userItem).toEqual({
      position: { col: 4, row: 2 },
      label: 'Usuario editado',
    });
  });

  it('debe preservar addedItems durante rebase', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      addedItems: {
        userItem: { id: 'userItem', parentId: 'desktop', type: 'folder', label: 'Usuario', requires: 'public' },
      },
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.addedItems['userItem']).toBeDefined();
  });

  it('debe preservar overrides de nodos admin dinámicos (ADMIN_NODES) durante rebase', () => {
    /* [297A-29] Regresión: el release publicado puede no incluir un nodo admin
     * (p. ej. mediaLibrary), pero el merge lo inyecta desde ADMIN_NODES. El
     * override de su posición debe sobrevivir al rebase; si se descartaba, el
     * overlay remoto quedaba distinto del local → falso conflicto. */
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      fieldOverrides: {
        mediaLibrary: { position: { col: 2, row: 1 } },
      },
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.fieldOverrides['mediaLibrary']).toEqual({ position: { col: 2, row: 1 } });
  });

  it('debe preservar tombstones de nodos admin dinámicos (ADMIN_NODES) durante rebase', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['mediaLibrary'],
    };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.tombstones).toContain('mediaLibrary');
  });

  it('debe preservar version del overlay', () => {
    const overlay: WorkspaceOverlay = { ...emptyOverlay, version: 2 };
    const result = rebaseOverlay(newRelease, overlay);
    expect(result.version).toBe(2);
  });
});
