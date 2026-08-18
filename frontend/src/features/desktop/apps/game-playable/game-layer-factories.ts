/* 138A-9 — Fábricas y helpers puros del stack de capas del editor de mapa.
 * SRP: crean capas círculo/pintadas y derivan metadata de los pinceles sin
 * tocar el DOM; la UI del visor vive en game-layer-editor. */

import {
  brushLayerLabel,
  type ConstructorBrushKind,
  type ConstructorBrushState,
} from './game-layer-brush';
import {
  TERRAIN_SURFACE_IDS,
  type TerrainLayer,
} from '../../../game-core';

/** Id único dentro del stack actual (sufijo incremental). */
export function uniqueLayerId(prefix: string, existing: readonly TerrainLayer[]): string {
  const taken = new Set(existing.map(layer => layer.id));
  let index = 1;
  let candidate = `${prefix}-${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${prefix}-${index}`;
  }
  return candidate;
}

/** Fábrica de capa CÍRCULO desde el panel ("Añadir capa"). */
export function createCircleLayer(
  kind: ConstructorBrushKind,
  existing: readonly TerrainLayer[],
): TerrainLayer {
  const id = uniqueLayerId(`capa-${kind}`, existing);
  const shape = { kind: 'circle' as const, cx: 0, cz: 0, radius: 3 };
  if (kind === 'elevation') {
    return {
      id,
      name: brushLayerLabel(kind),
      enabled: true,
      kind: 'elevation',
      shape,
      falloff: 'smooth',
      falloffRadius: 1.5,
      bias: 1,
      height: 1,
      elevationMode: 'delta',
      blend: 'add',
    };
  }
  if (kind === 'water') {
    return {
      id,
      name: brushLayerLabel(kind),
      enabled: true,
      kind: 'water',
      shape,
      falloff: 'smooth',
      falloffRadius: 1.5,
      bias: 1,
      blend: 'set',
      hardness: 0.5,
      lowerToWater: true,
    };
  }
  if (kind === 'grass') {
    return {
      id,
      name: brushLayerLabel(kind),
      enabled: true,
      kind: 'vegetation',
      shape,
      falloff: 'smooth',
      falloffRadius: 1.5,
      bias: 1,
      blend: 'set',
      hardness: 0.5,
      mode: 'add',
    };
  }
  return {
    id,
    name: brushLayerLabel(kind),
    enabled: true,
    kind,
    shape,
    falloff: 'smooth',
    falloffRadius: 1.5,
    bias: 1,
    blend: 'set',
    hardness: 0.5,
  };
}

/** Fábrica de capa PINTADA para una pincelada (la escena la crea si el pincel
 *  no tiene capa objetivo; los círculos nunca se convierten en pintados). */
export function createPaintedLayer(
  brush: ConstructorBrushState,
  existing: readonly TerrainLayer[],
  cells: readonly (readonly [number, number])[] = [],
): TerrainLayer {
  const id = uniqueLayerId(`pincel-${brush.kind}`, existing);
  const shape = { kind: 'painted' as const, cells };
  if (brush.kind === 'elevation') {
    return {
      id,
      name: brushLayerLabel(brush.kind),
      enabled: true,
      kind: 'elevation',
      shape,
      falloff: brush.falloff,
      falloffRadius: Math.max(0.25, brush.radius * 2),
      bias: brush.strength,
      height: brush.direction === 'lower' ? -brush.height : brush.height,
      elevationMode: 'delta',
      blend: 'add',
    };
  }
  if (brush.kind === 'water') {
    return {
      id,
      name: brushLayerLabel(brush.kind),
      enabled: true,
      kind: 'water',
      shape,
      falloff: brush.falloff,
      falloffRadius: Math.max(0.25, brush.radius * 2),
      bias: brush.strength,
      blend: 'set',
      hardness: 0.5,
      lowerToWater: true,
    };
  }
  if (brush.kind === 'grass') {
    return {
      id,
      name: brushLayerLabel(brush.kind),
      enabled: true,
      kind: 'vegetation',
      shape,
      falloff: brush.falloff,
      falloffRadius: Math.max(0.25, brush.radius * 2),
      bias: brush.strength,
      blend: 'set',
      hardness: 0.5,
      mode: brush.mode,
    };
  }
  return {
    id,
    name: brushLayerLabel(brush.kind),
    enabled: true,
    kind: brush.kind,
    shape,
    falloff: brush.falloff,
    falloffRadius: Math.max(0.25, brush.radius * 2),
    bias: brush.strength,
    blend: 'set',
    hardness: 0.5,
  };
}

/** Capas pintadas del stack (receptoras de pinceladas). */
export function paintedLayersOfKind(
  layers: readonly TerrainLayer[],
  kind: ConstructorBrushKind,
): readonly TerrainLayer[] {
  const terrainKind = terrainLayerKindOfBrush(kind);
  return layers.filter(layer => layer.kind === terrainKind && layer.shape.kind === 'painted');
}

/** Kind de capa de terreno que pinta un pincel ('grass' → 'vegetation'). */
export function terrainLayerKindOfBrush(kind: ConstructorBrushKind): TerrainLayer['kind'] {
  return kind === 'grass' ? 'vegetation' : kind;
}

/** Id de superficie por contenido (paridad con el aplicador). */
export function surfaceIdOfKind(kind: ConstructorBrushKind): number {
  switch (kind) {
    case 'path': return TERRAIN_SURFACE_IDS.path;
    case 'sand': return TERRAIN_SURFACE_IDS.sand;
    case 'water': return TERRAIN_SURFACE_IDS.water;
    case 'grass':
    case 'elevation': return -1;
  }
}
