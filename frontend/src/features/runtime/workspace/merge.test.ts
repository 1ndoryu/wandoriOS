/* wandori.us — Workspace Merge Tests
 * [Auditoría v4 §6.1] Primeros tests del proyecto.
 * merge.ts es lógica pura (sin side effects, sin DOM, sin API) — perfecta para testing.
 * Cubre: merge básico, tombstones recursivos, field overrides, capability filtering,
 * added items, rebase overlay, orphan detection. */

import { describe, it, expect } from 'vitest';
import { mergeWorkspace } from './merge';
import type { WorkspaceTree, WorkspaceOverlay, WorkspaceNode } from './types';

/* === Fixtures === */

const emptyRelease: WorkspaceTree = { version: 1, nodes: {} };

const simpleRelease: WorkspaceTree = {
  version: 1,
  nodes: {
    folder1: { id: 'folder1', parentId: 'desktop', type: 'folder', label: 'Carpeta 1', position: { col: 0, row: 0 }, requires: 'public' },
    folder2: { id: 'folder2', parentId: 'desktop', type: 'folder', label: 'Carpeta 2', position: { col: 1, row: 0 }, requires: 'public' },
    adminNode: { id: 'adminNode', parentId: 'desktop', type: 'app', label: 'Admin', refId: 'admin', position: { col: 0, row: 1 }, requires: 'admin' },
    article1: { id: 'article1', parentId: 'folder1', type: 'resource', label: 'Artículo 1', refId: 'uuid-1', requires: 'public' },
    subFolder: { id: 'subFolder', parentId: 'folder1', type: 'folder', label: 'Subcarpeta', requires: 'public' },
    nestedItem: { id: 'nestedItem', parentId: 'subFolder', type: 'resource', label: 'Anidado', refId: 'uuid-2', requires: 'public' },
  },
};

const emptyOverlay: WorkspaceOverlay = {
  version: 1,
  addedItems: {},
  fieldOverrides: {},
  tombstones: [],
};

/* === mergeWorkspace Tests === */

