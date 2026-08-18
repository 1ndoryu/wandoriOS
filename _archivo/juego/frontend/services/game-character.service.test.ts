import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameCharacterService, isValidCharacter } from './game-character.service';

describe('GameCharacterService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads only the exact active allowlisted character contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        id: 'forest-scout',
        displayName: 'Explorador',
        bodyTone: 'ink',
      },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameCharacterService.list()).resolves.toEqual([
      expect.objectContaining({ id: 'forest-scout', bodyTone: 'ink' }),
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/game/characters');
  });

  it('rejects inactive, unknown-tone, and extra-field definitions', () => {
    const base = {
      id: 'forest-scout',
      displayName: 'Explorador',
      bodyTone: 'ink',

    };
    expect(isValidCharacter(base)).toBe(true);
    expect(isValidCharacter({ ...base, isActive: false })).toBe(false);
    expect(isValidCharacter({ ...base, bodyTone: 'script' })).toBe(false);
    expect(isValidCharacter({ ...base, script: 'alert(1)' })).toBe(false);
  });

  it('preserves the lifecycle abort signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 'forest-scout', displayName: 'Explorador', bodyTone: 'ink' },
    ]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameCharacterService.list({ signal: controller.signal });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });
});
