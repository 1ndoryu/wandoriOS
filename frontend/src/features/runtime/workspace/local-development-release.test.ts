import { describe, expect, it } from 'vitest';
import { DEFAULT_RELEASE } from './default-release';
import { withLocalPrototypeNodes } from './local-development-release';
import type { WorkspaceTree } from './types';

describe('local development release compatibility', () => {
  it('restores the playable forest entry when an old local release omits it', () => {
    const oldRelease: WorkspaceTree = {
      version: 2,
      nodes: { about: DEFAULT_RELEASE.nodes.about },
    };

    const resolved = withLocalPrototypeNodes(oldRelease);

    expect(resolved.nodes.gamePlayable?.refId).toBe('game-playable');
    /* Los bocetos game/game-3d se retiraron el 05-ago. */
    expect(resolved.nodes.game).toBeUndefined();
    expect(resolved.nodes.game3d).toBeUndefined();
    expect(resolved.version).toBe(2);
  });

  it('does not overwrite an entry already organized by the release', () => {
    const organized = {
      ...DEFAULT_RELEASE.nodes.gamePlayable,
      label: 'Bosque organizado',
      position: { col: 7, row: 4 },
    };
    const release: WorkspaceTree = {
      version: 3,
      nodes: { gamePlayable: organized },
    };

    const resolved = withLocalPrototypeNodes(release);

    expect(resolved.nodes.gamePlayable).toEqual(organized);
  });
});
