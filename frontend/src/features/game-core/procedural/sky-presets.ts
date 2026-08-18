/* 138A-12 — Presets serializables del cielo (skydome procedural y ambiente).
 * Datos puros sin Three/DOM/red: paleta de 9 colores (hex 0xRRGGBB) +
 * elevación/azimut del sol. Separado de sky-options.ts para mantener el
 * contrato principal bajo el umbral de meta (<300 líneas efectivas). */

/** Clave estable de un preset de cielo. */
export type SkyPresetKey = 'day' | 'golden' | 'dusk' | 'overcast';

/** Paleta de 9 colores de un preset (hex 0xRRGGBB). */
export interface SkyPalette {
  /** Zenit del cielo. */
  readonly zenith: number;
  /** Color del horizonte. */
  readonly horizon: number;
  /** Color bajo el horizonte. */
  readonly ground: number;
  /** Color del sol. */
  readonly sun: number;
  /** Sombra profunda de la paleta de nubes. */
  readonly deep: number;
  /** Sombra media de la paleta de nubes. */
  readonly shadow: number;
  /** Tono medio de la paleta de nubes. */
  readonly mid: number;
  /** Tono claro de la paleta de nubes. */
  readonly light: number;
  /** Tono alto (brillos) de la paleta de nubes. */
  readonly high: number;
}

/** Presets del cielo (paleta + posición del sol). */
export const SKY_PRESETS: readonly {
  readonly key: SkyPresetKey;
  readonly label: string;
  readonly colors: SkyPalette;
  readonly sunEl: number;
  readonly sunAz: number;
}[] = [
  {
    key: 'day',
    label: 'Día',
    colors: {
      zenith: 0x8fb6ce, horizon: 0xefe4c8, ground: 0x9fb0b4, sun: 0xfff6dc,
      deep: 0x5c8399, shadow: 0x7da2b6, mid: 0xaac0c6, light: 0xddd9c3, high: 0xf6eed6,
    },
    sunEl: 38,
    sunAz: 150,
  },
  {
    key: 'golden',
    label: 'Dorado',
    colors: {
      zenith: 0x6e94be, horizon: 0xf7c99a, ground: 0xa89380, sun: 0xffdca0,
      deep: 0x5f7a96, shadow: 0x8f93a8, mid: 0xcbafa6, light: 0xf0c9a4, high: 0xffebc8,
    },
    sunEl: 9,
    sunAz: 200,
  },
  {
    key: 'dusk',
    label: 'Atardecer',
    colors: {
      zenith: 0x3e4e78, horizon: 0xb98ca0, ground: 0x4a4a62, sun: 0xffc5a8,
      deep: 0x34405e, shadow: 0x56628a, mid: 0x8a7e9c, light: 0xc79ba0, high: 0xefc3b0,
    },
    sunEl: 2,
    sunAz: 250,
  },
  {
    key: 'overcast',
    label: 'Nublado',
    colors: {
      zenith: 0x9aa9b4, horizon: 0xc8cdd0, ground: 0xa5adb2, sun: 0xe9eef2,
      deep: 0x6d7c88, shadow: 0x8895a0, mid: 0xa6b2ba, light: 0xc9d1d6, high: 0xe6ebee,
    },
    sunEl: 52,
    sunAz: 110,
  },
];
