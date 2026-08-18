import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderGamePlayable } from './game-playable';
import type { GameCharacterDefinition } from '../../../../api/types';

/* [297A-25] Validación del teardown de la primera app WebGL del OS.
 * El ADR de carga de apps pesadas exige: destroy() idempotente y abortable,
 * liberar RAF, listeners, observers, socket y recursos GPU al cerrar. Este
 * test monta el runtime real con los servicios de red y la escena mockeados
 * y verifica que destroy() retira los hooks de plataforma y que una segunda
 * llamada es un no-op. Los timers son REALES (no useFakeTimers): vitest
 * fakea requestAnimationFrame/cancelAnimationFrame y pisaría los stubs. */

const CHARACTERS: GameCharacterDefinition[] = [
  {
    id: 'forest-scout',
    displayName: 'Explorador',
    bodyTone: 'ink',
  },
];

vi.mock('../../../../services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services')>();
  return {
    ...actual,
    GameCharacterService: {
      list: vi.fn(async () => CHARACTERS),
    },
    GameProfileService: {
      get: vi.fn(async () => ({ displayName: 'Explorador', characterId: 'forest-scout', revision: 1 })),
    },
  };
});

vi.mock('../../../../services/game-map-admin.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/game-map-admin.service')>();
  return {
    ...actual,
    GameMapAdminService: {
      ...actual.GameMapAdminService,
      getActive: vi.fn(async () => null),
    },
  };
});

/* La escena Three real no se monta en jsdom: se sustituye por un handle fake
 * que appendea su canvas al host (como hace la escena real) y registra su
 * destroy. El teardown de Three (geometrías/materiales/renderer/context loss)
 * ya está cubierto en game-playable-scene.ts y su destroy propio. */
vi.mock('./game-playable-scene', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./game-playable-scene')>();
  return {
    ...actual,
    mountGamePlayableScene: vi.fn((host: HTMLElement) => {
      const canvas = document.createElement('canvas');
      host.appendChild(canvas);
      return {
        canvas,
        update: () => {},
        resize: () => {},
        render: () => {},
        getCameraAzimuth: () => 0,
        streamingStats: () => ({ visibleChunks: 0, visibleInstances: 0 }),
        rendererMetrics: () => ({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0 }),
        batchStats: () => ({ drawCalls: 0, sourceMeshes: 0 }),
        gpuIdentity: () => null,
        gpuFrameMs: () => null,
        gpuMemoryEstimate: () => ({ textureBytes: 0, geometryBytes: 0 }),
        destroy: () => {
          canvas.remove();
        },
      };
    }),
  };
});

/* WebGL no existe en jsdom: el probe debe reportar disponible para que el
 * runtime monte el loop (y así su teardown sea verificable). */
vi.mock('./game-webgl-capabilities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./game-webgl-capabilities')>();
  return {
    ...actual,
    detectWebGL: vi.fn(() => ({ available: true, kind: 'webgl2' })),
  };
});

/* [297A-25] Instrumenta add/removeEventListener de window/document con
 * vi.spyOn para contar altas/bajas por tipo. El spy cuenta y DELEGA al
 * original (el runtime debe seguir registrando listeners reales); al ser
 * spies, afterEach los restaura con vi.restoreAllMocks (una asignación
 * directa no se restauraría y contaminaría los tests siguientes). */
function hookCounts(): {
  windowAdds: Map<string, number>;
  windowRemoves: Map<string, number>;
  documentAdds: Map<string, number>;
  documentRemoves: Map<string, number>;
} {
  const windowAdds = new Map<string, number>();
  const windowRemoves = new Map<string, number>();
  const documentAdds = new Map<string, number>();
  const documentRemoves = new Map<string, number>();
  const track = (map: Map<string, number>, type: string): void => {
    map.set(type, (map.get(type) ?? 0) + 1);
  };
  const originalWindowAdd = window.addEventListener.bind(window);
  const originalWindowRemove = window.removeEventListener.bind(window);
  const originalDocumentAdd = document.addEventListener.bind(document);
  const originalDocumentRemove = document.removeEventListener.bind(document);
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    track(windowAdds, type);
    return originalWindowAdd(type, listener, options);
  });
  vi.spyOn(window, 'removeEventListener').mockImplementation((type, listener, options) => {
    track(windowRemoves, type);
    return originalWindowRemove(type, listener, options);
  });
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    track(documentAdds, type);
    return originalDocumentAdd(type, listener, options);
  });
  vi.spyOn(document, 'removeEventListener').mockImplementation((type, listener, options) => {
    track(documentRemoves, type);
    return originalDocumentRemove(type, listener, options);
  });
  return { windowAdds, windowRemoves, documentAdds, documentRemoves };
}

let rafCalls: number[] = [];
let cafCalls: number[] = [];
let observeFn: ReturnType<typeof vi.fn> = vi.fn();
let disconnectFn: ReturnType<typeof vi.fn> = vi.fn();
let socketClose: ReturnType<typeof vi.fn> = vi.fn();
let socketRemoveListener: ReturnType<typeof vi.fn> = vi.fn();

