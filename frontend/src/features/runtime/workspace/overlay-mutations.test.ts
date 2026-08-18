import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  moveMobileNodesPosition,
  moveNodesPosition,
  moveNodePosition,
} from './overlay-mutations';
import { getChildren, overlayStore, workspaceStore } from './workspace-store';
import type { ResolvedWorkspace } from './types';

const originalWorkspace = workspaceStore.get();

beforeEach(() => {
  overlayStore.set({ version: 1, addedItems: {}, fieldOverrides: {}, tombstones: [] });
});

afterEach(() => {
  workspaceStore.set(originalWorkspace);
});

describe('workspace child projection', () => {
  it('no impone el orden móvil a Finder ni a otras superficies de contenido', () => {
    const fixture: ResolvedWorkspace = {
      releaseVersion: 1,
      nodes: {
        first: {
          id: 'first', parentId: 'folder', type: 'resource', label: 'Primero',
          mobileOrder: 99, origin: 'release',
        },
        second: {
          id: 'second', parentId: 'folder', type: 'resource', label: 'Segundo',
          mobileOrder: 0, origin: 'release',
        },
      },
    };
    workspaceStore.set(fixture);

    expect(getChildren('folder').map((node) => node.id)).toEqual(['first', 'second']);
  });
});

describe('separación de posiciones móvil vs desktop (297A-22)', () => {
  it('moveMobileNodesPosition escribe solo mobilePosition, nunca position desktop', () => {
    moveMobileNodesPosition([{ nodeId: 'icono-a', mobilePosition: { col: 1, row: 2 } }]);
    const override = overlayStore.get().fieldOverrides['icono-a'];
    expect(override?.mobilePosition).toEqual({ col: 1, row: 2 });
    expect(override?.position).toBeUndefined();
  });

  it('moveNodesPosition escribe solo position desktop, nunca mobilePosition', () => {
    moveNodesPosition([{ nodeId: 'icono-a', position: { col: 3, row: 0 } }]);
    const override = overlayStore.get().fieldOverrides['icono-a'];
    expect(override?.position).toEqual({ col: 3, row: 0 });
    expect(override?.mobilePosition).toBeUndefined();
  });

  it('moveNodePosition mantiene intacto un mobilePosition previo (Finder no lo hereda)', () => {
    moveMobileNodesPosition([{ nodeId: 'icono-a', mobilePosition: { col: 1, row: 2 } }]);
    moveNodePosition('icono-a', { col: 0, row: 4 });
    const override = overlayStore.get().fieldOverrides['icono-a'];
    expect(override?.position).toEqual({ col: 0, row: 4 });
    expect(override?.mobilePosition).toEqual({ col: 1, row: 2 });
  });

  it('no muta el store con una lista vacía de movimientos', () => {
    const before = overlayStore.get();
    moveMobileNodesPosition([]);
    moveNodesPosition([]);
    expect(overlayStore.get()).toBe(before);
  });
});
