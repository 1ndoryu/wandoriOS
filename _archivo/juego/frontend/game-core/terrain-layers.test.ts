import { describe, expect, it } from 'vitest';
import type { IslandHeightfield } from './procedural/heightmap';
import {
  TERRAIN_LAYER_LIMITS,
  TERRAIN_SURFACE_IDS,
  applyTerrainLayerStack,
  normalizeTerrainLayerStack,
  validateTerrainLayer,
  validateTerrainLayerStack,
  type FalloffKind,
  type LayerBlend,
  type ElevationMode,
  type TerrainLayerTaper,
  type TerrainLayer,
} from './terrain-layers';

function flatHeightfield(width = 8, depth = 8, height = 1.5, waterLevel = 0): IslandHeightfield {
  const heights = new Float32Array(width * depth).fill(height);
  return { width, depth, heights, waterLevel, maxHeight: 4 };
}

function circleLayer(overrides: {
  id?: string;
  name?: string;
  enabled?: boolean;
  cx?: number;
  cz?: number;
  radius?: number;
  falloff?: FalloffKind;
  falloffRadius?: number;
  bias?: number;
  blend?: LayerBlend;
  height?: number;
  elevationMode?: ElevationMode;
  taper?: TerrainLayerTaper;
} = {}): TerrainLayer {
  const { cx, cz, radius, ...rest } = overrides;
  return {
    id: 'layer-1',
    name: 'Colina',
    enabled: true,
    kind: 'elevation',
    shape: { kind: 'circle', cx: cx ?? 0, cz: cz ?? 0, radius: radius ?? 2 },
    falloff: 'smooth',
    falloffRadius: 1,
    bias: 1,
    blend: 'set',
    height: 3,
    elevationMode: 'absolute',
    ...rest,
  };
}

