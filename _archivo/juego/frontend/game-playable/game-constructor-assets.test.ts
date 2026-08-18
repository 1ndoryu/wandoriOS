import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMapVersionFromOptions,
  SKY_DEFAULTS,
  terrainOptionsPreset,
  type MapVersion,
  type TerrainOptions,
  type WorldPalette,
} from '../../../game-core';
import { ASSET_DRAG_MIME, buildAssetsPanel } from './game-constructor-assets';
import type { ConstructorPanelContext } from './game-world-constructor';

function buildFixtureMap(): MapVersion {
  return buildMapVersionFromOptions({ ...terrainOptionsPreset('isla'), style: 'bloques', seed: 7 });
}

function createCtx(map: MapVersion | null): {
  readonly ctx: ConstructorPanelContext;
  readonly onEditObjects: ReturnType<typeof vi.fn>;
  readonly syncMap: () => void;
} {
  let worldMap = map;
  const onEditObjects = vi.fn();
  const mapSyncers: Array<() => void> = [];
  const ctx: ConstructorPanelContext = {
    state: {} as TerrainOptions,
    commit: () => {},
    sync: () => {},
    palette: {} as WorldPalette,
    commitPalette: () => {},
    syncPalette: () => {},
    get worldMap() { return worldMap; },
    commitObjectEdits: (ops) => { onEditObjects(ops); },
    commitToonRamp: () => {},
    syncMap: (fn) => { mapSyncers.push(fn); },
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
  };
  return {
    ctx,
    onEditObjects,
    syncMap: () => { for (const fn of mapSyncers) fn(); },
  };
}

describe('panel de Assets del constructor (138A-8)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
  });

  it('sin documento muestra el aviso y no emite ediciones', () => {
    const { ctx, onEditObjects } = createCtx(null);
    buildAssetsPanel(host, ctx);
    expect(host.textContent).toContain('Genera o importa un mundo');
    expect(onEditObjects).not.toHaveBeenCalled();
  });

  it('lista categorías, assets e instancias con recuentos', () => {
    const map = buildFixtureMap();
    const { ctx } = createCtx(map);
    buildAssetsPanel(host, ctx);
    expect(host.textContent).toContain(`${map.instances.length} instancias`);
    expect(host.textContent).toContain('Árboles');
    expect(host.textContent).toContain(map.instances[0].id);
  });

  it('quitar una categoría emite remove por cada instancia de la categoría', () => {
    const map = buildFixtureMap();
    const { ctx, onEditObjects } = createCtx(map);
    buildAssetsPanel(host, ctx);
    const treeCategory = 'tree';
    const expected = map.instances
      .filter(instance => map.assetManifest[instance.assetVersionId]?.category === treeCategory)
      .map(instance => ({ kind: 'remove' as const, id: instance.id }));
    clickText('Quitar');
    expect(onEditObjects).toHaveBeenCalledWith(expected);
  });

  it('quitar una instancia individual emite un solo remove', () => {
    const map = buildFixtureMap();
    const { ctx, onEditObjects } = createCtx(map);
    buildAssetsPanel(host, ctx);
    const target = map.instances[0];
    const row = Array.from(host.querySelectorAll<HTMLElement>('.juegoConstructor__assetFila'))
      .find(candidate => candidate.textContent?.includes(target.id));
    expect(row).not.toBeNull();
    if (!row) return;
    row.querySelector<HTMLButtonElement>('button')?.click();
    expect(onEditObjects).toHaveBeenCalledWith([{ kind: 'remove', id: target.id }]);
  });

  it('limpiar todo emite remove por todas las instancias', () => {
    const map = buildFixtureMap();
    const { ctx, onEditObjects } = createCtx(map);
    buildAssetsPanel(host, ctx);
    clickText('Limpiar todo');
    expect(onEditObjects).toHaveBeenCalledWith(
      map.instances.map(instance => ({ kind: 'remove' as const, id: instance.id })),
    );
  });

  it('arrastrar un asset declara el MIME y el id en el dataTransfer', () => {
    const map = buildFixtureMap();
    const { ctx } = createCtx(map);
    buildAssetsPanel(host, ctx);
    const assetId = map.instances[0].assetVersionId;
    const draggable = Array.from(host.querySelectorAll<HTMLElement>('[draggable="true"]'))
      .find(row => row.textContent?.includes(assetId));
    expect(draggable).not.toBeNull();
    if (!draggable) return;
    const dt = createDataTransferStub();
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: dt });
    draggable.dispatchEvent(event);
    expect(dt.getData(ASSET_DRAG_MIME)).toBe(assetId);
  });

  function clickText(text: string): void {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent === text);
    expect(button).not.toBeNull();
    button?.click();
  }

  function createDataTransferStub(): DataTransfer {
    const data = new Map<string, string>();
    return {
      dropEffect: 'none',
      effectAllowed: 'uninitialized',
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
      types: [] as string[],
      clearData: (format?: string) => { data.delete(format ?? ''); },
      getData: (format: string) => data.get(format) ?? '',
      setData: (format: string, value: string) => { data.set(format, value); },
      setDragImage: () => {},
    } as DataTransfer;
  }
});
