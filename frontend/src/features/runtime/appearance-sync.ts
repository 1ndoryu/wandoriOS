/* wandori.us — Appearance Sync (panel de control 297A-29)
 * Sincroniza la apariencia del OS (wallpaper/font/scale) con la cuenta.
 * Mismo contrato que preferences-sync: [297A-13] merge por campo + LWW en la
 * colisión real del mismo campo, con aviso no bloqueante al descartar un
 * cambio local. La apariencia local es la fuente inmediata; la red nunca
 * bloquea el shell. Cada campo se envía por separado (solo el tocado). */

import { ApiError } from '../../api/client';
import { PreferencesService, type UserPreferences } from '../../services/preferences.service';
import { authStore, createStore } from '../../store';
import { appearanceStore, DEFAULT_APPEARANCE, initAppearance, isOsFont, normalizeScale, setAppearanceField } from './appearance-store';
import { showToast } from '../../components/ui/toast';

export type AppearanceSyncStatus = 'idle' | 'loading' | 'ready' | 'offline';

export interface AppearanceSyncState {
  readonly userId: string | null;
  readonly revision: number | null;
  readonly status: AppearanceSyncStatus;
}

export const appearanceSyncStore = createStore<AppearanceSyncState>({
  userId: null,
  revision: null,
  status: 'idle',
});

let activeUserId: string | null = null;
let remoteRevision: number | null = null;
let stopAppearanceSubscription: (() => void) | null = null;
let stopAuthSubscription: (() => void) | null = null;
let sharedCleanup: (() => void) | null = null;
let updateQueue: Promise<void> = Promise.resolve();
let syncGeneration = 0;

function setState(status: AppearanceSyncStatus): void {
  appearanceSyncStore.set({
    userId: activeUserId,
    revision: remoteRevision,
    status,
  }, 'sync');
}

function localValue(): { wallpaper: string; font: string; scale: number } {
  const a = appearanceStore.get();
  return {
    wallpaper: a.wallpaper,
    font: a.font,
    scale: a.scale,
  };
}

/** Aplicar el remoto (efectivo, con defaults resueltos) campo a campo. */
function applyRemote(remote: UserPreferences): void {
  const local = localValue();
  const remoteWallpaper = remote.wallpaper ?? '';
  const remoteFont = isOsFont(remote.font) ? remote.font : DEFAULT_APPEARANCE.font;
  const remoteScale = normalizeScale(remote.scale ?? DEFAULT_APPEARANCE.scale);

  /* [297A-29] LWW por campo: el remoto (revisión más alta) gana la colisión
   * del mismo campo y el descarte se avisa sin bloquear. */
  const discarded: string[] = [];
  if (local.wallpaper !== remoteWallpaper) discarded.push('fondo de pantalla');
  if (local.font !== remoteFont) discarded.push('fuente');
  if (Math.abs(local.scale - remoteScale) > 0.001) discarded.push('escala');

  if (discarded.length > 0) {
    showToast(`se descartó un cambio local (${discarded.join(', ')}) por una actualización más reciente en tu cuenta`);
  }

  initAppearance({ wallpaper: remoteWallpaper, font: remoteFont, scale: remoteScale });
  setState('ready');
}

function queueLocalUpdate(field: 'wallpaper' | 'font' | 'scale'): void {
  if (!activeUserId || remoteRevision === null) return;

  const generation = syncGeneration;
  const userId = activeUserId;
  const expectedRevision = remoteRevision;
  const value = localValue();

  updateQueue = updateQueue.then(async () => {
    if (generation !== syncGeneration || activeUserId !== userId || remoteRevision === null) return;

    try {
      const updated = await PreferencesService.update({
        theme: undefined,
        wallpaper: field === 'wallpaper' ? value.wallpaper : undefined,
        font: field === 'font' ? value.font : undefined,
        scale: field === 'scale' ? value.scale : undefined,
        expected_revision: expectedRevision,
      });
      if (generation !== syncGeneration || activeUserId !== userId) return;
      remoteRevision = updated.revision;
      setState('ready');
    } catch (error) {
      if (generation !== syncGeneration || activeUserId !== userId) return;
      if (error instanceof ApiError && error.status === 409) {
        /* Colisión real: releer el remoto y aplicar LWW con aviso. */
        try {
          const latest = await PreferencesService.get();
          if (generation !== syncGeneration || activeUserId !== userId) return;
          remoteRevision = latest.revision;
          applyRemote(latest);
        } catch {
          remoteRevision = null;
          setState('offline');
        }
        return;
      }
      setState('offline');
    }
  });
}

/** Activar la sincronización de apariencia para una cuenta (tras /auth/me). */
export async function syncAppearanceForUser(userId: string): Promise<void> {
  const generation = ++syncGeneration;
  activeUserId = userId;
  remoteRevision = null;
  setState('loading');

  let remote: UserPreferences;
  try {
    remote = await PreferencesService.get();
  } catch {
    if (generation === syncGeneration && activeUserId === userId) setState('offline');
    return;
  }

  if (generation !== syncGeneration || activeUserId !== userId) return;
  remoteRevision = remote.revision;
  applyRemote(remote);
}

/** Dejar de sincronizar sin borrar la apariencia local. */
export function clearAppearanceSync(): void {
  syncGeneration += 1;
  activeUserId = null;
  remoteRevision = null;
  updateQueue = Promise.resolve();
  appearanceSyncStore.set({ userId: null, revision: null, status: 'idle' }, 'sync');
}

/** Instalar una única escucha de apariencia y auth; cleanup idempotente. */
export function initAppearanceSync(): () => void {
  if (sharedCleanup) return sharedCleanup;

  /* Detección del campo tocado: escuchamos y comparamos con el último valor
   * conocido (el subscribe recibe el estado completo). */
  let lastLocal = localValue();
  stopAppearanceSubscription = appearanceStore.subscribe((appearance) => {
    const next = localValue();
    if (next.wallpaper !== lastLocal.wallpaper) {
      lastLocal = next;
      queueLocalUpdate('wallpaper');
      return;
    }
    if (next.font !== lastLocal.font) {
      lastLocal = next;
      queueLocalUpdate('font');
      return;
    }
    if (Math.abs(next.scale - lastLocal.scale) > 0.001) {
      lastLocal = next;
      queueLocalUpdate('scale');
      return;
    }
    lastLocal = next;
    void appearance;
  });

  stopAuthSubscription = authStore.subscribe((state) => {
    if (!state.isAuthenticated) clearAppearanceSync();
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    stopAppearanceSubscription?.();
    stopAppearanceSubscription = null;
    stopAuthSubscription?.();
    stopAuthSubscription = null;
    sharedCleanup = null;
    clearAppearanceSync();
  };
  sharedCleanup = cleanup;
  return cleanup;
}

/** Inicializar apariencia local desde los defaults globales del admin. */
export function initAppearanceFromSettings(settings: Record<string, string>): void {
  const wallpaper = settings.appearance_wallpaper ?? '';
  const font = isOsFont(settings.appearance_font) ? settings.appearance_font : DEFAULT_APPEARANCE.font;
  const scale = normalizeScale(Number(settings.appearance_scale ?? 1));
  setAppearanceField('wallpaper', wallpaper, 'init');
  setAppearanceField('font', font, 'init');
  setAppearanceField('scale', scale, 'init');
}
