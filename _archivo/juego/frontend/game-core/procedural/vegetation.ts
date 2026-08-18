/* GAME-01 — Vegetación procedural del toolkit (138A-1).
 * Muestreo por celda con jitter determinista (poisson-lite) y reglas por
 * zona: césped en interior, árboles lejos de la costa y pendientes, rocas en
 * costa/cimas. Respeta presupuestos máximos por tipo y distancias mínimas
 * (sin solapamiento) usando solo hash2: mismo seed → misma distribución. */

import { hash2 } from './noise';
import type { IslandHeightfield } from './heightmap';

export type VegetationKind = 'grass' | 'tree' | 'rock';

export interface VegetationPlacement {
  readonly kind: VegetationKind;
  /** Posición en unidades de mundo local (centro de celda + jitter). */
  readonly x: number;
  readonly z: number;
  /** Altura del terreno en el punto de plantado. */
  readonly y: number;
  /** Seed del prop para tronco/copa/roca determinista. */
  readonly seed: number;
  /** Escala determinista por instancia sobre `VEGETATION_BASE_SCALE`. */
  readonly scale: number;
}

export interface VegetationBudgets {
  readonly maxGrass?: number;
  readonly maxTrees?: number;
  readonly maxRocks?: number;
  readonly grassSpacing?: number;
  readonly treeSpacing?: number;
  readonly rockSpacing?: number;
}

export interface VegetationCounts {
  readonly grass: number;
  readonly tree: number;
  readonly rock: number;
}

export interface VegetationResult {
  readonly placements: readonly VegetationPlacement[];
  readonly counts: VegetationCounts;
  /** Celdas de tierra (y >= waterLevel) consideradas para el muestreo. */
  readonly landCells: number;
}

export const VEGETATION_DEFAULTS = {
  maxGrass: 420,
  maxTrees: 64,
  maxRocks: 26,
  grassSpacing: 1.5,
  treeSpacing: 3.2,
  rockSpacing: 2.6,
} as const;

/** Escala base global de vegetación/props (138A-6): reduce el tamaño por
 *  defecto (~0.5× sobre el rango histórico 0.8..1.25) sin magia en el
 *  adaptador visual; el documento y el preview la consumen vía `scale`. */
export const VEGETATION_BASE_SCALE = 0.5;

/* Márgenes de zona (fracción de maxHeight sobre el nivel del agua). */
const WATER_MARGIN = 0.08;
const COAST_ZONE = 0.18;
const GRASS_MIN = 0.30;
const PEAK_ZONE = 0.85;
/* Pendiente máxima (Δy entre vecinos) para césped y árboles. */
const SLOPE_LIMIT = 1.1;

export function placeVegetation(
  h: IslandHeightfield,
  seed: number,
  budgets: VegetationBudgets = {},
): VegetationResult {
  const maxGrass = budgets.maxGrass ?? VEGETATION_DEFAULTS.maxGrass;
  const maxTrees = budgets.maxTrees ?? VEGETATION_DEFAULTS.maxTrees;
  const maxRocks = budgets.maxRocks ?? VEGETATION_DEFAULTS.maxRocks;
  const grassSpacing = budgets.grassSpacing ?? VEGETATION_DEFAULTS.grassSpacing;
  const treeSpacing = budgets.treeSpacing ?? VEGETATION_DEFAULTS.treeSpacing;
  const rockSpacing = budgets.rockSpacing ?? VEGETATION_DEFAULTS.rockSpacing;
  if ([maxGrass, maxTrees, maxRocks].some(v => !Number.isSafeInteger(v) || v < 0)) {
    throw new Error('presupuestos inválidos');
  }
  if ([grassSpacing, treeSpacing, rockSpacing].some(v => !Number.isFinite(v) || v <= 0)) {
    throw new Error('distancias inválidas');
  }

  const placements: VegetationPlacement[] = [];
  /* Tipado mutable local: el contrato público (VegetationCounts) es readonly,
   * pero el acumulador interno se incrementa por tipo durante el muestreo. */
  const counts: { grass: number; tree: number; rock: number } = { grass: 0, tree: 0, rock: 0 };
  const { width, depth, heights, waterLevel, maxHeight } = h;
  let landCells = 0;

  const tooClose = (x: number, z: number, kind: VegetationKind): boolean => {
    for (const other of placements) {
      const dx = x - other.x;
      const dz = z - other.z;
      const distance = Math.hypot(dx, dz);
      if (kind === 'grass' && other.kind === 'grass') {
        if (distance < grassSpacing) return true;
      } else if (kind === 'tree' && other.kind === 'tree') {
        if (distance < treeSpacing) return true;
      } else if (kind === 'rock' && other.kind === 'rock') {
        if (distance < rockSpacing) return true;
      } else if ((kind === 'tree' && other.kind === 'rock') || (kind === 'rock' && other.kind === 'tree')) {
        /* Árboles y rocas comparten suelo: se evitan mutuamente. */
        if (distance < Math.min(treeSpacing, rockSpacing)) return true;
      }
    }
    return false;
  };

  for (let j = 0; j < depth; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const id = j * width + i;
      const y = heights[id];
      if (y < waterLevel) continue;
      landCells += 1;
      if (y < waterLevel + WATER_MARGIN * maxHeight) continue;

      const t = (y - waterLevel) / maxHeight;
      const slope = Math.max(
        Math.abs(y - heights[Math.max(0, j - 1) * width + i]),
        Math.abs(y - heights[Math.min(depth - 1, j + 1) * width + i]),
        Math.abs(y - heights[j * width + Math.max(0, i - 1)]),
        Math.abs(y - heights[j * width + Math.min(width - 1, i + 1)]),
      );
      const r = hash2(i, j, seed + 51);

      let kind: VegetationKind | null = null;
      if (t >= PEAK_ZONE) {
        if (r < 0.55) kind = 'rock';
      } else if (slope > SLOPE_LIMIT) {
        if (r < 0.50) kind = 'rock';
      } else if (t <= COAST_ZONE) {
        if (r < 0.35) kind = 'rock';
      } else if (t < GRASS_MIN) {
        if (r < 0.22) kind = 'grass';
      } else {
        if (r < 0.16) kind = 'tree';
        else if (r < 0.30) kind = 'grass';
      }
      if (kind === null) continue;
      if (counts[kind] >= (kind === 'grass' ? maxGrass : kind === 'tree' ? maxTrees : maxRocks)) {
        continue;
      }

      const px = i - width / 2 + 0.5 + (hash2(i, j, seed + 1) - 0.5) * 0.45;
      const pz = j - depth / 2 + 0.5 + (hash2(i, j, seed + 2) - 0.5) * 0.45;
      if (tooClose(px, pz, kind)) continue;
      counts[kind] += 1;
      placements.push({
        kind,
        x: px,
        z: pz,
        y,
        seed: hash2(i, j, seed + 7),
        scale: VEGETATION_BASE_SCALE * (0.8 + hash2(i, j, seed + 3) * 0.45),
      });
    }
  }
  return { placements, counts, landCells };
}
