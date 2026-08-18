/* GAME-01 — Paleta de bloques del Bosque (estilo Minecraft).
 * [138A-8] Los tokens únicos viven en game-core (WorldPalette); esta capa
 * solo re-exporta los defaults y el tipo de colores que consumen los meshers.
 * Las mallas aplican jitter y AO por vértice. */

import { WORLD_PALETTE_DEFAULTS, type WorldPalette } from '../world-palette';

export type BlockColors = WorldPalette;

/** Tokens históricos del mesher de bloques (paridad con la paleta global). */
export const BLOCK_COLORS: BlockColors = WORLD_PALETTE_DEFAULTS;

/* AO falso en la base de las caras laterales de un bloque. */
export const BLOCK_SIDE_AO = 0.78;

/** Convierte un hex en [r, g, b] lineales (0..1) multiplicados por `mul`. */
export function tintRgb(hex: number, mul: number): [number, number, number] {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return [r * mul, g * mul, b * mul];
}