describe('stack de capas de terreno puro (138A-9)', () => {
  it('aplica una elevación absoluta dentro del círculo y respeta el falloff', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const result = applyTerrainLayerStack(h, [circleLayer()], 1);
    const center = result.heights[3 * 8 + 3];
    expect(center).toBeCloseTo(3, 5);
    /* Esquina del grid (fuera de radio+falloff): sin cambios. */
    expect(result.heights[0]).toBeCloseTo(1.5, 5);
    expect(result.affectedCells).toBeGreaterThan(0);
    expect(result.affectedCells).toBeLessThan(8 * 8);
  });

  it('later layers win: la segunda capa supera a la primera en el solape', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const lower = circleLayer({ id: 'a', height: 2 });
    const higher = circleLayer({ id: 'b', cx: 0.2, height: 4 });
    const result = applyTerrainLayerStack(h, [lower, higher], 1);
    const center = result.heights[3 * 8 + 3];
    expect(center).toBeCloseTo(4, 5);
  });

  it('mezcla con add/max/min de forma acotada', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const add = applyTerrainLayerStack(h, [circleLayer({ blend: 'add', height: 0.5, elevationMode: 'delta' })], 1);
    const centerAdd = add.heights[3 * 8 + 3];
    expect(centerAdd).toBeCloseTo(2, 5);

    const max = applyTerrainLayerStack(h, [circleLayer({ blend: 'max', height: 0.2, elevationMode: 'delta' })], 1);
    expect(max.heights[3 * 8 + 3]).toBeCloseTo(1.7, 5);

    const min = applyTerrainLayerStack(h, [circleLayer({ blend: 'min', height: -2, elevationMode: 'delta' })], 1);
    expect(min.heights[3 * 8 + 3]).toBeCloseTo(-0.5, 5);
  });

  it('pinta superficies (camino/arena/agua) donde el peso supera hardness', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const path: TerrainLayer = {
      id: 'camino', name: 'Camino', enabled: true, kind: 'path',
      shape: { kind: 'circle', cx: 0, cz: 0, radius: 1.5 },
      falloff: 'hard', falloffRadius: 0.5, bias: 1, blend: 'set', hardness: 0.5,
    };
    const result = applyTerrainLayerStack(h, [path], 1);
    expect(result.surfaces[3 * 8 + 3]).toBe(TERRAIN_SURFACE_IDS.path);
    /* Fuera de la forma: sigue hierba. */
    expect(result.surfaces[0]).toBe(TERRAIN_SURFACE_IDS.grass);
  });

  it('water con lowerToWater baja el terreno bajo el nivel del agua', () => {
    const h = flatHeightfield(8, 8, 1.5, 1);
    const water: TerrainLayer = {
      id: 'lago', name: 'Lago', enabled: true, kind: 'water',
      shape: { kind: 'circle', cx: 0, cz: 0, radius: 1.5 },
      falloff: 'hard', falloffRadius: 0.5, bias: 1, blend: 'set', hardness: 0.5,
      lowerToWater: true,
    };
    const result = applyTerrainLayerStack(h, [water], 1);
    const center = result.heights[3 * 8 + 3];
    expect(center).toBeLessThan(h.waterLevel);
    expect(result.surfaces[3 * 8 + 3]).toBe(TERRAIN_SURFACE_IDS.water);
  });

  it('la base del grid ya sumergida arranca con superficie water', () => {
    const h = flatHeightfield(8, 8, -0.5, 0);
    const result = applyTerrainLayerStack(h, [], 1);
    expect(result.surfaces[0]).toBe(TERRAIN_SURFACE_IDS.water);
    expect(result.surfaces[3 * 8 + 3]).toBe(TERRAIN_SURFACE_IDS.water);
  });

  it('una máscara pintada afecta exactamente sus celdas', () => {
    const h = flatHeightfield(8, 8);
    const cells: readonly (readonly [number, number])[] = [[2, 2], [2, 3], [3, 2], [3, 3]];
    const painted: TerrainLayer = {
      id: 'arena', name: 'Arena', enabled: true, kind: 'sand',
      shape: { kind: 'painted', cells },
      falloff: 'hard', falloffRadius: 0, bias: 1, blend: 'set', hardness: 0.5,
    };
    const result = applyTerrainLayerStack(h, [painted], 1);
    expect(result.surfaces[2 * 8 + 2]).toBe(TERRAIN_SURFACE_IDS.sand);
    expect(result.surfaces[2 * 8 + 3]).toBe(TERRAIN_SURFACE_IDS.sand);
    expect(result.surfaces[0]).toBe(TERRAIN_SURFACE_IDS.grass);
    expect(result.affectedCells).toBe(4);
  });

  it('taper en curva interpola el peso a lo largo del recorrido', () => {
    const h = flatHeightfield(16, 8, 1.5);
    const points: readonly (readonly [number, number])[] = [[-5, 0], [5, 0]];
    const river: TerrainLayer = {
      id: 'rio', name: 'Río', enabled: true, kind: 'elevation',
      shape: { kind: 'curve', points, halfWidth: 1 },
      falloff: 'linear', falloffRadius: 1, bias: 1, blend: 'set',
      height: 0.5, elevationMode: 'delta',
      taper: { enabled: true, widthStart: 1, widthEnd: 0.3, heightStart: 1, heightEnd: 0.2 },
    };
    const result = applyTerrainLayerStack(h, [river], 1);
    /* Start: altura cercana a +0.5; fin: casi sin elevación. */
    const start = result.heights[4 * 16 + 4];
    const end = result.heights[4 * 16 + 11];
    expect(start).toBeGreaterThan(end);
    expect(end).toBeGreaterThanOrEqual(1.5);
    expect(start).toBeLessThanOrEqual(2);
  });

  it('respeta cellSize real al convertir mundo→celda', () => {
    const h = flatHeightfield(8, 8, 1.5);
    /* Con cellSize=2 el mundo mide 16×16: círculo centrado en el mundo 0,0. */
    const result = applyTerrainLayerStack(h, [circleLayer()], 2);
    expect(result.heights[3 * 8 + 3]).toBeCloseTo(3, 5);
  });

  it('R9: el falloff de una curva llega a filas fuera del AABB de los puntos', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const river: TerrainLayer = {
      id: 'rio', name: 'Río', enabled: true, kind: 'elevation',
      shape: { kind: 'curve', points: [[-3, 0], [3, 0]], halfWidth: 0.4 },
      falloff: 'smooth', falloffRadius: 1, bias: 1, blend: 'set',
      height: 3, elevationMode: 'absolute',
    };
    const result = applyTerrainLayerStack(h, [river], 1);
    /* La celda (3,3) está a d=0.1 del borde (fila j=3, fuera del AABB de los
     * puntos): con R9 el peso llega; antes el AABB la dejaba sin tocar. */
    expect(result.heights[3 * 8 + 3]).toBeGreaterThan(1.9);
    expect(result.heights[4 * 8 + 3]).toBeGreaterThan(1.9);
  });

  it('R9: el falloff de un círculo alcanza celdas más allá del AABB del radio', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const wide: TerrainLayer = {
      id: 'colina', name: 'Colina', enabled: true, kind: 'elevation',
      shape: { kind: 'circle', cx: 0, cz: 0, radius: 1 },
      falloff: 'smooth', falloffRadius: 4, bias: 1, blend: 'set',
      height: 3, elevationMode: 'absolute',
    };
    const withFalloff = applyTerrainLayerStack(h, [wide], 1);
    /* Celda (0,3): d=2.54, dentro del falloff; el AABB anterior solo barría ±1. */
    expect(withFalloff.heights[3 * 8 + 0]).toBeGreaterThan(1.8);
    const none = applyTerrainLayerStack(h, [{ ...wide, falloffRadius: 0 }], 1);
    expect(none.heights[3 * 8 + 0]).toBeCloseTo(1.5, 5);
  });

  it('R8: una máscara pintada de 4096 celdas se indexa una vez (Set) y aplica completo', () => {
    const h = flatHeightfield(64, 64, 1.5);
    const cells: (readonly [number, number])[] = [];
    for (let j = 0; j < 64; j += 1) {
      for (let i = 0; i < 64; i += 1) cells.push([i, j]);
    }
    const painted: TerrainLayer = {
      id: 'p', name: 'P', enabled: true, kind: 'sand',
      shape: { kind: 'painted', cells },
      falloff: 'hard', falloffRadius: 0, bias: 1, blend: 'set', hardness: 0.5,
    };
    const result = applyTerrainLayerStack(h, [painted], 1);
    expect(result.affectedCells).toBe(4096);
    expect(result.surfaces[0]).toBe(TERRAIN_SURFACE_IDS.sand);
    expect(result.surfaces[63 * 64 + 63]).toBe(TERRAIN_SURFACE_IDS.sand);
  });

  it('acota alturas a ±64 (contrato MapVersion) y valida cellSize', () => {
    const h = flatHeightfield(8, 8, 1.5);
    const extreme = circleLayer({ height: 500 });
    const result = applyTerrainLayerStack(h, [extreme], 1);
    expect(Math.max(...result.heights)).toBeLessThanOrEqual(64);
    expect(() => applyTerrainLayerStack(h, [], 0)).toThrow(/cellSize/);
    expect(() => applyTerrainLayerStack(h, [], -1)).toThrow(/cellSize/);
  });
});

