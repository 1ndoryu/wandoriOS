import { afterEach, describe, expect, it } from 'vitest';
import { getChildren, workspaceStore } from './workspace-store';
import type { ResolvedWorkspace } from './types';

const originalWorkspace = workspaceStore.get();

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