beforeEach(() => {
  rafCalls = [];
  cafCalls = [];
  observeFn = vi.fn();
  disconnectFn = vi.fn();
  socketClose = vi.fn();
  socketRemoveListener = vi.fn();
  let rafId = 0;
  /* RAF que EJECUTA el callback con un timeout real (un frame por vuelta),
   * para que el loop del runtime gire de verdad mientras está vivo: así el
   * test de “no re-agenda tras destroy” es significativo (si el destroy
   * olvidara cancelar o el callback re-agendara, rafCalls crecería). Sin
   * esto el callback nunca correría y la aserción sería trivialmente cierta. */
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafId += 1;
    rafCalls.push(rafId);
    window.setTimeout(() => callback(performance.now()), 4);
    return rafId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => cafCalls.push(id));
  vi.stubGlobal('ResizeObserver', class {
    observe = observeFn;
    unobserve = vi.fn();
    disconnect = disconnectFn;
  });
  /* Stub mínimo del WebSocket real: el runtime añade/remueve listeners de
   * evento y cierra el socket en destroy. addEventListener también se stubbea
   * porque connect() lo usa; sin él el path realtime lanzaría en jsdom. */
  const socketAddListener = vi.fn();
  vi.stubGlobal('WebSocket', class {
    close = socketClose;
    addEventListener = socketAddListener;
    removeEventListener = socketRemoveListener;
    constructor(public url: string) {}
  } as unknown as typeof WebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.textContent = '';
});

async function mountRuntime(): Promise<{ controller: AbortController; view: ReturnType<typeof renderGamePlayable> }> {
  const controller = new AbortController();
  const view = renderGamePlayable({ signal: controller.signal });
  document.body.appendChild(view.element);
  /* Esperar la hidratación (perfil + mapa + escena) con timers reales. */
  await new Promise((resolve) => setTimeout(resolve, 30));
  return { controller, view };
}

describe('Bosque — teardown de la primera app WebGL (297A-25)', () => {
  it('destroy() es idempotente y deja el DOM sin canvas ni controles', async () => {
    const { view } = await mountRuntime();
    expect(view.element.querySelector('canvas')).not.toBeNull();
    expect(view.element.querySelector('[aria-label="Controles de movimiento"]')).not.toBeNull();

    view.destroy?.();
    view.destroy?.(); /* segunda llamada: no-op, no lanza */

    expect(view.element.querySelector('canvas')).toBeNull();
    expect(view.element.querySelector('[aria-label="Controles de movimiento"]')).toBeNull();
  });

  it('cancela el RAF pendiente al destruir y no re-agenda tras destroy', async () => {
    const { view } = await mountRuntime();
    expect(rafCalls.length).toBeGreaterThan(0);
    expect(cafCalls.length).toBe(0);


    view.destroy?.();
    expect(cafCalls.length).toBeGreaterThan(0);
    expect(cafCalls.at(-1)).toBe(rafCalls.at(-1));

    /* El loop no re-agenda tras destroy. */
    const rafAfter = rafCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(rafCalls.length).toBe(rafAfter);
  });

  it('remueve listeners de ventana y documento al destruir', async () => {
    const counts = hookCounts();
    const { view } = await mountRuntime();
    expect((counts.windowAdds.get('keydown') ?? 0)
      + (counts.windowAdds.get('keyup') ?? 0)
      + (counts.windowAdds.get('blur') ?? 0)).toBeGreaterThan(0);
    expect(counts.documentAdds.get('visibilitychange') ?? 0).toBeGreaterThan(0);

    view.destroy?.();
    expect(counts.windowRemoves.get('keydown') ?? 0).toBe(counts.windowAdds.get('keydown') ?? 0);
    expect(counts.windowRemoves.get('keyup') ?? 0).toBe(counts.windowAdds.get('keyup') ?? 0);
    expect(counts.windowRemoves.get('blur') ?? 0).toBe(counts.windowAdds.get('blur') ?? 0);
    expect(counts.documentRemoves.get('visibilitychange') ?? 0).toBe(counts.documentAdds.get('visibilitychange') ?? 0);
  });

  it('desconecta el ResizeObserver y cierra el socket realtime', async () => {
    const { view } = await mountRuntime();
    expect(observeFn!).toHaveBeenCalled();
    expect(socketRemoveListener!).not.toHaveBeenCalled();

    view.destroy?.();
    expect(disconnectFn!).toHaveBeenCalled();
    expect(socketClose!).toHaveBeenCalled();
    expect(socketRemoveListener!).toHaveBeenCalled();
  });

  it('no monta recursos si el signal ya fue abortado (fail-closed)', () => {
    const controller = new AbortController();
    controller.abort();
    const view = renderGamePlayable({ signal: controller.signal });
    expect(view.element.querySelector('canvas')).toBeNull();
    expect(view.element.querySelector('[aria-label="Controles de movimiento"]')).toBeNull();
    view.destroy?.();
  });
});
