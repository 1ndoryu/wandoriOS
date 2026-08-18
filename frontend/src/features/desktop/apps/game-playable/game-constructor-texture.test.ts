import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKY_DEFAULTS, type TerrainOptions, type WorldPalette } from '../../../game-core';
import { buildTexturePanel } from './game-constructor-texture';
import type { ConstructorPanelContext } from './game-world-constructor';

function createCtx(overrides: Partial<Omit<ConstructorPanelContext, 'style' | 'commitStyle' | 'syncStyle'>> = {}): {
  readonly ctx: ConstructorPanelContext;
  readonly onToonRamp: ReturnType<typeof vi.fn<(dataUrl: string | null) => void>>;
} {
  const onToonRamp = vi.fn<(dataUrl: string | null) => void>();
  const ctx: ConstructorPanelContext = {
    state: {} as TerrainOptions,
    commit: () => {},
    sync: () => {},
    palette: {} as WorldPalette,
    commitPalette: () => {},
    syncPalette: () => {},
    worldMap: null,
    commitObjectEdits: () => {},
    commitToonRamp: (dataUrl) => { onToonRamp(dataUrl); },
    syncMap: () => {},
    layers: [],
    commitLayers: () => {},
    syncLayers: () => {},
    syncBrush: () => {},
    brush: {
      active: false,
      kind: 'path',
      radius: 2,
      strength: 1,
      falloff: 'smooth',
      targetLayerId: null,
      height: 1,
      direction: 'raise',
      mode: 'add',
    },
    commitBrush: () => {},
    grass: { enabled: true, density: 1, size: 1, color: 0x86c65c },
    commitGrass: () => {},
    syncGrass: () => {},
    sky: { ...SKY_DEFAULTS },
    commitSky: () => {},
    syncSky: () => {},
    style: { key: 'bosque', ink: false },
    commitStyle: () => {},
    syncStyle: () => {},
    ...overrides,
  };
  return { ctx, onToonRamp };
}

describe('panel de Textura del constructor (138A-8)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('aplica una URL http válida con commitToonRamp', () => {
    const { ctx, onToonRamp } = createCtx();
    buildTexturePanel(host, ctx);
    const url = host.querySelector<HTMLInputElement>('input[type="url"]');
    expect(url).not.toBeNull();
    if (!url) return;
    url.value = 'https://ejemplo.test/textura.png';
    clickText('Aplicar URL');
    expect(onToonRamp).toHaveBeenCalledWith('https://ejemplo.test/textura.png');
    expect(host.textContent).toContain('textura aplicada');
  });

  it('aplica una URL data:image y rechaza URLs no válidas', () => {
    const { ctx, onToonRamp } = createCtx();
    buildTexturePanel(host, ctx);
    const url = host.querySelector<HTMLInputElement>('input[type="url"]');
    if (!url) return;
    url.value = 'data:image/png;base64,abc';
    clickText('Aplicar URL');
    expect(onToonRamp).toHaveBeenCalledWith('data:image/png;base64,abc');

    url.value = 'ftp://no.test/x.png';
    clickText('Aplicar URL');
    expect(host.textContent).toContain('URL no válida');
    expect(onToonRamp).toHaveBeenCalledTimes(1);

    url.value = '   ';
    clickText('Aplicar URL');
    expect(host.textContent).toContain('escribe una URL');
    expect(onToonRamp).toHaveBeenCalledTimes(1);
  });

  it('restaurar vuelve a la rampa procedural (null)', () => {
    const { ctx, onToonRamp } = createCtx();
    buildTexturePanel(host, ctx);
    clickText('Restaurar rampa');
    expect(onToonRamp).toHaveBeenCalledWith(null);
    expect(host.textContent).toContain('rampa procedural restaurada');
  });

  function clickText(text: string): void {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent === text);
    expect(button).not.toBeNull();
    button?.click();
  }
});
