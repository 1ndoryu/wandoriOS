import { describe, expect, it } from 'vitest';
import {
  mergePaintedCells,
  type TerrainLayer,
} from '../../../game-core';
import {
  brushLayerLabel,
  DEFAULT_BRUSH_STATE,
  normalizeBrushState,
  type ConstructorBrushState,
} from './game-layer-brush';
import {
  createCircleLayer,
  createPaintedLayer,
  paintedLayersOfKind,
  terrainLayerKindOfBrush,
} from './game-layer-editor';

describe('estado del pincel (138A-9)', () => {
  it('normaliza un estado válido sin perder campos', () => {
    const brush: ConstructorBrushState = {
      active: true,
      kind: 'sand',
      radius: 3,
      strength: 0.7,
      falloff: 'gauss',
      targetLayerId: 'pincel-sand-1',
      height: 2,
      direction: 'lower',
      mode: 'add',
    };
    expect(normalizeBrushState(brush)).toEqual(brush);
  });

  it('cae a los defaults ante valores no válidos (fail-closed)', () => {
    expect(normalizeBrushState(null)).toEqual(DEFAULT_BRUSH_STATE);
    expect(normalizeBrushState('pincel')).toEqual(DEFAULT_BRUSH_STATE);
    expect(normalizeBrushState({
      active: 'si',
      kind: 'asfalto',
      radius: 999,
      strength: 0,
      falloff: 'cuadratico',
      targetLayerId: '',
      height: -3,
      direction: 'flat',
    })).toEqual(DEFAULT_BRUSH_STATE);
  });

  it('recorta radios/fuerzas/alturas fuera de rango al default', () => {
    const base = { ...DEFAULT_BRUSH_STATE };
    expect(normalizeBrushState({ ...base, radius: 0.1, strength: 1.5, height: 99 }))
      .toEqual(base);
  });

  it('ignora campos desconocidos sin romper el estado', () => {
    const result = normalizeBrushState({ ...DEFAULT_BRUSH_STATE, extra: 1, 'data-x': 'y' });
    expect(result).toEqual(DEFAULT_BRUSH_STATE);
    expect('extra' in result).toBe(false);
  });

  it('direction solo admite raise/lower; targetLayerId exige texto', () => {
    expect(normalizeBrushState({ ...DEFAULT_BRUSH_STATE, direction: 'lower' }).direction).toBe('lower');
    expect(normalizeBrushState({ ...DEFAULT_BRUSH_STATE, direction: 'x' }).direction).toBe('raise');
    expect(normalizeBrushState({ ...DEFAULT_BRUSH_STATE, targetLayerId: 'l1' }).targetLayerId).toBe('l1');
    expect(normalizeBrushState({ ...DEFAULT_BRUSH_STATE, targetLayerId: '' }).targetLayerId).toBeNull();
  });

  it('el pincel de pasto normaliza su modo poner/quitar (138A-10)', () => {
    const grass: ConstructorBrushState = { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'remove' };
    expect(normalizeBrushState(grass)).toEqual(grass);
    expect(normalizeBrushState({ ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'otro' }).mode)
      .toBe('add');
  });

  it('brushLayerLabel nombra cada contenido del pincel', () => {
    expect(brushLayerLabel('path')).toBe('Camino pintado');
    expect(brushLayerLabel('sand')).toBe('Arena pintada');
    expect(brushLayerLabel('water')).toBe('Agua pintada');
    expect(brushLayerLabel('grass')).toBe('Pasto pintado');
    expect(brushLayerLabel('elevation')).toBe('Elevación pintada');
  });
});

