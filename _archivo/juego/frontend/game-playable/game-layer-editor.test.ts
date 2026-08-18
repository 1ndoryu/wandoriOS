import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKY_DEFAULTS, type TerrainLayer, type TerrainOptions } from '../../../game-core';
import {
  buildLayerEditorPanel,
  createCircleLayer,
  createPaintedLayer,
} from './game-layer-editor';
import { DEFAULT_BRUSH_STATE, type ConstructorBrushState } from './game-layer-brush';
import type { ConstructorPanelContext } from './game-world-constructor';

function createCtx(overrides: {
  style?: 'bloques' | 'suave';
  layers?: readonly TerrainLayer[];
  brush?: ConstructorBrushState;
} = {}): {
  readonly ctx: ConstructorPanelContext;
  readonly onCommitLayers: ReturnType<typeof vi.fn>;
  readonly onCommitBrush: ReturnType<typeof vi.fn>;
  readonly applyLayers: (layers: readonly TerrainLayer[]) => void;
  readonly applyBrush: (brush: ConstructorBrushState) => void;
} {
  const { style = 'suave', layers = [], brush = { ...DEFAULT_BRUSH_STATE } } = overrides;
  let currentLayers = [...layers];
  let currentBrush = { ...brush };
  const onCommitLayers = vi.fn((next: readonly TerrainLayer[]) => { currentLayers = [...next]; });
  const onCommitBrush = vi.fn((next: ConstructorBrushState) => { currentBrush = { ...next }; });
  const layerSyncers: Array<() => void> = [];
  const brushSyncers: Array<() => void> = [];
  const ctx: ConstructorPanelContext = {
    state: { style } as TerrainOptions,
    commit: () => {},
    sync: () => {},
    palette: {} as ConstructorPanelContext['palette'],
    commitPalette: () => {},
    syncPalette: () => {},
    worldMap: null,
    commitObjectEdits: () => {},
    commitToonRamp: () => {},
    syncMap: () => {},
    get layers() { return currentLayers; },
    commitLayers: (next) => {
      onCommitLayers(next);
      for (const fn of layerSyncers) fn();
    },
    syncLayers: (fn) => { layerSyncers.push(fn); },
    syncBrush: (fn) => { brushSyncers.push(fn); },
    get brush() { return currentBrush; },
    commitBrush: (next) => {
      onCommitBrush(next);
      for (const fn of brushSyncers) fn();
    },
    grass: { enabled: true, density: 1, size: 1, color: 0x86c65c },
    commitGrass: () => {},
    syncGrass: () => {},
    sky: { ...SKY_DEFAULTS },
    commitSky: () => {},
    syncSky: () => {},
    style: { key: 'bosque', ink: false },
    commitStyle: () => {},
    syncStyle: () => {},
  };
  return {
    ctx,
    onCommitLayers,
    onCommitBrush,
    applyLayers: (next) => { currentLayers = [...next]; for (const fn of layerSyncers) fn(); },
    applyBrush: (next) => { currentBrush = { ...next }; for (const fn of brushSyncers) fn(); },
  };
}

