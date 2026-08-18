import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKY_DEFAULTS, WORLD_PALETTE_DEFAULTS, type TerrainOptions, type WorldPalette } from '../../../game-core';
import { buildColorPanel } from './game-constructor-color';
import type { ConstructorPanelContext } from './game-world-constructor';

function createCtx(overrides: Partial<Omit<ConstructorPanelContext, 'style' | 'commitStyle' | 'syncStyle'>> = {}): {
  readonly ctx: ConstructorPanelContext;
  readonly onPalette: ReturnType<typeof vi.fn<(palette: WorldPalette) => void>>;
  readonly runSync: () => void;
  /** Simula la restauración externa (applyPalette de la sección). */
  readonly setExternalPalette: (next: WorldPalette) => void;
} {
  let palette = { ...WORLD_PALETTE_DEFAULTS };
  let paletteSyncers: Array<() => void> = [];
  const onPalette = vi.fn<(palette: WorldPalette) => void>();
  const ctx: ConstructorPanelContext = {
    state: {} as TerrainOptions,
    commit: () => {},
    sync: () => {},
    get palette() { return palette; },
    commitPalette: (next) => {
      palette = { ...next };
      onPalette(palette);
    },
    syncPalette: (fn) => { paletteSyncers.push(fn); },
    worldMap: null,
    commitObjectEdits: () => {},
    commitToonRamp: () => {},
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
  return {
    ctx,
    onPalette,
    runSync: () => { for (const fn of paletteSyncers) fn(); },
    setExternalPalette: (next) => { palette = { ...next }; },
  };
}

describe('panel de Color del constructor (138A-8)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('lista los 13 tokens de la paleta con sus valores por defecto', () => {
    const { ctx } = createCtx();
    buildColorPanel(host, ctx);
    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="color"]'));
    expect(inputs).toHaveLength(13);
    expect(inputs[0].value).toBe('#86c65c'); /* grass */
    expect(host.textContent).toContain('Cielo');
  });

  it('aplica un color en tiempo real con commitPalette', () => {
    const { ctx, onPalette } = createCtx();
    buildColorPanel(host, ctx);
    const grass = host.querySelector<HTMLInputElement>('input[type="color"]');
    expect(grass).not.toBeNull();
    if (!grass) return;
    grass.value = '#112233';
    grass.dispatchEvent(new Event('input'));
    expect(onPalette).toHaveBeenCalledTimes(1);
    expect(onPalette.mock.calls[0][0].grass).toBe(0x112233);
  });

  it('restaurar vuelve a los defaults y sincroniza los pickers', () => {
    const { ctx, onPalette } = createCtx();
    buildColorPanel(host, ctx);
    const grass = host.querySelector<HTMLInputElement>('input[type="color"]');
    if (!grass) return;
    grass.value = '#112233';
    grass.dispatchEvent(new Event('input'));
    expect(onPalette).toHaveBeenCalledTimes(1);

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
    buttons.find(button => button.textContent === 'Restaurar paleta')?.click();
    expect(onPalette).toHaveBeenCalledTimes(2);
    expect(onPalette.mock.calls[1][0]).toEqual(WORLD_PALETTE_DEFAULTS);
    expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#86c65c');
  });

  it('el sincronizador externo actualiza los pickers sin disparar cambios', () => {
    const { ctx, onPalette, runSync, setExternalPalette } = createCtx();
    buildColorPanel(host, ctx);
    setExternalPalette({ ...WORLD_PALETTE_DEFAULTS, grass: 0xabcdef });
    runSync();
    expect(host.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe('#abcdef');
    expect(onPalette).not.toHaveBeenCalled();
  });
});
