import { describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE } from './default-release';
import { withLocalPrototypeNodes } from './local-development-release';
import type { WorkspaceTree } from './types';

describe('local development release compatibility', () => {
  /* [2026-08-18] El frente de juego quedó archivado en _archivo/juego: la
   * compatibilidad local ya no añade nodos de prototipo. La función queda
   * como passthrough. */
  it('passes the tree through unchanged (sin nodos de prototipo)', () => {
    const release: WorkspaceTree = {
      version: 2,
      nodes: { about: DEFAULT_RELEASE.nodes.about },
    };

    const resolved = withLocalPrototypeNodes(release);

    expect(resolved).toEqual(release);
    expect(resolved.nodes.gamePlayable).toBeUndefined();
    expect(resolved.nodes.game).toBeUndefined();
    expect(resolved.nodes.game3d).toBeUndefined();
    expect(resolved.version).toBe(2);
  });
});
