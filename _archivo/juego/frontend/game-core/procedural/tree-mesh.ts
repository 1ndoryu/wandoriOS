/* GAME-01 — Árbol low-poly procedural del toolkit (138A-2). Datos puros en
 * espacio local: tronco cónico, ramas y copa por clusters; sin Three/DOM/red. */
import { hash2 } from './noise';
import {
  pushBox,
  pushQuad,
  rgb,
  VEGETATION_MESH_DEFAULTS,
  type MeshBuffers,
  type VegetationMeshData,
  type VegetationMeshPalette,
} from './vegetation-mesh';
export interface TreeMeshOptions {
  readonly scale?: number;
  readonly trunkHeight?: number;
  readonly foliageClusters?: number;
  readonly palette?: VegetationMeshPalette;
}
export const TREE_MESH_DEFAULTS = {
  scale: 1,
  trunkHeight: 2.1,
  foliageClusters: 3,
} as const;
export function buildTreeMeshData(
  seed: number,
  options: TreeMeshOptions = {},
): VegetationMeshData {
  const scale = options.scale ?? TREE_MESH_DEFAULTS.scale;
  const trunkHeight = options.trunkHeight ?? TREE_MESH_DEFAULTS.trunkHeight;
  const clusters = options.foliageClusters ?? TREE_MESH_DEFAULTS.foliageClusters;
  const palette = options.palette ?? VEGETATION_MESH_DEFAULTS;
  const hashSeed = Math.floor(seed * 1_000_000);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('escala inválida');
  if (!Number.isFinite(trunkHeight) || trunkHeight <= 0) throw new Error('altura inválida');
  if (!Number.isSafeInteger(clusters) || clusters < 1 || clusters > 4) {
    throw new Error('clusters fuera de rango');
  }
  const b: MeshBuffers = { positions: [], normals: [], colors: [], indices: [] };
  const trunkTop = trunkHeight * scale;
  const w0 = 0.42 * scale;
  const w1 = 0.22 * scale;
  pushTaperedBox(b, trunkTop, w0, w1, palette.trunk);
  const tips: [number, number, number][] = [];
  const ringY = [0.40, 0.64];
  for (let ring = 0; ring < 2; ring += 1) {
    for (let k = 0; k < 3; k += 1) {
      const angle = (k / 3) * Math.PI * 2 + (hash2(hashSeed, ring * 3 + k, hashSeed) - 0.5) * 0.6;
      const y = trunkTop * ringY[ring];
      const len = (0.55 + hash2(hashSeed, ring * 7 + k, hashSeed) * 0.25) * scale;
      const bx = Math.cos(angle) * len;
      const bz = Math.sin(angle) * len;
      pushRotatedBox(b, bx, y - 0.03 * scale, bz, 0.34 * scale, 0.12 * scale, 0.18 * scale, angle, palette.trunk);
      tips.push([bx, y + 0.06 * scale, bz]);
    }
  }
  pushBox(b, 0, trunkTop + 0.38 * scale, 0, 1.65 * scale, 0.85 * scale, 1.65 * scale, palette.leaf, 0);
  for (let i = 0; i < clusters - 1; i += 1) {
    const tip = tips[(i + Math.floor(hash2(hashSeed, 50 + i, hashSeed) * tips.length)) % tips.length];
    pushBox(b, tip[0], tip[1] + 0.18 * scale, tip[2], 0.85 * scale, 0.7 * scale, 0.85 * scale, palette.leafDark, 0);
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
/* Tronco cónico: 4 caras laterales + tapa superior (la base queda oculta). */
function pushTaperedBox(
  b: MeshBuffers,
  topY: number,
  w0: number,
  w1: number,
  hex: number,
): void {
  const half = Math.PI / 2;
  for (let s = 0; s < 4; s += 1) {
    const a0 = s * half;
    const a1 = a0 + half;
    const n = normalize(Math.cos(a0 + half / 2), 0.4, Math.sin(a0 + half / 2));
    pushQuad(
      b,
      [
        [Math.cos(a0) * w0, 0, Math.sin(a0) * w0],
        [Math.cos(a0) * w1, topY, Math.sin(a0) * w1],
        [Math.cos(a1) * w1, topY, Math.sin(a1) * w1],
        [Math.cos(a1) * w0, 0, Math.sin(a1) * w0],
      ],
      n,
      rgb(hex, 1),
    );
  }
  pushQuad(
    b,
    [
      [w1, topY, 0],
      [0, topY, w1],
      [-w1, topY, 0],
      [0, topY, -w1],
    ],
    [0, 1, 0],
    rgb(hex, 1),
  );
}
/* Caja de rama rotada alrededor de Y: 4 laterales + tapa (base oculta). */
function pushRotatedBox(
  b: MeshBuffers,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  angle: number,
  hex: number,
): void {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corner = (x: number, y: number, z: number): readonly [number, number, number] => [
    cx + x * cos - z * sin,
    cy + y,
    cz + x * sin + z * cos,
  ];
  const hx = sx / 2;
  const hz = sz / 2;
  const base = [
    corner(-hx, 0, -hz),
    corner(hx, 0, -hz),
    corner(hx, 0, hz),
    corner(-hx, 0, hz),
  ];
  const top = [
    corner(-hx, sy, -hz),
    corner(hx, sy, -hz),
    corner(hx, sy, hz),
    corner(-hx, sy, hz),
  ];
  for (let s = 0; s < 4; s += 1) {
    const next = (s + 1) % 4;
    pushQuad(b, [base[s], top[s], top[next], base[next]], [0, 0, 1], rgb(hex, 1));
  }
  pushQuad(b, [top[0], top[1], top[2], top[3]], [0, 1, 0], rgb(hex, 1));
}

function normalize(x: number, y: number, z: number): readonly [number, number, number] {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}
