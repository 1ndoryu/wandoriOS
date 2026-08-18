/* 138A-8 — Paleta unificada del mundo del Constructor.
 * Datos puros y serializables (sin Three/DOM/red): única fuente de verdad de
 * los colores del mundo (terreno, agua, vegetación, rocas y bloques). La capa
 * de presentación la traduce a vertex colors, rampas de heightfield y
 * materiales toon; el panel de Color la edita y persiste con 138A-5. */

export const WORLD_PALETTE_KEYS = [
  'grass',
  'dirt',
  'sand',
  'sandSide',
  'trunk',
  'leaf',
  'leafDark',
  'rock',
  'rockDark',
  'waterDeep',
  'waterShallow',
  'foam',
  'sky',
] as const;

export type WorldPaletteKey = (typeof WORLD_PALETTE_KEYS)[number];

export interface WorldPalette {
  readonly grass: number;
  readonly dirt: number;
  readonly sand: number;
  readonly sandSide: number;
  readonly trunk: number;
  readonly leaf: number;
  readonly leafDark: number;
  readonly rock: number;
  readonly rockDark: number;
  readonly waterDeep: number;
  readonly waterShallow: number;
  readonly foam: number;
  readonly sky: number;
}

/** Valores actuales del Bosque (paridad con BLOCK_COLORS / rampa suave). */
export const WORLD_PALETTE_DEFAULTS: WorldPalette = {
  grass: 0x86c65c,
  dirt: 0x9b6b46,
  sand: 0xe8d8a0,
  sandSide: 0xd3bf86,
  trunk: 0x8a5a34,
  leaf: 0x63b543,
  leafDark: 0x4c9233,
  rock: 0x9d9d96,
  rockDark: 0x7d7d78,
  waterDeep: 0x36a79e,
  waterShallow: 0x63c9bb,
  foam: 0xeafbf5,
  sky: 0xaecfc4,
};

/** [138A-15] Paleta Sakura Crossing (pastel teal/violeta) sobre los MISMOS
 * 13 tokens: el constructor cambia de look sin tocar meshers ni assets.
 *  Equivalencias documentadas en
 *  `Agente/documentacion/estilo-sakura-crossing/08-replicacion-constructor-wandorius.md`
 *  (Paso 5): verdes con sesgo teal, blancos cálidos y un único acento cálido
 *  por zona. */
export const WORLD_PALETTE_SAKURA: WorldPalette = {
  grass: 0x86ab84,
  dirt: 0xc9bfae,
  sand: 0xdccaa6,
  sandSide: 0xcfc6bc,
  trunk: 0x9a8082,
  leaf: 0x5aa578,
  leafDark: 0x3f7f60,
  rock: 0xc6c0cb,
  rockDark: 0xa39daf,
  waterDeep: 0x6d90ad,
  waterShallow: 0x93b8ce,
  foam: 0xcadff0,
  sky: 0xe6ecf7,
};

const PALETTE_LIMITS = {
  min: 0x000000,
  max: 0xffffff,
} as const;

/** Valida una paleta completa; devuelve mensajes en español (vacío = válida). */
export function validateWorldPalette(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return ['requiere un objeto de paleta'];
  }
  const record = value as Record<string, unknown>;
  const issues: string[] = [];
  for (const key of Object.keys(record)) {
    if (!WORLD_PALETTE_KEYS.includes(key as WorldPaletteKey)) {
      issues.push(`clave no permitida: ${key}`);
    }
  }
  for (const key of WORLD_PALETTE_KEYS) {
    const entry = record[key];
    if (typeof entry !== 'number' || !Number.isInteger(entry)
      || entry < PALETTE_LIMITS.min || entry > PALETTE_LIMITS.max) {
      issues.push(`${key} debe ser un color hex entero`);
    }
  }
  return issues;
}

/** Normaliza una paleta completa (fail-closed: lanza ante cualquier valor malo). */
export function normalizeWorldPalette(value: unknown): WorldPalette {
  const issues = validateWorldPalette(value);
  if (issues.length > 0) throw new Error(`paleta del mundo inválida: ${issues.join('; ')}`);
  return { ...(value as WorldPalette) };
}

/** Rampa 3-banda [arena, hierba, roca] en RGB 0..1 para el heightfield suave. */
export function worldPaletteToHeightfieldRamp(
  palette: WorldPalette,
): readonly (readonly [number, number, number])[] {
  return [hexToRgb(palette.sand), hexToRgb(palette.grass), hexToRgb(palette.rock)];
}

/** Paleta de mallas de vegetación low-poly (césped/tronco/follaje/rocas). */
export function worldPaletteToVegetationPalette(
  palette: WorldPalette,
): {
  readonly grass: number;
  readonly trunk: number;
  readonly leaf: number;
  readonly leafDark: number;
  readonly rock: number;
  readonly rockDark: number;
} {
  return {
    grass: palette.grass,
    trunk: palette.trunk,
    leaf: palette.leaf,
    leafDark: palette.leafDark,
    rock: palette.rock,
    rockDark: palette.rockDark,
  };
}

/** Colores RGB 0..1 por id de superficie (contrato 0..15; 138A-9 usa 0..3).
 *  El camino usa `dirt` para que el panel de Color lo gobierne también. */
export function worldPaletteToSurfaceColors(
  palette: WorldPalette,
): ReadonlyMap<number, readonly [number, number, number]> {
  return new Map<number, readonly [number, number, number]>([
    [0, hexToRgb(palette.grass)],
    [1, hexToRgb(palette.waterDeep)],
    [2, hexToRgb(palette.sand)],
    [3, hexToRgb(palette.dirt)],
  ]);
}

function hexToRgb(hex: number): readonly [number, number, number] {
  return [
    ((hex >> 16) & 0xff) / 255,
    ((hex >> 8) & 0xff) / 255,
    (hex & 0xff) / 255,
  ];
}
