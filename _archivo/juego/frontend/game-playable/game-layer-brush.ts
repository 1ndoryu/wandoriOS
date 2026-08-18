/* 138A-9 — Estado del pincel del editor de mapa (contrato compartido entre
 * el visor de capas y el painter de la escena). Solo contrato puro +
 * normalización fail-closed: el DOM vive en `game-layer-editor` y el raycast/
 * pointer en `game-layer-painter`. El pincel pinta CELDAS en una capa del
 * stack (máscara pintada); la elevación con dirección subir/bajar cubre el
 * editor de bloques (colocar/quitar bloques al cuantizar el heightfield). */

import type { FalloffKind } from '../../../game-core';

/** Contenido que pinta el pincel; elevar (subir) / bajar (quitar) modela
 *  el editor de bloques y el subir/bajar del terreno suave. [138A-10] 'grass'
 *  pinta la máscara de vegetación (poner/quitar pasto). */
export type ConstructorBrushKind = 'path' | 'sand' | 'water' | 'grass' | 'elevation';

export interface ConstructorBrushState {
  /** Pincel habilitado: mientras está activo, arrastrar pinta en vez de
   *  orbitar la cámara (lo decide la escena en los handlers de puntero). */
  readonly active: boolean;
  readonly kind: ConstructorBrushKind;
  /** Radio del pincel en unidades de mundo (celdas alrededor del cursor). */
  readonly radius: number;
  /** Fuerza 0..1: bias de la capa al aplicar el falloff (elevación escala
   *  la altura delta; superficie pinta si fuerza >= hardness). */
  readonly strength: number;
  readonly falloff: FalloffKind;
  /** Capa pintada objetivo del stack; null = crear una nueva por sesión. */
  readonly targetLayerId: string | null;
  /** Altura (bloques/terreno) que sube o baja la elevación. */
  readonly height: number;
  readonly direction: 'raise' | 'lower';
  /** [138A-10] Modo del pincel de pasto: add pinta césped, remove lo quita. */
  readonly mode: 'add' | 'remove';
}

export const DEFAULT_BRUSH_STATE: ConstructorBrushState = {
  active: false,
  kind: 'path',
  radius: 2,
  strength: 1,
  falloff: 'smooth',
  targetLayerId: null,
  height: 1,
  direction: 'raise',
  mode: 'add',
};

export const BRUSH_KINDS: readonly { readonly key: ConstructorBrushKind; readonly label: string }[] = [
  { key: 'path', label: 'Camino' },
  { key: 'sand', label: 'Arena' },
  { key: 'water', label: 'Agua' },
  { key: 'grass', label: 'Pasto' },
  { key: 'elevation', label: 'Subir/bajar' },
];

const FALLOFFS: readonly FalloffKind[] = ['linear', 'smooth', 'gauss', 'dome', 'spike', 'hard'];
const KINDS: readonly ConstructorBrushKind[] = ['path', 'sand', 'water', 'grass', 'elevation'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Normaliza un estado de pincel (fail-closed: valores fuera de rango caen
 *  al default, campos desconocidos se ignoran). */
export function normalizeBrushState(value: unknown): ConstructorBrushState {
  if (!isRecord(value)) return { ...DEFAULT_BRUSH_STATE };
  const kind = typeof value.kind === 'string' && KINDS.includes(value.kind as ConstructorBrushKind)
    ? value.kind as ConstructorBrushKind
    : DEFAULT_BRUSH_STATE.kind;
  const falloff = typeof value.falloff === 'string' && FALLOFFS.includes(value.falloff as FalloffKind)
    ? value.falloff as FalloffKind
    : DEFAULT_BRUSH_STATE.falloff;
  return {
    active: typeof value.active === 'boolean' ? value.active : DEFAULT_BRUSH_STATE.active,
    kind,
    radius: finite(value.radius) && value.radius >= 0.25 && value.radius <= 16
      ? value.radius
      : DEFAULT_BRUSH_STATE.radius,
    strength: finite(value.strength) && value.strength >= 0.05 && value.strength <= 1
      ? value.strength
      : DEFAULT_BRUSH_STATE.strength,
    falloff,
    targetLayerId: typeof value.targetLayerId === 'string' && value.targetLayerId.length > 0
      ? value.targetLayerId
      : null,
    height: finite(value.height) && value.height >= 0.25 && value.height <= 16
      ? value.height
      : DEFAULT_BRUSH_STATE.height,
    direction: value.direction === 'lower' ? 'lower' : 'raise',
    mode: value.mode === 'remove' ? 'remove' : 'add',
  };
}

/** Nombre de capa por defecto para una pincelada nueva. */
export function brushLayerLabel(kind: ConstructorBrushKind): string {
  switch (kind) {
    case 'path': return 'Camino pintado';
    case 'sand': return 'Arena pintada';
    case 'water': return 'Agua pintada';
    case 'grass': return 'Pasto pintado';
    case 'elevation': return 'Elevación pintada';
  }
}
