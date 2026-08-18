import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '../store';
import { ApiError } from '../api/client';
import { GameProfileService, isValidGameProfile } from './game-profile.service';

describe('GameProfileService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authStore.set({ isAuthenticated: true, userId: 'user-1', capability: 'authenticated' }, 'sync');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads a bounded camelCase profile and sends credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      displayName: 'Guardián',
      characterId: 'forest-scout',
      revision: 2,
      updatedAt: '2026-08-02T00:00:00Z',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameProfileService.get()).resolves.toEqual({
      displayName: 'Guardián',
      characterId: 'forest-scout',
      revision: 2,
      updatedAt: '2026-08-02T00:00:00Z',
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/game/profile');
    expect(init.credentials).toBe('include');
    expect(init.signal).toBeUndefined();
  });

  it('preserves abort signals and rejects malformed successful responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      displayName: 'x'.repeat(25),
      characterId: 'forest-scout',
      revision: 0,
      updatedAt: 'now',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(GameProfileService.get({ signal: controller.signal }))
      .rejects.toThrow('Respuesta de perfil de juego inválida');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('keeps the guest boundary as an unauthorized API error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    ));

    try {
      await GameProfileService.get();
      throw new Error('se esperaba 401');
    } catch (error: unknown) {
      expect(error).toEqual(expect.any(ApiError));
      expect(error).toMatchObject({ status: 401 });
    }
    expect(authStore.get().capability).toBe('public');
  });

  it('updates the profile via PUT with the optimistic revision contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      displayName: 'Guardián',
      characterId: 'forest-ranger',
      revision: 1,
      updatedAt: '2026-08-02T00:00:00Z',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(GameProfileService.update({
      displayName: 'Guardián',
      characterId: 'forest-ranger',
      expectedRevision: 0,
    })).resolves.toEqual(expect.objectContaining({ characterId: 'forest-ranger', revision: 1 }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/game/profile');
    expect(init.method).toBe('PUT');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: 'Guardián',
      characterId: 'forest-ranger',
      expectedRevision: 0,
    });
  });

  it('preserves the abort signal on profile updates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      displayName: 'Guardián',
      characterId: 'forest-scout',
      revision: 1,
      updatedAt: 'now',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await GameProfileService.update(
      { displayName: 'Guardián', characterId: 'forest-scout', expectedRevision: 0 },
      { signal: controller.signal },
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
  });

  it('validates profile shape before the game consumes it', () => {
    expect(isValidGameProfile({ displayName: 'Jugador', characterId: 'forest-scout', revision: 0, updatedAt: 'now' })).toBe(true);
    expect(isValidGameProfile({ displayName: 'Ju\u200Bgador', characterId: 'forest-scout', revision: 0, updatedAt: 'now' })).toBe(false);
    expect(isValidGameProfile({ displayName: ' Jugador', characterId: 'forest-scout', revision: 0, updatedAt: 'now' })).toBe(false);
    expect(isValidGameProfile({ displayName: 'Jugador', characterId: 'Admin', revision: 0, updatedAt: 'now' })).toBe(false);
    expect(isValidGameProfile({ displayName: ' ', characterId: 'forest-scout', revision: 0, updatedAt: 'now' })).toBe(false);
    expect(isValidGameProfile({ displayName: 'Jugador', characterId: 'forest-scout', revision: -1, updatedAt: 'now' })).toBe(false);
    expect(isValidGameProfile({ displayName: 'Jugador', characterId: 'forest-scout', revision: 0, updatedAt: 7 })).toBe(false);
  });
});
