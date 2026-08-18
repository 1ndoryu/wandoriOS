/* GAME-01 — Mesher de bloques del Bosque (Minecraft).
 * Datos puros, sin THREE: emite arrays tipados (posición/normal/uv/color) de
 * caras de cubo unitario. La cara superior es hierba/arena; las laterales se
 * emiten SOLO donde el vecino es más bajo u océano, subdivididas por bloque
 * con jitter y AO para que la altura se lea "por bloques".
 * [138A-8] Los colores son opcionales (default = BLOCK_COLORS): el panel de
 * Paleta pasa una WorldPalette personalizada sin cambiar la geometría. */

import {
  BEACH_LEVEL,
  OCEAN_LEVEL,
  cellCenterX,
  cellCenterZ,
  hash2,
  type BlockHeightmap,
} from './game-block-heightmap';
import {
  BLOCK_COLORS,
  BLOCK_SIDE_AO,
  tintRgb,
  type BlockColors,
} from './game-block-palette';

export interface BlockMeshData {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly colors: number[];
}

export type BlockPropKind = 'tree' | 'rock';

export interface BlockPropPlacement {
  readonly kind: BlockPropKind;
  /** Posición en unidades de mundo local (1 bloque = 1 unidad). */
  readonly x: number;
  readonly z: number;
  /** Altura del bloque de hierba sobre el que se asienta. */
  readonly baseY: number;
  /** Seed del prop para tronco/copa/roca determinista. */
  readonly seed: number;
}

function makeBuf(): BlockMeshData {
  return { positions: [], normals: [], uvs: [], colors: [] };
}

function pushQuad(
  b: BlockMeshData,
  p: readonly (readonly number[])[],
  n: readonly number[],
  uv: readonly (readonly number[])[],
  c: readonly (readonly number[])[],
): void {
  const order = [0, 1, 2, 0, 2, 3];
  for (const k of order) {
    b.positions.push(p[k][0], p[k][1], p[k][2]);
    b.normals.push(n[0], n[1], n[2]);
    b.uvs.push(uv[k][0], uv[k][1]);
    b.colors.push(c[k][0], c[k][1], c[k][2]);
  }
}

/* Cara horizontal en y; up=false la invierte (parte inferior, no usada hoy). */
function quadY(b: BlockMeshData, x0: number, x1: number, z0: number, z1: number, y: number, c: readonly number[]): void {
  const p = [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];
  const uv = [[x0, z0], [x0, z1], [x1, z1], [x1, z0]];
  pushQuad(b, p, [0, 1, 0], uv, [c, c, c, c]);
}

/* Cara vertical desde (ox,oz) a lo largo de (ux,uz); normal = (-uz, 0, ux). */
function quadV(
  b: BlockMeshData,
  ox: number,
  oz: number,
  ux: number,
  uz: number,
  len: number,
  y0: number,
  y1: number,
  cBot: readonly number[],
  cTop: readonly number[],
): void {
  const ex = ox + ux * len, ez = oz + uz * len;
  const p = [[ox, y0, oz], [ex, y0, ez], [ex, y1, ez], [ox, y1, oz]];
  const uv = p.map(q => [ux !== 0 ? q[0] : q[2], q[1]]);
  pushQuad(b, p, [-uz, 0, ux], uv, [cBot, cBot, cTop, cTop]);
}

/* Cara lateral de un bloque con jitter por bloque y AO en la base. */
function blockSide(
  b: BlockMeshData,
  ox: number,
  oz: number,
  ux: number,
  uz: number,
  y0: number,
  hex: number,
  jitter: number,
): void {
  const shade = 1 + jitter;
  const cTop = tintRgb(hex, shade);
  const cBot = tintRgb(hex, shade * BLOCK_SIDE_AO);
  quadV(b, ox, oz, ux, uz, 1, y0, y0 + 1, cBot, cTop);
}

/* ---------------- terreno ---------------- */
export function buildBlockTerrainMeshData(
  h: BlockHeightmap,
  seed: number,
  colors: BlockColors = BLOCK_COLORS,
): BlockMeshData {
  const b = makeBuf();
  const { width, depth, levels } = h;

  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const lvl = levels[j * width + i];
      if (lvl < 0) continue;

      const x0 = cellCenterX(h, i) - 0.5, x1 = x0 + 1;
      const z0 = cellCenterZ(h, j) - 0.5, z1 = z0 + 1;
      const yT = lvl;
      const beach = lvl === BEACH_LEVEL;
      const topHex = beach ? colors.sand : colors.grass;
      const sideHex = beach ? colors.sandSide : colors.dirt;

      /* Cara superior con jitter suave. */
      const topJit = (hash2(i, j, seed + 3) - 0.5) * 0.05;
      quadY(b, x0, x1, z0, z1, yT, tintRgb(topHex, 1 + topJit));

      /* Caras laterales expuestas, por bloque. */
      const at = (di: number, dj: number): number => {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= width || nj >= depth) return OCEAN_LEVEL;
        return levels[nj * width + ni];
      };
      const sides: readonly (readonly [number, number, number, number, number, number])[] = [
        /* [ox, oz, ux, uz, di, dj] */
        [x1, z1, 0, -1, 1, 0],   // +x
        [x0, z0, 0, 1, -1, 0],   // -x
        [x0, z1, 1, 0, 0, 1],    // +z
        [x1, z0, -1, 0, 0, -1],  // -z
      ];
      for (const [ox, oz, ux, uz, di, dj] of sides) {
        const nh = at(di, dj);
        if (nh >= lvl) continue;
        const fromY = nh >= 0 ? nh : -1; // acantilado costero hasta el fondo
        for (let y0 = fromY; y0 < lvl; y0 += 1) {
          const jitter = (hash2(i, j + y0 * 13, seed + 7) - 0.5) * 0.08;
          blockSide(b, ox, oz, ux, uz, y0, sideHex, jitter);
        }
      }
    }
  }
  return b;
}