describe('mergeWorkspace', () => {
  it('debe devolver release vacío si no hay nodos', () => {
    const result = mergeWorkspace(emptyRelease, emptyOverlay, 'public');
    expect(result.releaseVersion).toBe(1);
    expect(Object.keys(result.nodes)).toHaveLength(0);
  });

  it('debe clonar todos los nodos del release', () => {
    const result = mergeWorkspace(simpleRelease, emptyOverlay, 'public');
    expect(Object.keys(result.nodes)).toHaveLength(5); // 6 nodos - 1 admin-filtered
    expect(result.nodes.folder1).toBeDefined();
    expect(result.nodes.folder1.origin).toBe('release');
  });

  it('debe añadir origin: release a nodos clonados', () => {
    const result = mergeWorkspace(simpleRelease, emptyOverlay, 'public');
    expect(result.nodes.folder1.origin).toBe('release');
  });

  it('debe aplicar tombstones (eliminar nodos)', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['folder1'],
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(result.nodes.folder1).toBeUndefined();
    expect(result.nodes.folder2).toBeDefined();
  });

  it('debe eliminar descendientes recursivamente al aplicar tombstone', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['folder1'],
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(result.nodes.folder1).toBeUndefined();
    expect(result.nodes.article1).toBeUndefined();
    expect(result.nodes.subFolder).toBeUndefined();
    expect(result.nodes.nestedItem).toBeUndefined();
  });

  it('debe aplicar fieldOverrides a nodos existentes', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      fieldOverrides: {
        folder2: { label: 'Carpeta Renombrada', position: { col: 5, row: 5 } },
      },
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(result.nodes.folder2.label).toBe('Carpeta Renombrada');
    expect(result.nodes.folder2.position).toEqual({ col: 5, row: 5 });
  });

  it('debe añadir nodos de addedItems con origin: overlay', () => {
    const newFolder: WorkspaceNode = {
      id: 'new-folder',
      parentId: 'desktop',
      type: 'folder',
      label: 'Nueva carpeta',
      requires: 'public',
    };
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      addedItems: { 'new-folder': newFolder },
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(result.nodes['new-folder']).toBeDefined();
    expect(result.nodes['new-folder'].label).toBe('Nueva carpeta');
    expect(result.nodes['new-folder'].origin).toBe('overlay');
  });

  /* [297A-20] La posición de un nodo creado por el usuario (addedItem) también
   * debe resolverse desde fieldOverrides, como en nodos del release. */
  it('debe aplicar fieldOverrides de posición móvil sin alterar la desktop', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      fieldOverrides: {
        folder1: { mobilePosition: { col: 1, row: 2 } },
      },
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(result.nodes.folder1.mobilePosition).toEqual({ col: 1, row: 2 });
    expect(result.nodes.folder1.position).toEqual({ col: 0, row: 0 });
  });

  it('debe aplicar fieldOverrides de posición a nodos addedItems', () => {
    const newFolder: WorkspaceNode = {
      id: 'new-folder',
      parentId: 'desktop',
      type: 'folder',
      label: 'Nueva carpeta',
      requires: 'public',
    };
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      addedItems: { 'new-folder': newFolder },
      fieldOverrides: { 'new-folder': { position: { col: 3, row: 2 } } },
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(result.nodes['new-folder'].position).toEqual({ col: 3, row: 2 });
  });

  it('debe filtrar nodos admin para usuario public', () => {
    const result = mergeWorkspace(simpleRelease, emptyOverlay, 'public');
    expect(result.nodes.adminNode).toBeUndefined();
  });

  it('debe mostrar nodos admin para usuario admin', () => {
    const result = mergeWorkspace(simpleRelease, emptyOverlay, 'admin');
    expect(result.nodes.adminNode).toBeDefined();
    expect(result.nodes.adminNode.label).toBe('Admin');
  });

  it('debe ocultar nodos con capacidad corrupta por fail-closed', () => {
    const release: WorkspaceTree = {
      version: 1,
      nodes: {
        poisoned: {
          id: 'poisoned', parentId: 'desktop', type: 'app', label: 'Poisoned',
          requires: 'unknown' as 'public',
        },
      },
    };
    const result = mergeWorkspace(release, emptyOverlay, 'admin');
    expect(result.nodes.poisoned).toBeUndefined();
  });

  /* Edge cases */
  it('debe ignorar tombstones de nodos que no existen', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['no-existe'],
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    expect(Object.keys(result.nodes)).toHaveLength(5); // unchanged
  });

  it('debe ignorar fieldOverrides de nodos que no existen', () => {
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      fieldOverrides: { 'no-existe': { label: 'X' } },
    };
    const result = mergeWorkspace(simpleRelease, overlay, 'public');
    // No debe fallar ni añadir nodos nuevos
    expect(result.nodes['no-existe']).toBeUndefined();
  });

  it('debe preservar releaseVersion correcta', () => {
    const release: WorkspaceTree = { version: 5, nodes: {} };
    const result = mergeWorkspace(release, emptyOverlay, 'public');
    expect(result.releaseVersion).toBe(5);
  });

  it('tombstone de nodo padre elimina tambien nodos con parentId null (independentes)', () => {
    // Crear release con nodos huerfanos (parentId null)
    const release: WorkspaceTree = {
      version: 1,
      nodes: {
        orphan1: { id: 'orphan1', parentId: null, type: 'folder', label: 'Huerfano 1', requires: 'public' },
        orphan2: { id: 'orphan2', parentId: null, type: 'folder', label: 'Huerfano 2', requires: 'public' },
      },
    };
    // Tombstone no deberia afectar nodos con parentId null
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      tombstones: ['orphan1'],
    };
    const result = mergeWorkspace(release, overlay, 'public');
    expect(result.nodes.orphan1).toBeUndefined();
    expect(result.nodes.orphan2).toBeDefined();
  });

  it('addedItems con mismo ID que release node no reemplaza el release', () => {
    const release: WorkspaceTree = {
      version: 1,
      nodes: {
        item: { id: 'item', parentId: 'desktop', type: 'folder', label: 'Original', requires: 'public' },
      },
    };
    const overlayNode: WorkspaceNode = {
      id: 'item', // Mismo ID
      parentId: 'desktop',
      type: 'folder',
      label: 'Overlay',
      requires: 'public',
    };
    const overlay: WorkspaceOverlay = {
      ...emptyOverlay,
      addedItems: { item: overlayNode },
    };
    const result = mergeWorkspace(release, overlay, 'public');
    /* El namespace publicado tiene precedencia: el overlay colisionado se
     * ignora para impedir reemplazar silenciosamente una app/recurso. */
    expect(result.nodes.item).toBeDefined();
    expect(result.nodes.item.origin).toBe('release');
    expect(result.nodes.item.label).toBe('Original');
  });
});
