/* 138A-15 — Preset de estilo "Sakura Crossing" para el Constructor de mundo.
 * Datos puros y serializables (sin Three/DOM/red): define el contrato
 * `VisualStyleSettings` que persiste con el constructor y los valores del
 * look sakura (tinte de sombra, luces 2+1, rampa, sombras y cielo pastel).
 * La aplicación visual real vive en `game-sakura-toon.ts` / `game-sakura-pipeline.ts`
 * / `game-playable-scene.ts`; aquí solo hay datos y validación fail-closed.
 * Referencia: `Agente/documentacion/estilo-sakura-crossing/08-replicacion-constructor-wandorius.md`. */

import {
  skyPresetOptions,
  type SkyOptions,
} from '../../../game-core';

/** Estilos conmutables del constructor. `bosque` es el default histórico
 *  (Genshin-like low poly verde, sin tinta); `sakura` es el look del clon. */
export type VisualStyleKey = 'bosque' | 'sakura';

export const VISUAL_STYLE_KEYS: readonly VisualStyleKey[] = ['bosque', 'sakura'];

/** Ajustes completos del estilo actual, persistidos con el constructor. */
export interface VisualStyleSettings {
  /** Estilo activo (segmento del subpanel). */
  readonly key: VisualStyleKey;
  /** Outlines/tinta screen-space (solo aplica en `sakura`). Default false:
   *  el Bosque mantiene la decisión "sin tinta" del roadmap 13-ago. */
  readonly ink: boolean;
}

export const DEFAULT_VISUAL_STYLE: Readonly<VisualStyleSettings> = {
  key: 'bosque',
  ink: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isVisualStyleKey(value: unknown): value is VisualStyleKey {
  return typeof value === 'string' && (VISUAL_STYLE_KEYS as readonly string[]).includes(value);
}

/** Normaliza la clave del estilo; un valor inválido cae a `bosque`
 *  (fail-closed, mismo patrón que paleta/panel). */
export function normalizeVisualStyleKey(value: unknown): VisualStyleKey {
  return isVisualStyleKey(value) ? value : 'bosque';
}

/** Valida un ajuste de estilo completo; vacío = válido. */
export function validateVisualStyleSettings(value: unknown): readonly string[] {
  if (!isRecord(value)) return ['requiere un objeto de estilo'];
  const issues: string[] = [];
  if (!isVisualStyleKey(value.key)) issues.push('key no permitida');
  if (typeof value.ink !== 'boolean') issues.push('ink debe ser booleano');
  return issues;
}

export function isVisualStyleSettings(value: unknown): value is VisualStyleSettings {
  return validateVisualStyleSettings(value).length === 0;
}

/** Normaliza un ajuste de estilo (fail-closed: lanza ante un valor malo;
 *  los campos ausentes caen a los defaults). */
export function normalizeVisualStyle(value: unknown): VisualStyleSettings {
  if (value === undefined || value === null) return { ...DEFAULT_VISUAL_STYLE };
  const issues = validateVisualStyleSettings(value);
  if (issues.length > 0) {
    throw new Error(`estilo visual inválido: ${issues.join('; ')}`);
  }
  const record = value as Record<string, unknown>;
  return {
    key: normalizeVisualStyleKey(record.key),
    ink: typeof record.ink === 'boolean' ? record.ink : DEFAULT_VISUAL_STYLE.ink,
  };
}

/** Valores del look sakura (tinta apagada por defecto). Los colores de
 *  sombras/luces y la rampa 4-bandas provienen del clon (`toon.js` y
 *  `main.js`); los valores numéricos los afina la integración en escena. */
export const SAKURA_STYLE: Readonly<{
  readonly tint: number;
  readonly fillColor: number;
  readonly fillIntensity: number;
  readonly bounceColor: number;
  readonly bounceIntensity: number;
  readonly hemiColor: number;
  readonly hemiGround: number;
  readonly hemiIntensity: number;
  readonly rampBands: number;
  readonly sunColor: number;
  readonly sunIntensity: number;
  readonly shadows: boolean;
}> = {
  tint: 0x6c5f8c,
  fillColor: 0xa9bdf5,
  fillIntensity: 1.08,
  bounceColor: 0xd8cbe8,
  bounceIntensity: 0.34,
  hemiColor: 0xdcecff,
  hemiGround: 0xb6a6c6,
  hemiIntensity: 1.12,
  rampBands: 4,
  sunColor: 0xfff1d8,
  sunIntensity: 2.25,
  shadows: true,
};

/** Cielo pastel de sakura: preset `day` con paleta lavanda/crema y sol bajo.
 *  Se usa como `SkyOptions` completas (normalizadas) para `mountSkyDome`. */
export const SAKURA_SKY: Readonly<SkyOptions> = {
  ...skyPresetOptions('day'),
  zenith: 0x9fb6d8,
  horizon: 0xf2edf7,
  ground: 0xb9b0c4,
  sun: 0xfff1d8,
  deep: 0x7c8fb0,
  shadow: 0x9aaccc,
  mid: 0xc3cde0,
  light: 0xe4e3ee,
  high: 0xf6f3fa,
  sunEl: 34,
  sunAz: 160,
  coverage: 0.25,
  haze: 0.08,
};
