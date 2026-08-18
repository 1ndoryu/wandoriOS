/* GAME-01 — Malla toon de vegetación del toolkit (138A-1).
 * Datos puros (sin Three): emite arrays indexados de césped (cruces), árboles
 * (tronco + follaje) y rocas (cajas), con la misma gramática boxy del mesher
 * del experimento 128A-1 pero sin depender de la capa app: game-core no puede
 * importar game-playable y el toolkit debe ser autónomo. */

import { hash2 } from './noise';
import type { VegetationPlacement } from './vegetation';

export interface VegetationMeshData {
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly indices: number[];
  readonly vertexCount: number;
  readonly triangleCount: number;
}

export interface VegetationMeshPalette {
  readonly grass: number;
  readonly trunk: number;
  readonly leaf: number;
  readonly leafDark: number;
  readonly rock: number;
  readonly rockDark: number;
}

/* Misma paleta que el experimento 128A-1 para que el comparador sea honesto. */
export const VEGETATION_MESH_DEFAULTS: VegetationMeshPalette = {
  grass: 0x86c65c,
  trunk: 0x8a5a34,
  leaf: 0x63b543,
  leafDark: 0x4c9233,
  rock: 0x9d9d96,
  rockDark: 0x7d7d78,
};

export interface MeshBuffers {
  readonly positions: number[];
  readonly normals: number[];
  readonly colors: number[];
  readonly indices: number[];
}

const SIDE_AO = 0.86;
const BOTTOM_AO = 0.72;

export function buildVegetationMeshData(
  placements: readonly VegetationPlacement[],
  palette: VegetationMeshPalette = VEGETATION_MESH_DEFAULTS,
): VegetationMeshData {
  const b: MeshBuffers = { positions: [], normals: [], colors: [], indices: [] };
  for (const placement of placements) {
    const jitter = (hash2(placement.x * 3, placement.z * 3, placement.seed) - 0.5) * 0.08;
    if (placement.kind === 'grass') emitGrass(b, placement, palette.grass, jitter);
    else if (placement.kind === 'tree') emitTree(b, placement, palette, jitter);
    else emitRock(b, placement, palette, jitter);
  }
  return {
    positions: b.positions,
    normals: b.normals,
    colors: b.colors,
    indices: b.indices,
    vertexCount: b.positions.length / 3,
    triangleCount: b.indices.length / 3,
  };
}

export function rgb(hex: number, mul: number): readonly [number, number, number] {
  return [
    (((hex >> 16) & 0xff) / 255) * mul,
    (((hex >> 8) & 0xff) / 255) * mul,
    ((hex & 0xff) / 255) * mul,
  ];
}

export function pushQuad(
  b: MeshBuffers,
  p: readonly (readonly number[])[],
  n: readonly number[],
  color: readonly [number, number, number],
): void {
  const base = b.positions.length / 3;
  for (const point of p) b.positions.push(point[0], point[1], point[2]);
  for (let k = 0; k < 4; k += 1) {
    b.normals.push(n[0], n[1], n[2]);
    b.colors.push(color[0], color[1], color[2]);
  }
  b.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

/** Caja toon: cara superior, 4 laterales con AO y base (la base queda oculta). */
export function pushBox(
  b: MeshBuffers,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  hex: number,
  jitter: number,
): void {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const y0 = cy;
  const y1 = cy + sy;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  pushQuad(b, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], rgb(hex, 1 + jitter));
  pushQuad(b, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], rgb(hex, BOTTOM_AO + jitter));
  pushQuad(b, [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], [1, 0, 0], rgb(hex, SIDE_AO + jitter));
  pushQuad(b, [[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], [-1, 0, 0], rgb(hex, SIDE_AO + jitter));
  pushQuad(b, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], rgb(hex, SIDE_AO + jitter));
  pushQuad(b, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], rgb(hex, SIDE_AO + jitter));
}

/* Césped: dos cruces verticales finas para que se lea desde cualquier ángulo. */
function emitGrass(b: MeshBuffers, p: VegetationPlacement, hex: number, jitter: number): void {
  const h0 = p.y;
  const h1 = p.y + 0.32 * p.scale;
  const w = 0.07 * p.scale;
  pushQuad(b, [[p.x - w, h0, p.z], [p.x - w, h0, p.z + w], [p.x - w, h1, p.z + w], [p.x - w, h1, p.z]], [-1, 0, 0], rgb(hex, 1 + jitter));
  pushQuad(b, [[p.x + w, h0, p.z + w], [p.x + w, h0, p.z], [p.x + w, h1, p.z], [p.x + w, h1, p.z + w]], [1, 0, 0], rgb(hex, 1 + jitter));
  pushQuad(b, [[p.x, h0, p.z - w], [p.x + w, h0, p.z - w], [p.x + w, h1, p.z - w], [p.x, h1, p.z - w]], [0, 0, -1], rgb(hex, 1 + jitter));
  pushQuad(b, [[p.x + w, h0, p.z + w], [p.x, h0, p.z + w], [p.x, h1, p.z + w], [p.x + w, h1, p.z + w]], [0, 0, 1], rgb(hex, 1 + jitter));
}

function emitTree(b: MeshBuffers, p: VegetationPlacement, palette: VegetationMeshPalette, jitter: number): void {
  const s = p.scale;
  const trunkH = (1.8 + p.seed * 0.6) * s;
  pushBox(b, p.x, p.y, p.z, 0.45 * s, trunkH, 0.45 * s, palette.trunk, jitter);
  pushBox(b, p.x, p.y + trunkH - 0.30 * s, p.z, 1.9 * s, 1.3 * s, 1.9 * s, palette.leafDark, jitter);
  pushBox(b, p.x, p.y + trunkH + 0.55 * s, p.z, 1.25 * s, 1.15 * s, 1.25 * s, palette.leaf, jitter);
}

function emitRock(b: MeshBuffers, p: VegetationPlacement, palette: VegetationMeshPalette, jitter: number): void {
  const s = p.scale;
  pushBox(b, p.x, p.y, p.z, 1.25 * s, 0.85 * s, 1.05 * s, palette.rock, jitter);
  pushBox(b, p.x + 0.45 * s, p.y, p.z - 0.25 * s, 0.65 * s, 0.5 * s, 0.6 * s, palette.rockDark, jitter);
}
