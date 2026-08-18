/* GAME-01 — Mesh indexado de heightfield suave (low poly) del toolkit (138A-1).
 * Datos puros: una celda = un vértice, normales por diferencias finitas del
 * grid, color por banda de altura (arena → hierba → roca) y métricas de
 * presupuesto sin GPU. El adaptador visual (comparador) sube estos arrays. */

import type { IslandHeightfield } from './heightmap';

export const HEIGHTFIELD_MESH_DEFAULTS = {
  cellSize: 1,
  uvScale: 1,
} as const;

export interface HeightfieldMeshOptions {
  readonly cellSize?: number;
  readonly uvScale?: number;
  /** Rampa de color por banda: [arena, hierba, roca] en RGB 0..1. */
  readonly colorRamp?: readonly (readonly [number, number, number])[];
  /** Superficies por celda (ids 0..15 del contrato MapVersion, 138A-9). */
  readonly surfaces?: Uint8Array;
  /** Color RGB 0..1 por id de superficie (p. ej. de la paleta del mundo). */
  readonly surfaceColors?: ReadonlyMap<number, readonly [number, number, number]>;
}

export interface HeightfieldMeshData {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly colors: Float32Array;
  readonly indices: Uint32Array;
  readonly width: number;
  readonly depth: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
}

const DEFAULT_COLOR_RAMP: readonly (readonly [number, number, number])[] = [
  [0.92, 0.84, 0.60], /* arena costera */
  [0.57, 0.80, 0.39], /* hierba */
  [0.64, 0.59, 0.50], /* roca alta */
];

export function buildHeightfieldMeshData(
  h: IslandHeightfield,
  options: HeightfieldMeshOptions = {},
): HeightfieldMeshData {
  const cellSize = options.cellSize ?? HEIGHTFIELD_MESH_DEFAULTS.cellSize;
  const uvScale = options.uvScale ?? HEIGHTFIELD_MESH_DEFAULTS.uvScale;
  const ramp = options.colorRamp ?? DEFAULT_COLOR_RAMP;
  const surfaces = options.surfaces;
  const surfaceColors = options.surfaceColors;
  const { width, depth, heights, waterLevel, maxHeight } = h;
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error('cellSize inválido');
  if (!Number.isFinite(uvScale) || uvScale <= 0) throw new Error('uvScale inválido');
  if (ramp.length !== 3) throw new Error('colorRamp inválido');
  if (heights.length !== width * depth) throw new Error('heightfield incompleto');
  if (surfaces !== undefined) {
    if (surfaces.length !== width * depth) throw new Error('superficies incompletas');
    for (const id of surfaces) {
      if (!Number.isInteger(id) || id < 0 || id > 15) throw new Error('id de superficie inválido');
    }
  }
  if (surfaces !== undefined && surfaceColors === undefined) {
    throw new Error('surfaceColors requerido con surfaces');
  }
  for (const y of heights) {
    if (!Number.isFinite(y)) throw new Error('altura inválida');
  }

  const vertexCount = width * depth;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array((width - 1) * (depth - 1) * 6);
  const halfX = (width - 1) / 2;
  const halfZ = (depth - 1) / 2;

  const at = (i: number, j: number): number => {
    const ci = Math.min(width - 1, Math.max(0, i));
    const cj = Math.min(depth - 1, Math.max(0, j));
    return heights[cj * width + ci];
  };

  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const vertex = j * width + i;
      const p = vertex * 3;
      const y = heights[vertex];
      positions[p] = (i - halfX) * cellSize;
      positions[p + 1] = y;
      positions[p + 2] = (j - halfZ) * cellSize;

      /* Normal por diferencias finitas: gradiente del grid en x/z. */
      const nx = at(i - 1, j) - at(i + 1, j);
      const nz = at(i, j - 1) - at(i, j + 1);
      const ny = 2 * cellSize;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals[p] = nx / len;
      normals[p + 1] = ny / len;
      normals[p + 2] = nz / len;

      uvs[vertex * 2] = (i / (width - 1)) * uvScale;
      uvs[vertex * 2 + 1] = (j / (depth - 1)) * uvScale;

      const depthShade = y < waterLevel ? 0.65 : 1;
      /* 138A-9: si hay superficies, el color del vértice es el de la celda
       * (esquina inferior-izquierda, recortada al borde); si no, banda de
       * altura de la rampa clásica. */
      const surfaceId = surfaces === undefined
        ? -1
        : surfaces[Math.min(depth - 2, j) * width + Math.min(width - 2, i)];
      const surfaceColor = surfaceId >= 0 ? surfaceColors!.get(surfaceId) : undefined;
      const c = surfaceColor ?? sampleRamp(ramp, heightBandT(y, waterLevel, maxHeight));
      colors[p] = c[0] * depthShade;
      colors[p + 1] = c[1] * depthShade;
      colors[p + 2] = c[2] * depthShade;
    }
  }

  let index = 0;
  for (let j = 0; j < depth - 1; j += 1) {
    for (let i = 0; i < width - 1; i += 1) {
      const topLeft = j * width + i;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;
      indices[index++] = topLeft;
      indices[index++] = bottomLeft;
      indices[index++] = topRight;
      indices[index++] = topRight;
      indices[index++] = bottomLeft;
      indices[index++] = bottomRight;
    }
  }

  return {
    positions,
    normals,
    uvs,
    colors,
    indices,
    width,
    depth,
    vertexCount,
    triangleCount: (width - 1) * (depth - 1) * 2,
  };
}

/** T normalizada de altura para la rampa por banda (arena→hierba→roca). */
function heightBandT(y: number, waterLevel: number, maxHeight: number): number {
  return Math.min(1, Math.max(0, (y - waterLevel) / Math.max(0.0001, maxHeight)));
}

/** Rampa lineal de 3 bandas: arena → hierba (0..0.35), hierba → roca (0.35..1). */
function sampleRamp(
  ramp: readonly (readonly [number, number, number])[],
  t: number,
): readonly [number, number, number] {
  const [sand, grass, rock] = ramp;
  if (t < 0.35) return lerpRgb(sand, grass, t / 0.35);
  return lerpRgb(grass, rock, Math.min(1, (t - 0.35) / 0.65));
}

function lerpRgb(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): readonly [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
