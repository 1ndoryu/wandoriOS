import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../api/client';
import { authStore } from '../../../../store';
/* [GAME-01-VIS] El comando game:character (editor del jugador) vive en el
 * toolbar de la ventana; se registra con este side-effect del módulo. */
import { CommandRegistry } from '../../../runtime/command-registry';
import '../../../runtime/commands/toolbar-commands';

const mocks = vi.hoisted(() => ({
  detectWebGL: vi.fn(),
  mountGamePlayableScene: vi.fn(),
  createGameInput: vi.fn(),
  cancelAnimationFrame: vi.fn(),
  getGameProfile: vi.fn(),
  listGameCharacters: vi.fn(),
  resolvePlayableMap: vi.fn(),
}));

vi.mock('./game-webgl-capabilities', () => ({ detectWebGL: mocks.detectWebGL }));
vi.mock('./game-playable-scene', () => ({ mountGamePlayableScene: mocks.mountGamePlayableScene }));
vi.mock('./game-playable-input', () => ({ createGameInput: mocks.createGameInput }));
/* [297A-65] El resolver del mapa jugable se mockea: el runtime recibe una
 * resolución determinista (publicada o fixture) sin red. */
vi.mock('./game-map-source', () => ({ resolvePlayableMap: mocks.resolvePlayableMap }));
vi.mock('../../../../services', () => ({
  GameCharacterService: { list: mocks.listGameCharacters },
  GameProfileService: { get: mocks.getGameProfile },
}));

import { FIXTURE_MAP, FIXTURE_MAP_VERSION } from './game-fixture-map';

import { renderGamePlayable } from './game-playable';

