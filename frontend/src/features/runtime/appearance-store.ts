/* wandori.us — Appearance Store (panel de control 297A-29)
 * Apariencia del OS por usuario: fondo de pantalla, fuente y escala.
 * Los valores efectivos (user ?? default del admin) llegan ya resueltos del
 * backend; este store solo los aplica a los tokens CSS del shell y persiste
 * la copia local para invitados/offline. Restaurar = volver a los defaults
 * del admin (los tokens por defecto del CSS). */

import { createStore, type StoreSource } from '../../store';

export type OsFont = 'system' | 'mono' | 'sans';

export interface AppearanceState {
  /** URL/imagen del fondo, o '' = trama por defecto del OS. */
  readonly wallpaper: string;
  /** Familia del OS: `system` (JetBrains Mono), `mono` o `sans`. */
  readonly font: OsFont;
  /** Factor de escala de texto del shell (1 = default). */
  readonly scale: number;
}

export const DEFAULT_APPEARANCE: AppearanceState = {
  wallpaper: '',
  font: 'system',
  scale: 1,
};

const STORAGE_KEY = 'wandorius:apariencia';
const SCALE_MIN = 0.85;
const SCALE_MAX = 1.3;
/* Rango amplio de valores válidos: fuera de él el dato está corrupto. */
const SCALE_ABS_MIN = 0.5;
const SCALE_ABS_MAX = 2.0;

/* Tokens de tamaño que la escala multiplica (texto del shell). */
const SCALED_SIZE_TOKENS: ReadonlyArray<readonly [string, number]> = [
  ['--sistema-texto-tamano', 13],
  ['--menu-size', 13],
  ['--tamano-texto', 13],
  ['--tamano-pequeno', 11],
  ['--tamano-grande', 15],
  ['--tamano-titulo', 16],
  ['--tamano-titulo-grande', 20],
];

export function isOsFont(value: unknown): value is OsFont {
  return value === 'system' || value === 'mono' || value === 'sans';
}

export function normalizeScale(value: number): number {
  if (!Number.isFinite(value) || value < SCALE_ABS_MIN || value > SCALE_ABS_MAX) {
    return DEFAULT_APPEARANCE.scale;
  }
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

/** Leer la copia local (invitado/offline) con fallback a los defaults. */
function readStoredAppearance(): AppearanceState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearanceState>;
    return {
      wallpaper: typeof parsed.wallpaper === 'string' ? parsed.wallpaper : '',
      font: isOsFont(parsed.font) ? parsed.font : 'system',
      scale: normalizeScale(typeof parsed.scale === 'number' ? parsed.scale : 1),
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export const appearanceStore = createStore<AppearanceState>(readStoredAppearance());

/* Aplicar apariencia a los tokens CSS del shell (y persistir copia local). */
export function applyAppearance(appearance: AppearanceState): void {
  const root = document.documentElement;

  if (appearance.wallpaper) {
    root.style.setProperty('--sistema-trama-escritorio', `url("${appearance.wallpaper}")`);
    root.style.setProperty('--sistema-trama-tamano', 'cover');
  } else {
    /* Quitar el inline para que el CSS (que adapta la trama al tema claro
     * u oscuro) vuelva a ser la fuente. */
    root.style.removeProperty('--sistema-trama-escritorio');
    root.style.removeProperty('--sistema-trama-tamano');
  }

  const fontStack =
    appearance.font === 'sans'
      ? 'system-ui, -apple-system, "Segoe UI", sans-serif'
      : appearance.font === 'mono'
        ? 'ui-monospace, "Cascadia Code", "Consolas", monospace'
        : '\'JetBrains Mono\', ui-monospace, monospace';
  root.style.setProperty('--fuente-sistema', fontStack);

  for (const [token, basePx] of SCALED_SIZE_TOKENS) {
    root.style.setProperty(token, `${Math.round(basePx * appearance.scale)}px`);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    /* Almacenamiento no disponible: solo sesión. */
  }
}

appearanceStore.subscribe((appearance, source) => {
  applyAppearance(appearance);
  void source;
});

/** Aplicar apariencia y persistir sin notificar (init del shell). */
export function initAppearance(appearance: AppearanceState): void {
  applyAppearance(appearance);
  appearanceStore.set(appearance, 'init');
}

/** Actualizar un campo; `''` en wallpaper restaura el default del OS. */
export function setAppearanceField(
  field: keyof AppearanceState,
  value: string | number,
  source: StoreSource = 'user',
): void {
  const current = appearanceStore.get();
  if (field === 'font' && isOsFont(value)) {
    appearanceStore.set({ ...current, font: value }, source);
  } else if (field === 'wallpaper' && typeof value === 'string') {
    appearanceStore.set({ ...current, wallpaper: value }, source);
  } else if (field === 'scale' && typeof value === 'number') {
    appearanceStore.set({ ...current, scale: normalizeScale(value) }, source);
  }
}
