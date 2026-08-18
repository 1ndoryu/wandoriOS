/* GAME-01 — Toolkit procedural: malla de agua (138A-3).
 * Grid indexado en el plano XZ (cara arriba) con phase de onda determinista
 * por vértice, misma orientación y UV que el PlaneGeometry rotado del
 * experimento 128A-1. Datos puros: no importa Three/DOM/red; el adaptador de
 * la capa app crea la geometría. `wavePhase` es un atributo de contrato
 * serializable reservado para variantes de oleaje por vértice: el shader
 * actual anima por posición y aún no consume el atributo. */

import { hash2 } from './noise';

export const WATER_MESH_DEFAULTS = {
  segmentsX: 32,
  segmentsZ: 32,
  seed: 1337,
} as const;

export const WATER_MESH_MAX_SEGMENTS = 256;

export interface WaterMeshOptions {
  /** Ancho total del plano en unidades de mundo (> 0). */
  readonly width: number;
  /** Profundidad total del plano en unidades de mundo (> 0). */
  readonly depth: number;
  /** Divisiones horizontales, 1..=256. */
  readonly segmentsX?: number;
  /** Divisiones de profundidad, 1..=256. */
  readonly segmentsZ?: number;
  /** Seed determinista del phase de onda por vértice. */
  readonly seed?: number;
}

export interface WaterMeshData {
  /** Vértices `(segmentsX+1)×(segmentsZ+1)` en el plano XZ con y=0. */
  readonly positions: Float32Array;
  /** UV normalizados; v=0 en z=+depth/2 (igual que el PlaneGeometry original). */
  readonly uvs: Float32Array;
  /** Índices triangulares con normal +Y (cara visible desde arriba). */
  readonly indices: Uint32Array;
  /** Phase de onda por vértice en [0,1), determinista por seed. Reservada para
   * variantes de oleaje por vértice; el shader actual anima por posición. */
  readonly wavePhase: Float32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export function buildWaterMeshData(options: WaterMeshOptions): WaterMeshData {
  const { width, depth } = options;
  const segmentsX = options.segmentsX ?? WATER_MESH_DEFAULTS.segmentsX;
  const segmentsZ = options.segmentsZ ?? WATER_MESH_DEFAULTS.segmentsZ;
  const seed = options.seed ?? WATER_MESH_DEFAULTS.seed;
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(depth) || depth <= 0) {
    throw new Error('dimensiones de agua inválidas');
  }
  if (
    !Number.isSafeInteger(segmentsX) || segmentsX < 1 || segmentsX > WATER_MESH_MAX_SEGMENTS
    || !Number.isSafeInteger(segmentsZ) || segmentsZ < 1 || segmentsZ > WATER_MESH_MAX_SEGMENTS
  ) {
    throw new Error('segmentos de agua fuera de rango');
  }
  const cols = segmentsX + 1;
  const rows = segmentsZ + 1;
  const vertexCount = cols * rows;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const wavePhase = new Float32Array(vertexCount);
  const widthHalf = width / 2;
  const depthHalf = depth / 2;
  const stepW = width / segmentsX;
  const stepD = depth / segmentsZ;
  for (let j = 0; j < rows; j += 1) {
    /* z decrece con j (mismo resultado que PlaneGeometry tras rotateX(-PI/2)). */
    const z = depthHalf - j * stepD;
    for (let i = 0; i < cols; i += 1) {
      const o = j * cols + i;
      positions[o * 3] = -widthHalf + i * stepW;
      positions[o * 3 + 1] = 0;
      positions[o * 3 + 2] = z;
      uvs[o * 2] = i / segmentsX;
      uvs[o * 2 + 1] = j / segmentsZ;
      wavePhase[o] = hash2(i, j, seed);
    }
  }
  const indices = new Uint32Array(segmentsX * segmentsZ * 6);
  let k = 0;
  for (let j = 0; j < segmentsZ; j += 1) {
    for (let i = 0; i < segmentsX; i += 1) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      /* Con z decreciente, (a,b,c),(a,c,d) deja la normal +Y. */
      indices[k] = a;
      indices[k + 1] = b;
      indices[k + 2] = c;
      indices[k + 3] = a;
      indices[k + 4] = c;
      indices[k + 5] = d;
      k += 6;
    }
  }
  return {
    positions,
    uvs,
    indices,
    wavePhase,
    vertexCount,
    triangleCount: segmentsX * segmentsZ * 2,
  };
}