/* ---------------- props ---------------- */
export function placeBlockProps(h: BlockHeightmap, seed: number, count: number): BlockPropPlacement[] {
  const placements: BlockPropPlacement[] = [];
  const used = new Set<number>();
  const neighbors: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let tries = 0;
  while (placements.length < count && tries < count * 80) {
    tries += 1;
    const i = Math.floor(hash2(tries, 11, seed) * h.width);
    const j = Math.floor(hash2(tries, 29, seed) * h.depth);
    const key = j * h.width + i;
    if (used.has(key)) continue;
    const lvl = h.levels[key];
    if (lvl < 2) continue; // solo hierba alta, no playa ni borde

    let blocked = false;
    for (const [di, dj] of neighbors) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= h.width || nj >= h.depth) continue;
      if (used.has(nj * h.width + ni)) { blocked = true; break; }
    }
    if (blocked) continue;

    const kind: BlockPropKind = hash2(i, j, seed + 3) > 0.30 ? 'tree' : 'rock';
    used.add(key);
    placements.push({
      kind,
      x: cellCenterX(h, i) + (hash2(i, j, seed + 1) - 0.5) * 0.3,
      z: cellCenterZ(h, j) + (hash2(i, j, seed + 2) - 0.5) * 0.3,
      baseY: lvl,
      seed: hash2(i, j, seed + 7),
    });
  }
  return placements;
}

/* Caja toon con una cara superior y 4 laterales (la base queda oculta). */
function emitBox(
  b: BlockMeshData,
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
  hex: number,
  jitter: number,
): void {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const z0 = cz - sz / 2, z1 = cz + sz / 2;
  const y0 = cy, y1 = cy + sy;
  const shade = 1 + jitter;
  quadY(b, x0, x1, z0, z1, y1, tintRgb(hex, shade));
  quadV(b, x1, z1, 0, -1, sz, y0, y1, tintRgb(hex, shade * BLOCK_SIDE_AO), tintRgb(hex, shade));
  quadV(b, x0, z0, 0, 1, sz, y0, y1, tintRgb(hex, shade * BLOCK_SIDE_AO), tintRgb(hex, shade));
  quadV(b, x0, z1, 1, 0, sx, y0, y1, tintRgb(hex, shade * BLOCK_SIDE_AO), tintRgb(hex, shade));
  quadV(b, x1, z0, -1, 0, sx, y0, y1, tintRgb(hex, shade * BLOCK_SIDE_AO), tintRgb(hex, shade));
}

function emitTree(b: BlockMeshData, p: BlockPropPlacement, colors: BlockColors): void {
  /* Árbol toon (no bloques) de ~4-6 bloques: tronco + dos capas de follaje,
   * igual que la referencia pero con el tamaño correcto. */
  const trunkH = 2.2 + p.seed * 0.6; // 2.2..2.8
  const jit = (x: number, y: number): number => (hash2(x, y, p.seed * 977 + 31) - 0.5) * 0.05;
  emitBox(b, p.x, p.baseY, p.z, 0.7, trunkH, 0.7, colors.trunk, jit(p.x, p.z));
  emitBox(b, p.x, p.baseY + trunkH - 0.25, p.z, 3.0, 1.7, 3.0, colors.leafDark, jit(p.x, p.z + 1));
  emitBox(b, p.x, p.baseY + trunkH + 1.0, p.z, 2.0, 1.6, 2.0, colors.leaf, jit(p.x + 1, p.z));
}

function emitRock(b: BlockMeshData, p: BlockPropPlacement, colors: BlockColors): void {
  const jit = (hash2(p.x * 3, p.z * 3, p.seed) - 0.5) * 0.05;
  emitBox(b, p.x, p.baseY, p.z, 1.3, 0.9, 1.1, colors.rock, jit);
  emitBox(b, p.x + 0.45, p.baseY, p.z - 0.25, 0.65, 0.5, 0.6, colors.rockDark, jit);
}

export function buildBlockPropsMeshData(
  placements: readonly BlockPropPlacement[],
  colors: BlockColors = BLOCK_COLORS,
): BlockMeshData {
  const b = makeBuf();
  for (const p of placements) {
    if (p.kind === 'tree') emitTree(b, p, colors);
    else emitRock(b, p, colors);
  }
  return b;
}