describe('visor de capas del editor de mapa (138A-9)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent === label);
    expect(found, `botón "${label}"`).toBeDefined();
    return found as HTMLButtonElement;
  };

  it('sin capas muestra el aviso y añadir círculo emite la capa nueva', () => {
    const { ctx, onCommitLayers } = createCtx();
    buildLayerEditorPanel(host, ctx);
    expect(host.textContent).toContain('Sin capas');
    button('+ Camino').click();
    expect(onCommitLayers).toHaveBeenCalledTimes(1);
    const next = onCommitLayers.mock.calls[0][0] as readonly TerrainLayer[];
    expect(next).toHaveLength(1);
    expect(next[0].kind).toBe('path');
    expect(next[0].shape.kind).toBe('circle');
  });

  it('lista las capas con nombre, contenido y celdas pintadas', () => {
    const layers = [
      createCircleLayer('sand', []),
      createPaintedLayer({ ...DEFAULT_BRUSH_STATE, kind: 'water' }, [], [[0, 0], [1, 1]]),
    ];
    const { ctx } = createCtx({ layers });
    buildLayerEditorPanel(host, ctx);
    expect(host.textContent).toContain('Arena pintada');
    expect(host.textContent).toContain('Agua pintada');
    expect(host.textContent).toContain('2 celdas');
  });

  it('el ojo alterna la visibilidad de una capa', () => {
    const layers = [createCircleLayer('path', [])];
    const { ctx, onCommitLayers } = createCtx({ layers });
    buildLayerEditorPanel(host, ctx);
    const eye = host.querySelector<HTMLButtonElement>('.juegoConstructor__capaOjo');
    expect(eye).not.toBeNull();
    eye?.click();
    const next = onCommitLayers.mock.calls[0][0] as readonly TerrainLayer[];
    expect(next[0].enabled).toBe(false);
  });

  it('reordena, duplica y elimina capas desde la fila', () => {
    const a = createCircleLayer('sand', []);
    const b = createCircleLayer('water', [a]);
    const { ctx, onCommitLayers } = createCtx({ layers: [a, b] });
    buildLayerEditorPanel(host, ctx);

    let rows = Array.from(host.querySelectorAll<HTMLElement>('.juegoConstructor__capaFila'));
    expect(rows).toHaveLength(2);
    const firstRow = rows[0];
    const upDisabled = firstRow.querySelector<HTMLButtonElement>('button[aria-label="Subir capa Arena pintada"]')?.disabled;
    expect(upDisabled).toBe(true);
    firstRow.querySelector<HTMLButtonElement>('button[aria-label="Bajar capa Arena pintada"]')?.click();
    let next = onCommitLayers.mock.calls[0][0] as readonly TerrainLayer[];
    expect(next.map(layer => layer.id)).toEqual([b.id, a.id]);

    rows = Array.from(host.querySelectorAll<HTMLElement>('.juegoConstructor__capaFila'));
    expect(rows[0].textContent).toContain('Agua pintada');
    rows[0].querySelector<HTMLButtonElement>('button[aria-label="Duplicar capa Agua pintada"]')?.click();
    next = onCommitLayers.mock.calls[1][0] as readonly TerrainLayer[];
    expect(next).toHaveLength(3);
    expect(next[1].name).toBe('Agua pintada copia');
    expect(next[1].id).not.toBe(b.id);

    rows = Array.from(host.querySelectorAll<HTMLElement>('.juegoConstructor__capaFila'));
    rows[2].querySelector<HTMLButtonElement>('button[aria-label="Eliminar capa Arena pintada"]')?.click();
    next = onCommitLayers.mock.calls[2][0] as readonly TerrainLayer[];
    expect(next).toHaveLength(2);
    expect(next.map(layer => layer.id)).toEqual([b.id, next[1].id]);
  });

  it('el pincel emite activo, contenido, radio y objetivo al cambiar', () => {
    const painted = createPaintedLayer({ ...DEFAULT_BRUSH_STATE, kind: 'path' }, [], [[0, 0]]);
    const { ctx, onCommitBrush } = createCtx({ layers: [painted] });
    buildLayerEditorPanel(host, ctx);

    const check = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(check).not.toBeNull();
    check!.checked = true;
    check!.dispatchEvent(new Event('change'));
    expect(onCommitBrush.mock.calls[0][0]).toMatchObject({ active: true });

    const radio = host.querySelector<HTMLInputElement>('input[type="range"]');
    expect(radio).not.toBeNull();
    radio!.value = '4';
    radio!.dispatchEvent(new Event('input'));
    expect(onCommitBrush.mock.calls[1][0]).toMatchObject({ radius: 4 });

    const target = Array.from(host.querySelectorAll<HTMLSelectElement>('select'))
      .find(select => Array.from(select.options)
        .some(option => option.value === '' || option.textContent === '— nueva capa —'));
    expect(target).not.toBeNull();
    target!.value = painted.id;
    target!.dispatchEvent(new Event('change'));
    expect(onCommitBrush.mock.calls[2][0]).toMatchObject({ targetLayerId: painted.id });
  });

  it('en estilo bloques el pincel solo ofrece subir/bajar', () => {
    const { ctx } = createCtx({ style: 'bloques' });
    buildLayerEditorPanel(host, ctx);
    const segmentLabels = Array.from(host.querySelectorAll<HTMLButtonElement>('.juegoPanelTerreno__segmento'))
      .map(button => button.textContent)
      .filter(text => text !== null);
    expect(segmentLabels).toContain('Subir/bajar');
    expect(segmentLabels).not.toContain('Camino');
    expect(segmentLabels).not.toContain('Arena');
    expect(segmentLabels).not.toContain('Agua');
  });

  it('applyLayers/applyBrush vuelven a renderizar el visor desde fuera', () => {
    const { ctx, applyLayers, applyBrush, onCommitBrush } = createCtx();
    buildLayerEditorPanel(host, ctx);
    expect(host.textContent).toContain('Sin capas');
    applyLayers([createCircleLayer('water', [])]);
    expect(host.textContent).toContain('Agua pintada');
    applyBrush({ ...DEFAULT_BRUSH_STATE, active: true });
    const check = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(check?.checked).toBe(true);
    expect(onCommitBrush).not.toHaveBeenCalled();
  });
});
