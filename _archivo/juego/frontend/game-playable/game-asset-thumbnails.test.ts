/* 138A-14 — Tests del servicio de miniaturas 3D del explorador de assets.
 * En jsdom no hay contexto WebGL, así que se mockea SOLO `WebGLRenderer`
 * (clase con canvas real y métodos no-op) vía importOriginal; el resto de
 * Three (geometrías, materiales, cámaras) se usa real para cubrir el mismo
 * camino que pinta el documento. El fallback sin WebGL queda cubierto por el
 * panel (game-constructor-assets) en el resto de la suite. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORLD_PALETTE_DEFAULTS } from '../../../game-core';
import {
  assetThumbnailKey,
  buildAssetThumbnailMeshData,
  disposeAssetThumbnails,
  hasRealAssetMesh,
  requestAssetThumbnail,
  type AssetThumbnailRequest,
} from './game-asset-thumbnails';

/* Contadores accesibles desde la factory del mock (hoisted antes de importar
 * el módulo bajo test, que importa `three`). */
const { rendererState } = vi.hoisted(() => ({
  rendererState: { instances: 0, renders: 0 },
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class MockWebGLRenderer {
    readonly domElement: HTMLCanvasElement;
    readonly setClearColor: () => void = () => undefined;
    readonly setSize: () => void = () => undefined;
    readonly render: () => void = () => {
      rendererState.renders += 1;
    };
    readonly dispose: () => void = () => undefined;
    readonly forceContextLoss: () => void = () => undefined;

    constructor() {
      rendererState.instances += 1;
      this.domElement = document.createElement('canvas');
      /* jsdom no implementa toDataURL sin el paquete `canvas`; el stub
       * mantiene el pipeline (render → data URL) testeable. */
      this.domElement.toDataURL = () => 'data:image/png;base64,QUFBQQ==';
    }
  }
  return { ...actual, WebGLRenderer: MockWebGLRenderer } as unknown as typeof actual;
});

function makeRequest(
  overrides: Partial<AssetThumbnailRequest> = {},
): AssetThumbnailRequest {
  return {
    assetId: 'asset-tree',
    category: 'tree',
    style: 'bloques',
    palette: WORLD_PALETTE_DEFAULTS,
    ...overrides,
  };
}

afterEach(() => {
  disposeAssetThumbnails();
  rendererState.instances = 0;
  rendererState.renders = 0;
});

describe('hasRealAssetMesh (138A-14)', () => {
  it('solo árboles y rocas tienen mesher real del documento', () => {
    expect(hasRealAssetMesh('tree')).toBe(true);
    expect(hasRealAssetMesh('rock')).toBe(true);
    expect(hasRealAssetMesh('terrain')).toBe(false);
    expect(hasRealAssetMesh('water')).toBe(false);
    expect(hasRealAssetMesh('character')).toBe(false);
    expect(hasRealAssetMesh('generic')).toBe(false);
  });
});

describe('assetThumbnailKey (138A-14)', () => {
  it('depende de asset, estilo y paleta; estable para la misma petición', () => {
    expect(assetThumbnailKey(makeRequest())).toBe(assetThumbnailKey(makeRequest()));
    expect(assetThumbnailKey(makeRequest({ assetId: 'asset-rock' })))
      .not.toBe(assetThumbnailKey(makeRequest()));
    expect(assetThumbnailKey(makeRequest({ style: 'suave' })))
      .not.toBe(assetThumbnailKey(makeRequest()));
    expect(assetThumbnailKey(makeRequest({
      palette: { ...WORLD_PALETTE_DEFAULTS, leaf: 0x123456 },
    }))).not.toBe(assetThumbnailKey(makeRequest()));
  });
});

describe('buildAssetThumbnailMeshData (138A-14)', () => {
  it('genera la malla real determinista para árboles y rocas en ambos estilos', () => {
    for (const category of ['tree', 'rock'] as const) {
      for (const style of ['bloques', 'suave'] as const) {
        const first = buildAssetThumbnailMeshData(makeRequest({ category, style }));
        expect(first).not.toBeNull();
        if (!first) continue;
        expect(first.positions.length).toBeGreaterThan(0);
        expect(first.normals.length).toBe(first.positions.length);
        expect(first.colors.length).toBe(first.positions.length);
        if (first.indexed) {
          expect(first.indices?.length).toBeGreaterThan(0);
        }
        const second = buildAssetThumbnailMeshData(makeRequest({ category, style }));
        expect(second).toEqual(first);
      }
    }
  });

  it('devuelve null para assets sin mesher real', () => {
    expect(buildAssetThumbnailMeshData(makeRequest({ category: 'water' }))).toBeNull();
  });
});

describe('requestAssetThumbnail (138A-14)', () => {
  it('renderiza PNG offscreen (lazy) y la segunda petición sale del caché síncrono', async () => {
    const onReady = vi.fn();
    requestAssetThumbnail(makeRequest(), onReady);
    /* Lazy: el drenaje ocurre en idle/timeout, no en la llamada. */
    expect(onReady).not.toHaveBeenCalled();

    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const [dataUrl] = onReady.mock.calls[0] as [string | null];
    expect(dataUrl).toMatch(/^data:image\/png/);
    expect(rendererState.instances).toBe(1);
    expect(rendererState.renders).toBe(1);

    const onReadyCached = vi.fn();
    requestAssetThumbnail(makeRequest(), onReadyCached);
    expect(onReadyCached).toHaveBeenCalledTimes(1);
    expect(onReadyCached.mock.calls[0][0]).toBe(dataUrl);
    /* Caché: no se crea otro renderer ni se vuelve a renderizar. */
    expect(rendererState.instances).toBe(1);
    expect(rendererState.renders).toBe(1);
  });

  it('dispose notifica pendientes con null y un nuevo montaje reutiliza el servicio', async () => {
    const pending = vi.fn();
    requestAssetThumbnail(makeRequest(), pending);
    disposeAssetThumbnails();
    expect(pending).toHaveBeenCalledTimes(1);
    expect(pending.mock.calls[0][0]).toBeNull();
    /* El drenaje pendiente se canceló: nunca se llegó a crear el renderer. */
    expect(rendererState.instances).toBe(0);

    const onReady = vi.fn();
    requestAssetThumbnail(makeRequest(), onReady);
    await vi.waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(onReady.mock.calls[0][0]).toMatch(/^data:image\/png/);
    expect(rendererState.instances).toBe(1);
  });
});