describe('validación y normalización de capas (138A-9)', () => {
  it('acepta una capa válida y rechaza campos no permitidos', () => {
    expect(validateTerrainLayer(circleLayer())).toEqual([]);
    expect(validateTerrainLayer({ ...circleLayer(), extra: 1 })).toContain('campo no permitido: extra');
    expect(validateTerrainLayer({ ...circleLayer(), id: 'constructor' })).toContain('id inválido');
  });

  it('valida radios, falloff, bias, hardness y formas fuera de rango', () => {
    expect(validateTerrainLayer({ ...circleLayer(), falloffRadius: 999 })).toContain('falloffRadius fuera de rango');
    expect(validateTerrainLayer({ ...circleLayer(), bias: 0 })).toContain('bias fuera de rango');
    expect(validateTerrainLayer({ ...circleLayer(), falloff: 'nope' })).toContain('falloff no permitido');
    const badShape = circleLayer();
    expect(validateTerrainLayer({
      ...badShape,
      shape: { kind: 'circle', cx: 0, cz: 0, radius: -1 },
    })).toContain('radio fuera de rango');
    const path: TerrainLayer = {
      id: 'p', name: 'P', enabled: true, kind: 'path',
      shape: { kind: 'circle', cx: 0, cz: 0, radius: 1 },
      falloff: 'hard', falloffRadius: 0.5, bias: 1, blend: 'set', hardness: 2,
    };
    expect(validateTerrainLayer(path)).toContain('hardness fuera de rango');
  });

  it('rechaza stacks con ids duplicados, cuota de capas y celdas pintadas excesivas', () => {
    const stack = [circleLayer({ id: 'a' }), circleLayer({ id: 'a' })];
    expect(validateTerrainLayerStack(stack).join('; ')).toContain('id duplicado a');

    const tooMany = Array.from({ length: TERRAIN_LAYER_LIMITS.maxLayers + 1 }, (_, i) =>
      circleLayer({ id: `l${i}` }));
    expect(validateTerrainLayerStack(tooMany)).toContain('supera la cuota de capas');

    const hugeCells = Array.from({ length: TERRAIN_LAYER_LIMITS.maxPaintedCells + 1 }, (_, i) => [i, 0] as const);
    const painted: TerrainLayer = {
      id: 'big', name: 'Big', enabled: true, kind: 'sand',
      shape: { kind: 'painted', cells: hugeCells },
      falloff: 'hard', falloffRadius: 0, bias: 1, blend: 'set', hardness: 0.5,
    };
    expect(validateTerrainLayer(painted).join('; ')).toContain('supera la cuota de celdas pintadas');
  });

  it('normaliza fail-closed y descarta capas deshabilitadas del resultado', () => {
    const stack = [circleLayer({ id: 'a' }), circleLayer({ id: 'b', enabled: false })];
    const normalized = normalizeTerrainLayerStack(stack);
    expect(normalized).toHaveLength(2);
    expect(() => normalizeTerrainLayerStack([{ id: 'x' }])).toThrow(/capas de terreno inválidas/);
    const h = flatHeightfield(8, 8);
    const result = applyTerrainLayerStack(h, normalized, 1);
    /* La capa deshabilitada no toca el grid. */
    expect(result.affectedCells).toBeGreaterThan(0);
  });
});
