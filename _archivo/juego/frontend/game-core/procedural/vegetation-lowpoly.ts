/* GAME-01 — Vegetación low-poly del toolkit (138A-2): árboles con ramas y
 * copa por clusters, césped por matas y rocas toon, traducidos a la posición
 * de cada placement. Datos puros; reutiliza los generadores del toolkit sin
 * duplicar mallas. */

import { buildGrassClumpMeshData } from './grass-mesh';
import { buildTreeMeshData } from './tree-mesh';
import type { VegetationPlacement } from './vegetation';
import {
  buildVegetationMeshData,
  VEGETATION_MESH_DEFAULTS,
  type MeshBuffers,
  type VegetationMeshData,
  type VegetationMeshPalette,
} from './vegetation-mesh';

export function buildLowPolyVegetationMeshData(
  placements: readonly VegetationPlacement[],
  palette: VegetationMeshPalette = VEGETATION_MESH_DEFAULTS,
): VegetationMeshData {
  const b: MeshBuffers = { positions: [], normals: [], colors: [], indices: [] };
  for (const p of placements) {
    const local =
      p.kind === 'tree'
        ? buildTreeMeshData(p.seed, { scale: p.scale, palette })
        : p.kind === 'grass'
          ? buildGrassClumpMeshData(p.seed, { scale: p.scale, palette })
          : buildVegetationMeshData([{ ...p, x: 0, y: 0, z: 0 }], palette);
    appendTranslated(b, local, p.x, p.y, p.z);
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

function appendTranslated(
  target: MeshBuffers,
  src: VegetationMeshData,
  dx: number,
  dy: number,
  dz: number,
): void {
  const base = target.positions.length / 3;
  for (let i = 0; i < src.positions.length; i += 3) {
    target.positions.push(src.positions[i] + dx, src.positions[i + 1] + dy, src.positions[i + 2] + dz);
  }
  for (const v of src.normals) target.normals.push(v);
  for (const v of src.colors) target.colors.push(v);
  for (const index of src.indices) target.indices.push(index + base);
}
