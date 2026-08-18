/* GAME-01 — Mata de césped procedural del toolkit (138A-2). Datos puros en
 * espacio local (base en y=0): N briznas en anillo, cada una de 2 quads
 * cruzados con doblado determinista; mismo seed → misma mata. */

import { hash2 } from './noise';
import {
  pushQuad,
  rgb,
  VEGETATION_MESH_DEFAULTS,
  type MeshBuffers,
  type VegetationMeshData,
  type VegetationMeshPalette,
} from './vegetation-mesh';

export interface GrassClumpOptions {
  readonly scale?: number;
  /** Briznas por mata: 1..24. */
  readonly bladeCount?: number;
  readonly bladeHeight?: number;
  readonly palette?: VegetationMeshPalette;
}

export const GRASS_CLUMP_DEFAULTS = {
  scale: 1,
  bladeCount: 7,
  bladeHeight: 0.34,
} as const;

export function buildGrassClumpMeshData(
  seed: number,
  options: GrassClumpOptions = {},
): VegetationMeshData {
  const scale = options.scale ?? GRASS_CLUMP_DEFAULTS.scale;
  const bladeCount = options.bladeCount ?? GRASS_CLUMP_DEFAULTS.bladeCount;
  const bladeHeight = options.bladeHeight ?? GRASS_CLUMP_DEFAULTS.bladeHeight;
  const palette = options.palette ?? VEGETATION_MESH_DEFAULTS;
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('escala inválida');
  if (!Number.isSafeInteger(bladeCount) || bladeCount < 1 || bladeCount > 24) {
    throw new Error('briznas fuera de rango');
  }
  if (!Number.isFinite(bladeHeight) || bladeHeight <= 0) throw new Error('altura inválida');
  const hashSeed = Math.floor(seed * 1_000_000);

  const b: MeshBuffers = { positions: [], normals: [], colors: [], indices: [] };
  const radius = 0.07 * scale;
  const width = 0.05 * scale;
  for (let k = 0; k < bladeCount; k += 1) {
    const angle = (k / bladeCount) * Math.PI * 2 + (hash2(hashSeed, k, hashSeed) - 0.5) * 0.8;
    const h = (0.75 + hash2(hashSeed, k + 100, hashSeed) * 0.45) * bladeHeight * scale;
    const bend = (0.06 + hash2(hashSeed, k + 200, hashSeed) * 0.10) * h;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const bx = dx * radius;
    const bz = dz * radius;
    const tx = bx + dx * bend;
    const tz = bz + dz * bend;
    /* Quad 1: ancho perpendicular a la dirección de doblado. */
    pushQuad(
      b,
      [[bx + dz * width, 0, bz - dx * width], [bx - dz * width, 0, bz + dx * width],
        [tx - dz * width, h, tz + dx * width], [tx + dz * width, h, tz - dx * width]],
      [dx, 0, dz],
      rgb(palette.grass, 1),
    );
    /* Quad 2: cruzado, a lo largo de la dirección (más fino). */
    const w2 = width * 0.55;
    pushQuad(
      b,
      [[bx - dx * w2, 0, bz - dz * w2], [bx + dx * w2, 0, bz + dz * w2],
        [tx + dx * w2, h, tz + dz * w2], [tx - dx * w2, h, tz - dz * w2]],
      [-dz, 0, dx],
      rgb(palette.grass, 0.94),
    );
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