describe('fábricas de capas del visor (138A-9)', () => {
  it('createCircleLayer genera ids únicos por contenido', () => {
    const first = createCircleLayer('path', []);
    const second = createCircleLayer('path', [first]);
    expect(first.id).toBe('capa-path-1');
    expect(second.id).toBe('capa-path-2');
    expect(first.shape).toEqual({ kind: 'circle', cx: 0, cz: 0, radius: 3 });
    expect(first.kind).toBe('path');
  });

  it('la capa círculo de agua baja el terreno y la de elevación es delta', () => {
    const water = createCircleLayer('water', []);
    expect(water.kind).toBe('water');
    if (water.kind === 'water') {
      expect(water.lowerToWater).toBe(true);
      expect(water.hardness).toBe(0.5);
    }
    const elevation = createCircleLayer('elevation', []);
    expect(elevation.kind).toBe('elevation');
    if (elevation.kind === 'elevation') {
      expect(elevation.elevationMode).toBe('delta');
      expect(elevation.height).toBe(1);
    }
  });

  it('la capa círculo de pasto es vegetación con modo poner (138A-10)', () => {
    const grass = createCircleLayer('grass', []);
    expect(grass.kind).toBe('vegetation');
    expect(grass.name).toBe('Pasto pintado');
    if (grass.kind === 'vegetation') expect(grass.mode).toBe('add');
  });

  it('createPaintedLayer usa pincel, celdas y falloff mínimo 0.25', () => {
    const layer = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'sand', radius: 0.1, strength: 0.6, falloff: 'hard' },
      [],
      [[1, 2], [3, 4]],
    );
    expect(layer.kind).toBe('sand');
    expect(layer.shape).toEqual({ kind: 'painted', cells: [[1, 2], [3, 4]] });
    expect(layer.falloff).toBe('hard');
    expect(layer.falloffRadius).toBe(0.25);
    expect(layer.bias).toBe(0.6);
  });

  it('la elevación pintada baja el terreno si la dirección es lower', () => {
    const raised = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'elevation', direction: 'raise', height: 2 },
      [],
      [[0, 0]],
    );
    expect(raised.kind).toBe('elevation');
    if (raised.kind === 'elevation') expect(raised.height).toBe(2);

    const lowered = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'elevation', direction: 'lower', height: 1.5 },
      [],
      [[0, 0]],
    );
    expect(lowered.kind).toBe('elevation');
    if (lowered.kind === 'elevation') expect(lowered.height).toBe(-1.5);
  });

  it('la pincelada de pasto respeta el modo poner/quitar del pincel (138A-10)', () => {
    const add = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'add' },
      [],
      [[2, 3]],
    );
    expect(add.kind).toBe('vegetation');
    if (add.kind === 'vegetation') expect(add.mode).toBe('add');

    const remove = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'remove' },
      [],
      [[4, 5]],
    );
    expect(remove.kind).toBe('vegetation');
    if (remove.kind === 'vegetation') expect(remove.mode).toBe('remove');
  });

  it('paintedLayersOfKind filtra pasto pintado por su kind de terreno (138A-10)', () => {
    const layers = [
      createCircleLayer('grass', []),
      createPaintedLayer({ ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'remove' }, [], [[0, 0]]),
      createPaintedLayer({ ...DEFAULT_BRUSH_STATE, kind: 'sand' }, [], [[1, 1]]),
    ];
    const grass = paintedLayersOfKind(layers, 'grass');
    expect(grass).toHaveLength(1);
    expect(grass[0].kind).toBe('vegetation');
    expect(grass[0].shape.kind).toBe('painted');
  });

  it('terrainLayerKindOfBrush mapea grass a vegetation y deja el resto', () => {
    expect(terrainLayerKindOfBrush('grass')).toBe('vegetation');
    expect(terrainLayerKindOfBrush('path')).toBe('path');
    expect(terrainLayerKindOfBrush('elevation')).toBe('elevation');
  });

  it('paintedLayersOfKind solo devuelve capas pintadas del contenido', () => {
    const layers: readonly TerrainLayer[] = [
      createCircleLayer('sand', []),
      createPaintedLayer({ ...DEFAULT_BRUSH_STATE, kind: 'sand' }, [], [[0, 0]]),
      createPaintedLayer({ ...DEFAULT_BRUSH_STATE, kind: 'water' }, [], [[1, 1]]),
    ];
    const sand = paintedLayersOfKind(layers, 'sand');
    expect(sand).toHaveLength(1);
    expect(sand[0].shape.kind).toBe('painted');
    expect(paintedLayersOfKind(layers, 'elevation')).toHaveLength(0);
  });
});

describe('mergePaintedCells (138A-9)', () => {
  it('fusiona deduplicando y conserva el orden de inserción', () => {
    const merged = mergePaintedCells([[0, 0], [1, 1]], [[1, 1], [2, 2]]);
    expect(merged).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('respeta la cuota y descarta celdas no enteras', () => {
    expect(mergePaintedCells([[0, 0]], [[1, 1], [2, 2]], 2)).toEqual([[0, 0], [1, 1]]);
    expect(mergePaintedCells([], [[0.5, 1] as unknown as readonly [number, number]], 10)).toEqual([]);
  });
});
