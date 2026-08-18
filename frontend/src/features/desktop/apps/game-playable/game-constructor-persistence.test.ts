import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMapVersionFromOptions,
  editMapVersionObjects,
  removeInstancesIfPresent,
  terrainOptionsPreset,
  SKY_DEFAULTS,
  WORLD_PALETTE_DEFAULTS,
  type SkyOptions,
  type TerrainLayer,
} from '../../../game-core';
import {
  clearConstructorState,
  CONSTRUCTOR_STORAGE_KEY,
  createRemovedInstancesStore,
  normalizeRemovedInstanceIds,
  normalizePanelState,
  loadConstructorState,
  saveConstructorState,
} from './game-constructor-persistence';

describe('persistencia del constructor de mundo', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('guarda y restaura opciones y modo en la clave versionada', () => {
    const options = terrainOptionsPreset('archipielago');
    expect(saveConstructorState({ version: 1, options, mode: 'suave', camera: 'primera' })).toBe(true);
    expect(window.localStorage.getItem(CONSTRUCTOR_STORAGE_KEY)).not.toBeNull();

    const restored = loadConstructorState();
    expect(restored).toEqual({ version: 1, options, mode: 'suave', camera: 'primera' });
  });

  it('guarda y restaura el modo de cámara con el constructor (138A-7)', () => {
    const options = terrainOptionsPreset('isla');
    expect(saveConstructorState({ version: 1, options, mode: 'bloques', camera: 'tercera' })).toBe(true);
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'bloques', camera: 'tercera' });
  });

  it('devuelve null si no hay estado guardado', () => {
    expect(loadConstructorState()).toBeNull();
  });

  it('devuelve null con JSON corrupto o versión desconocida (fail-closed)', () => {
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, '{no es json');
    expect(loadConstructorState()).toBeNull();

    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadConstructorState()).toBeNull();
  });

  it('devuelve null si las opciones son inválidas', () => {
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options: { ...terrainOptionsPreset('isla'), width: 7 },
      mode: 'bloques',
    }));
    expect(loadConstructorState()).toBeNull();
  });

  it('devuelve null con opciones parciales (no rellena defaults en silencio)', () => {
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options: { shape: 'isla' },
      mode: 'bloques',
    }));
    expect(loadConstructorState()).toBeNull();
  });

  it('un modo inválido cae al default bloques conservando las opciones', () => {
    const options = terrainOptionsPreset('valle');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'wireframe',
    }));
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'bloques', camera: 'libre' });
  });

  it('el modo histórico actual cae a bloques al restaurar (138A-6)', () => {
    const options = terrainOptionsPreset('isla');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'actual',
    }));
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'bloques', camera: 'libre' });
  });

  it('una cámara ausente o inválida cae a libre conservando opciones y modo (138A-7)', () => {
    const options = terrainOptionsPreset('valle');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'suave',
      camera: 'orbit',
    }));
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'suave', camera: 'libre' });

    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({ version: 1, options, mode: 'suave' }));
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'suave', camera: 'libre' });
  });

  it('guarda y restaura la paleta y el estado del panel (138A-8)', () => {
    const options = terrainOptionsPreset('isla');
    const palette = { ...WORLD_PALETTE_DEFAULTS, sky: 0x123456 };
    const panel = { collapsed: true, side: 'left' as const, width: 360 };
    expect(saveConstructorState({ version: 1, options, mode: 'bloques', camera: 'libre', palette, panel }))
      .toBe(true);
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
      palette,
      panel,
    });
  });

  it('una paleta o panel inválido se omiten sin bloquear la restauración (fail-closed)', () => {
    const options = terrainOptionsPreset('isla');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'suave',
      camera: 'libre',
      palette: { ...WORLD_PALETTE_DEFAULTS, grass: -5 },
      panel: { collapsed: 'si', side: 'right', width: 9999 },
    }));
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'suave', camera: 'libre' });
  });

  it('normalizePanelState recorta el ancho a un decimal y valida lado/colapso', () => {
    expect(normalizePanelState({ collapsed: false, side: 'right', width: 311.17 }))
      .toEqual({ collapsed: false, side: 'right', width: 311.2 });
    expect(normalizePanelState({ collapsed: true, side: 'top', width: 320 })).toBeNull();
    expect(normalizePanelState({ collapsed: true, side: 'right', width: 100 })).toBeNull();
    expect(normalizePanelState(null)).toBeNull();
  });

  it('save devuelve false y load null si localStorage falla', () => {
    const blocked: Storage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('quota'); },
      removeItem: () => { throw new Error('quota'); },
      clear: () => { throw new Error('quota'); },
      key: () => null,
      get length() { return 0; },
    };
    const getter = vi.spyOn(window, 'localStorage', 'get').mockReturnValue(blocked);
    expect(saveConstructorState({ version: 1, options: terrainOptionsPreset('isla'), mode: 'bloques', camera: 'libre' }))
      .toBe(false);
    expect(loadConstructorState()).toBeNull();
    getter.mockRestore();
  });

  it('clearConstructorState elimina la clave sin romper si no existe', () => {
    saveConstructorState({ version: 1, options: terrainOptionsPreset('isla'), mode: 'bloques', camera: 'libre' });
    clearConstructorState();
    expect(window.localStorage.getItem(CONSTRUCTOR_STORAGE_KEY)).toBeNull();
    clearConstructorState();
  });

  it('guarda y restaura las instancias eliminadas (138A-14)', () => {
    const options = { ...terrainOptionsPreset('isla'), style: 'bloques' as const, seed: 7 };
    const map = buildMapVersionFromOptions(options);
    const target = map.instances[0];
    expect(saveConstructorState({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
      removedInstanceIds: [target.id],
    })).toBe(true);
    expect(loadConstructorState()?.removedInstanceIds).toEqual([target.id]);
  });

  it('una lista de removidos inválida se omite sin bloquear la restauración (138A-14)', () => {
    const options = terrainOptionsPreset('isla');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'suave',
      camera: 'tercera',
      removedInstanceIds: ['asset-rock', { id: 1 }, null],
    }));
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'suave', camera: 'tercera' });
    expect(normalizeRemovedInstanceIds(null)).toBeUndefined();
    expect(normalizeRemovedInstanceIds(['inst-0', 'inst-0', 'inst-1'])).toEqual(['inst-0', 'inst-1']);
    expect(normalizeRemovedInstanceIds([])).toEqual([]);
  });

  it('recarga sin reaparecer la instancia quitada (flujo escena, 138A-14)', () => {
    const options = { ...terrainOptionsPreset('isla'), style: 'bloques' as const, seed: 7 };
    const generated = buildMapVersionFromOptions(options);
    const target = generated.instances[0];
    const edited = editMapVersionObjects(generated, [{ kind: 'remove', id: target.id }]);
    expect(saveConstructorState({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'libre',
      removedInstanceIds: [target.id],
    })).toBe(true);

    /* La escena restaura: carga el estado, regenera desde opciones y reaplica
     * los removidos (mismo flujo que showConstructorWorld + restore). */
    const restored = loadConstructorState();
    expect(restored).not.toBeNull();
    if (!restored) return;
    const regenerated = buildMapVersionFromOptions(restored.options);
    const finalMap = removeInstancesIfPresent(
      regenerated,
      restored.removedInstanceIds ?? [],
    );
    expect(finalMap.instances.find(instance => instance.id === target.id)).toBeUndefined();
    expect(finalMap.instances.length).toBe(edited.instances.length);
  });

  it('el store reaplica removidos al regenerar y descarta ids muertos (138A-14)', () => {
    const options = { ...terrainOptionsPreset('isla'), style: 'bloques' as const, seed: 7 };
    const generated = buildMapVersionFromOptions(options);
    const target = generated.instances[0];
    const store = createRemovedInstancesStore();
    store.track([{ kind: 'remove', id: target.id }, { kind: 'remove', id: 'inst-9999' }]);
    store.track([{ kind: 'remove', id: target.id }]);

    const reapplied = store.reapply(buildMapVersionFromOptions(options));
    expect(reapplied.instances.find(instance => instance.id === target.id)).toBeUndefined();
    /* El id muerto se descarta y el removido vivo sigue serializable. */
    expect(store.serialize()).toEqual([target.id]);

    store.restore(undefined);
    expect(store.serialize()).toBeUndefined();
    expect(store.reapply(generated)).toBe(generated);
  });

  it('regenerar en vivo no reaparece la instancia quitada ni pierde el id vivo (138A-14, revisor H-1)', () => {
    const options = { ...terrainOptionsPreset('isla'), style: 'bloques' as const, seed: 7 };
    const store = createRemovedInstancesStore();
    const first = buildMapVersionFromOptions(options);
    const target = first.instances[0];
    store.track([{ kind: 'remove', id: target.id }]);

    /* Regeneración en vivo 1 (mismo seed): el store reaplica y conserva el
     * id para futuras regeneraciones. */
    const regenerated1 = store.reapply(buildMapVersionFromOptions(options));
    expect(regenerated1.instances.some(instance => instance.id === target.id)).toBe(false);
    expect(store.serialize()).toEqual([target.id]);

    /* Regeneración en vivo 2 (mismo seed): sigue fuera y el id sigue vivo.
     * Si un segundo reapply descartara el id como "muerto" tras el primero,
     * la instancia reaparecería en la siguiente regeneración. */
    const regenerated2 = store.reapply(buildMapVersionFromOptions(options));
    expect(regenerated2.instances.some(instance => instance.id === target.id)).toBe(false);
    expect(store.serialize()).toEqual([target.id]);

    /* Regeneración donde la instancia ya no existe en el documento (otro
     * seed/densidad): se poda del store (persistiría solo ids vivos). */
    const otherSeed = editMapVersionObjects(
      buildMapVersionFromOptions({ ...options, seed: 99 }),
      [{ kind: 'remove', id: target.id }],
    );
    expect(otherSeed.instances.some(instance => instance.id === target.id)).toBe(false);
    const pruned = store.reapply(otherSeed);
    expect(pruned.instances.some(instance => instance.id === target.id)).toBe(false);
    expect(store.serialize()).toBeUndefined();
  });

  it('guarda y restaura el stack de capas del editor de mapa (138A-9)', () => {
    const options = terrainOptionsPreset('isla');
    const layers: readonly TerrainLayer[] = [
      {
        id: 'capa-path-1',
        name: 'Camino pintado',
        enabled: true,
        kind: 'path',
        shape: { kind: 'painted', cells: [[2, 3], [4, 5]] },
        falloff: 'smooth',
        falloffRadius: 1,
        bias: 1,
        blend: 'set',
        hardness: 0.5,
      },
      {
        id: 'capa-elevation-1',
        name: 'Elevación pintada',
        enabled: true,
        kind: 'elevation',
        shape: { kind: 'circle', cx: 0, cz: 0, radius: 3 },
        falloff: 'gauss',
        falloffRadius: 1.5,
        bias: 1,
        blend: 'add',
        height: 2,
        elevationMode: 'delta',
      },
    ];
    expect(saveConstructorState({ version: 1, options, mode: 'suave', camera: 'libre', layers })).toBe(true);
    expect(loadConstructorState()).toEqual({ version: 1, options, mode: 'suave', camera: 'libre', layers });
  });

  it('capas inválidas se omiten sin bloquear la restauración del resto (138A-9)', () => {
    const options = terrainOptionsPreset('isla');
    const layers = [
      { id: 'mala', kind: 'path' }, // sin shape/hardness/blend...
      {
        id: 'capa-sand-1',
        name: 'Arena pintada',
        enabled: true,
        kind: 'sand',
        shape: { kind: 'painted', cells: [[0, 0]] },
        falloff: 'hard',
        falloffRadius: 0.5,
        bias: 0.8,
        blend: 'set',
        hardness: 0.4,
      },
    ];
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'tercera',
      palette: { ...WORLD_PALETTE_DEFAULTS, sky: 0xabcdef },
      layers,
    }));
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'tercera',
      palette: { ...WORLD_PALETTE_DEFAULTS, sky: 0xabcdef },
    });
  });

  it('guarda y restaura las opciones del generador de pasto (138A-10)', () => {
    const options = terrainOptionsPreset('isla');
    const grass = { enabled: true, density: 0.65, size: 1.2, color: 0x7ec850 };
    expect(saveConstructorState({ version: 1, options, mode: 'suave', camera: 'libre', grass }))
      .toBe(true);
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'suave',
      camera: 'libre',
      grass,
    });
  });

  it('opciones de pasto inválidas se omiten sin bloquear el resto (138A-10)', () => {
    const options = terrainOptionsPreset('isla');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'tercera',
      grass: { enabled: true, density: 7, size: 1, color: 0x86c65c },
    }));
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'tercera',
    });
  });

  it('guarda y restaura las opciones del cielo (138A-12)', () => {
    const options = terrainOptionsPreset('isla');
    const sky: SkyOptions = {
      ...SKY_DEFAULTS,
      preset: 'golden',
      coverage: 0.35,
      sunEl: 9,
      sunAz: 200,
    };
    expect(saveConstructorState({ version: 1, options, mode: 'suave', camera: 'libre', sky }))
      .toBe(true);
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'suave',
      camera: 'libre',
      sky,
    });
  });

  it('opciones de cielo inválidas se omiten sin bloquear el resto (138A-12)', () => {
    const options = terrainOptionsPreset('isla');
    window.localStorage.setItem(CONSTRUCTOR_STORAGE_KEY, JSON.stringify({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'tercera',
      sky: { ...SKY_DEFAULTS, coverage: 3 },
    }));
    expect(loadConstructorState()).toEqual({
      version: 1,
      options,
      mode: 'bloques',
      camera: 'tercera',
    });
  });
});