async function flushHydration(): Promise<void> {
  /* [297A-51] La rehidratación encadena más continuaciones que la carga única;
   * se vacía la cola de microtareas varias veces. */
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

describe('Bosque playable WebGL lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'init');
    mocks.getGameProfile.mockResolvedValue({ displayName: 'Guardián', characterId: 'forest-scout', revision: 0, updatedAt: '2026-08-02T00:00:00Z' });
    mocks.listGameCharacters.mockResolvedValue([
      { id: 'forest-scout', displayName: 'Explorador', bodyTone: 'ink' },
      { id: 'forest-ranger', displayName: 'Guardabosques', bodyTone: 'middle' },
      { id: 'forest-spirit', displayName: 'Espíritu', bodyTone: 'paper' },
    ]);
    mocks.detectWebGL.mockReturnValue({ available: false, reason: 'WebGL bloqueado en el dispositivo' });
    mocks.createGameInput.mockImplementation(() => ({
      controls: document.createElement('div'),
      getDirection: () => ({ x: 0, z: 0 }),
      destroy: vi.fn(),
    }));
    mocks.mountGamePlayableScene.mockImplementation(() => ({
      canvas: document.createElement('canvas'),
      update: vi.fn(),
      resize: vi.fn(),
      render: vi.fn(),
      getCameraAzimuth: () => 0,
      streamingStats: () => ({ cacheSize: 0, visibleChunks: 0, visibleInstances: 0, visibleAssets: 0 }),
      rendererMetrics: () => ({
        rendererInfoAvailable: true,
        rendererMemoryAvailable: true,
        drawCalls: 0,
        triangles: 0,
        lines: 0,
        points: 0,
        geometries: 0,
        textures: 0,
      }),
      destroy: vi.fn(),
    }));
    /* [297A-65] Por defecto el mapa es el fixture offline (sin publicación). */
    mocks.resolvePlayableMap.mockResolvedValue({
      map: {
        document: FIXTURE_MAP_VERSION,
        world: FIXTURE_MAP,
        label: 'fixture',
        version: 0,
        fromFixture: true,
      },
      warning: false,
    });
    vi.stubGlobal('ResizeObserver', class {
      observe(): void {}
      disconnect(): void {}
    });
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 7));
    vi.stubGlobal('cancelAnimationFrame', mocks.cancelAnimationFrame);
  });

  it('loads the validated profile before deciding whether WebGL can mount', async () => {
    const view = renderGamePlayable({ signal: new AbortController().signal });

    expect(view.element.querySelector('canvas')).toBeNull();
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent)
      .toContain('cargando perfil');
    expect(mocks.detectWebGL).not.toHaveBeenCalled();

    await flushHydration();

    expect(mocks.getGameProfile).toHaveBeenCalledOnce();
    expect(mocks.detectWebGL).toHaveBeenCalledOnce();
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent)
      .toContain('WebGL bloqueado');
    expect(view.element.dataset.playerName).toBe('Guardián');
    expect(view.element.dataset.characterId).toBe('forest-scout');
    view.destroy?.();
  });

  it('exposes the player character editor through the toolbar command, without scene text', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    mocks.getGameProfile.mockResolvedValue({
      displayName: 'Guardián',
      characterId: 'forest-scout',
      revision: 3,
      updatedAt: '2026-08-02T00:00:00Z',
    });

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();

    /* [GAME-01-VIS] El texto flotante se retiró de la escena; el editor del
     * jugador se abre desde el toolbar (comando público game:character). */
    expect(Array.from(view.element.querySelectorAll('button'))
      .some(button => button.textContent === 'personaje')).toBe(false);
    const command = CommandRegistry.get('game:character');
    expect(command).toBeDefined();
    expect(command?.isAvailable?.({ capability: 'public', presentationMode: 'desktop' }))
      .toEqual({ state: 'enabled' });
    expect(view.element.dataset.playerName).toBe('Guardián');

    view.destroy?.();
    expect(mocks.mountGamePlayableScene.mock.results[0]?.value.destroy).toHaveBeenCalledOnce();
  });

  it('keeps a revoked account out of guest realtime and preserves the warning state', async () => {
    authStore.set({ isAuthenticated: true, userId: 'account-1', capability: 'authenticated' }, 'sync');
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    mocks.getGameProfile.mockRejectedValue(new ApiError(401, { error: 'unauthorized' }, 'API Error: 401'));

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();

    expect(view.element.dataset.playerName).toBe('Jugador');
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent)
      .toContain('sesión expirada');
    expect((view.element.querySelector('.juegoFixture__estado') as HTMLElement).dataset.state).toBe('error');
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledOnce();
    view.destroy?.();
  });

  it('re-hydrates and reconnects when a guest logs in while the game is open', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    mocks.getGameProfile
      .mockRejectedValueOnce(new ApiError(401, { error: 'unauthorized' }, 'API Error: 401'))
      .mockResolvedValueOnce({ displayName: 'Guardiana', characterId: 'forest-ranger', revision: 0, updatedAt: '2026-08-02T00:00:00Z' });

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();

    expect(view.element.dataset.playerName).toBe('Jugador');
    expect(view.element.dataset.characterId).toBe('forest-scout');
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(1);

    authStore.set({ isAuthenticated: true, userId: 'account-9', capability: 'authenticated' }, 'user');
    await flushHydration();

    expect(mocks.getGameProfile).toHaveBeenCalledTimes(2);
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(2);
    expect(mocks.mountGamePlayableScene.mock.results[0]?.value.destroy).toHaveBeenCalledOnce();
    expect(view.element.dataset.playerName).toBe('Guardiana');
    expect(view.element.dataset.characterId).toBe('forest-ranger');
    view.destroy?.();
  });

  it('re-hydrates as guest on logout without leaking the previous account identity', async () => {
    authStore.set({ isAuthenticated: true, userId: 'account-1', capability: 'authenticated' }, 'sync');
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    mocks.getGameProfile
      .mockResolvedValueOnce({ displayName: 'Guardián', characterId: 'forest-scout', revision: 0, updatedAt: '2026-08-02T00:00:00Z' })
      .mockRejectedValueOnce(new ApiError(401, { error: 'unauthorized' }, 'API Error: 401'));

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();
    expect(view.element.dataset.playerName).toBe('Guardián');

    authStore.set({ isAuthenticated: false, userId: null, capability: 'public' }, 'user');
    await flushHydration();

    expect(mocks.getGameProfile).toHaveBeenCalledTimes(2);
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(2);
    expect(mocks.mountGamePlayableScene.mock.results[0]?.value.destroy).toHaveBeenCalledOnce();
    expect(view.element.dataset.playerName).toBe('Jugador');
    expect(view.element.dataset.characterId).toBe('forest-scout');
    view.destroy?.();
  });

  it('cancels an in-flight profile load when the session changes and mounts once', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    let resolveProfile: ((profile: { displayName: string; characterId: string; revision: number; updatedAt: string }) => void) | undefined;
    mocks.getGameProfile.mockImplementationOnce(() => new Promise(resolve => { resolveProfile = resolve; }));
    mocks.getGameProfile.mockResolvedValue({ displayName: 'Guardiana', characterId: 'forest-ranger', revision: 0, updatedAt: '2026-08-02T00:00:00Z' });

    const view = renderGamePlayable({ signal: new AbortController().signal });
    authStore.set({ isAuthenticated: true, userId: 'account-5', capability: 'authenticated' }, 'user');
    resolveProfile?.({ displayName: 'Tarde', characterId: 'forest-scout', revision: 0, updatedAt: '2026-08-02T00:00:00Z' });
    await flushHydration();

    expect(mocks.getGameProfile).toHaveBeenCalledTimes(2);
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(1);
    expect(view.element.dataset.playerName).toBe('Guardiana');
    expect(view.element.dataset.characterId).toBe('forest-ranger');
    view.destroy?.();
  });

  it('does not re-hydrate after the view is destroyed', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(1);

    view.destroy?.();
    authStore.set({ isAuthenticated: true, userId: 'account-7', capability: 'authenticated' }, 'user');
    await flushHydration();

    expect(mocks.getGameProfile).toHaveBeenCalledTimes(1);
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(1);
    expect(mocks.mountGamePlayableScene.mock.results[0]?.value.destroy).toHaveBeenCalledOnce();
  });

  it('cleans hydration handles when the catalog has no valid character', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const controller = new AbortController();
    const removeAbortSpy = vi.spyOn(controller.signal, 'removeEventListener');
    mocks.listGameCharacters.mockResolvedValue([]);

    const view = renderGamePlayable({ signal: controller.signal });
    await flushHydration();

    expect(mocks.getGameProfile).toHaveBeenCalledOnce();
    expect(mocks.detectWebGL).not.toHaveBeenCalled();
    expect(mocks.mountGamePlayableScene).not.toHaveBeenCalled();
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent)
      .toContain('personaje no disponible');
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(removeAbortSpy).toHaveBeenCalledOnce();
    view.destroy?.();
  });

  it('aborts the profile request and clears its timeout before resolution', async () => {
    let resolveProfile: ((profile: { displayName: string; characterId: string; revision: number; updatedAt: string }) => void) | undefined;
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    mocks.getGameProfile.mockReturnValue(new Promise(resolve => { resolveProfile = resolve; }));
    const controller = new AbortController();
    const view = renderGamePlayable({ signal: controller.signal });

    controller.abort();
    resolveProfile?.({ displayName: 'Tarde', characterId: 'forest-scout', revision: 0, updatedAt: '2026-08-02T00:00:00Z' });
    await flushHydration();

    expect(mocks.detectWebGL).not.toHaveBeenCalled();
    expect(mocks.createGameInput).not.toHaveBeenCalled();
    expect(mocks.mountGamePlayableScene).not.toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    view.destroy?.();
  });

  it('mounts and destroys the playable view repeatedly without retaining handles', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });

    const views = Array.from({ length: 12 }, () => renderGamePlayable({ signal: new AbortController().signal }));
    await flushHydration();
    views.forEach(view => view.destroy?.());

    expect(mocks.createGameInput).toHaveBeenCalledTimes(12);
    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(12);
    for (const result of mocks.createGameInput.mock.results) {
      expect(result.value.destroy).toHaveBeenCalledOnce();
    }
    for (const result of mocks.mountGamePlayableScene.mock.results) {
      expect(result.value.destroy).toHaveBeenCalledOnce();
    }
  });

  it('stops the frame loop and exposes an accessible error after context loss', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });

    const controller = new AbortController();
    const view = renderGamePlayable({ signal: controller.signal });
    await flushHydration();
    const contextLost = new Event('webglcontextlost', { cancelable: true });
    mocks.mountGamePlayableScene.mock.results[0]?.value.canvas.dispatchEvent(contextLost);

    expect(contextLost.defaultPrevented).toBe(true);
    expect(mocks.cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent)
      .toContain('perdió el contexto 3D');
    expect((view.element.querySelector('.juegoFixture__estado') as HTMLElement | null)?.dataset.state).toBe('error');

    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(globalThis.requestAnimationFrame).toHaveBeenCalledTimes(1);

    view.destroy?.();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    expect(mocks.createGameInput.mock.results[0]?.value.destroy).toHaveBeenCalledOnce();
    expect(mocks.mountGamePlayableScene.mock.results[0]?.value.destroy).toHaveBeenCalledOnce();
  });

  it('mounts the runtime with the published map when a release exists', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    /* [297A-65] Publicación activa v2: el runtime recibe su documento y su
     * mundo, no el fixture; el estado expone la etiqueta de versión. */
    const publishedDocument = { ...FIXTURE_MAP_VERSION, id: 'bosque', spawnPoints: [{ id: 'spawn-publicada', position: { x: 2, z: 3 }, radius: 0.4 }] };
    mocks.resolvePlayableMap.mockResolvedValue({
      map: {
        document: publishedDocument,
        world: FIXTURE_MAP,
        label: 'v2',
        version: 2,
        fromFixture: false,
      },
      warning: false,
    });

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();

    const [host, world, document] = mocks.mountGamePlayableScene.mock.calls[0];
    expect(host).toBe(view.element.querySelector('.juegoFixture__escena'));
    expect(world).toBe(FIXTURE_MAP);
    expect(document).toBe(publishedDocument);
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent).toContain('v2');
    view.destroy?.();
  });

  it('keeps playing on the fixture with a warning when the map cannot be resolved', async () => {
    mocks.detectWebGL.mockReturnValue({ available: true, kind: 'webgl2' });
    /* [297A-65] Fallo de red/5xx: fail-closed al fixture, la vista lo comunica
     * como error de mapa sin bloquear el juego. */
    mocks.resolvePlayableMap.mockResolvedValue({
      map: {
        document: FIXTURE_MAP_VERSION,
        world: FIXTURE_MAP,
        label: 'fixture',
        version: 0,
        fromFixture: true,
      },
      warning: true,
    });

    const view = renderGamePlayable({ signal: new AbortController().signal });
    await flushHydration();

    expect(mocks.mountGamePlayableScene).toHaveBeenCalledTimes(1);
    expect(view.element.querySelector('.juegoFixture__estado')?.textContent).toContain('mapa no disponible');
    expect((view.element.querySelector('.juegoFixture__estado') as HTMLElement | null)?.dataset.state).toBe('error');
    view.destroy?.();
  });
});
