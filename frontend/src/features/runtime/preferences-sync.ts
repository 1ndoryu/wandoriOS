/* wandori.us — Account Preferences Sync
 * Adaptador entre Auth/PreferencesService y el themeStore.
 * El tema local sigue siendo la fuente inmediata; la red nunca bloquea el OS.
 * [297A-13] Política aprobada: merge por campo + LWW en la colisión real del
 * mismo campo (el remoto, con revisión más alta, gana) y aviso no bloqueante
 * cuando se descarta un cambio local — sin modal de fricción. */

import { ApiError } from '../../api/client';
import { PreferencesService, type UserPreferences } from '../../services/preferences.service';
import { authStore, createStore } from '../../store';
import { themeStore, type ThemeMode } from './theme-store';
import { showToast } from '../../components/ui/toast';

export type PreferencesSyncStatus = 'idle' | 'loading' | 'ready' | 'offline';

export interface PreferencesSyncState {
  readonly userId: string | null;
  readonly revision: number | null;
  readonly remoteTheme: ThemeMode | null;
  readonly status: PreferencesSyncStatus;
}

export const preferencesSyncStore = createStore<PreferencesSyncState>({
  userId: null,
  revision: null,
  remoteTheme: null,
  status: 'idle',
});

let activeUserId: string | null = null;
let remoteRevision: number | null = null;
let remoteTheme: ThemeMode | null = null;
let stopThemeSubscription: (() => void) | null = null;
let stopAuthSubscription: (() => void) | null = null;
let sharedCleanup: (() => void) | null = null;
let updateQueue: Promise<void> = Promise.resolve();
let syncGeneration = 0;

function isThemeMode(value: string): value is ThemeMode {
  return value === 'system' || value === 'claro' || value === 'oscuro';
}

function setState(status: PreferencesSyncStatus): void {
  preferencesSyncStore.set({
    userId: activeUserId,
    revision: remoteRevision,
    remoteTheme,
    status,
  }, 'sync');
}

/* [297A-13] LWW por campo: el remoto (revisión más alta) gana la colisión del
 * mismo campo y el descarte se avisa sin bloquear. */
function applyRemoteTheme(): void {
  if (remoteTheme === null) return;
  const localMode = themeStore.get();
  if (localMode !== 'system' && localMode !== remoteTheme) {
    showToast('se descartó un cambio en tu preferencia (tema) por una actualización más reciente en tu cuenta');
  }
  themeStore.set(remoteTheme, 'sync');
  setState('ready');
}

function queueLocalUpdate(mode: ThemeMode): void {
  if (!activeUserId || remoteRevision === null) return;

  const generation = syncGeneration;
  const userId = activeUserId;
  const expectedRevision = remoteRevision;
  updateQueue = updateQueue.then(async () => {
    if (generation !== syncGeneration || activeUserId !== userId || remoteRevision === null) return;

    try {
      const updated = await PreferencesService.update({
        theme: mode,
        expected_revision: expectedRevision,
      });
      if (generation !== syncGeneration || activeUserId !== userId) return;
      remoteRevision = updated.revision;
      remoteTheme = isThemeMode(updated.theme) ? updated.theme : 'system';
      setState('ready');
    } catch (error) {
      if (generation !== syncGeneration || activeUserId !== userId) return;
      if (error instanceof ApiError && error.status === 409) {
        /* Colisión real: releer el remoto y aplicar LWW con aviso. */
        try {
          const latest = await PreferencesService.get();
          if (generation !== syncGeneration || activeUserId !== userId) return;
          remoteRevision = latest.revision;
          remoteTheme = isThemeMode(latest.theme) ? latest.theme : 'system';
          applyRemoteTheme();
        } catch {
          /* Invalidar la revisión para impedir un reenvío obsoleto si la red
           * vuelve mientras la cuenta sigue activa. */
          remoteRevision = null;
          remoteTheme = null;
          setState('offline');
        }
        return;
      }
      setState('offline');
    }
  });
}

/** Activar sincronización para una cuenta después de confirmar /auth/me. */
export async function syncPreferencesForUser(userId: string): Promise<void> {
  const generation = ++syncGeneration;
  activeUserId = userId;
  remoteRevision = null;
  remoteTheme = null;
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
  remoteTheme = isThemeMode(remote.theme) ? remote.theme : 'system';
  /* [297A-13] Sin elección local explícita (system) se adopta el remoto en
   * silencio; con elección local distinta se aplica LWW y se avisa. */
  applyRemoteTheme();
}

/** Desactivar la cuenta actual sin borrar la preferencia anónima local. */
export function clearPreferencesSync(): void {
  syncGeneration += 1;
  activeUserId = null;
  remoteRevision = null;
  remoteTheme = null;
  updateQueue = Promise.resolve();
  preferencesSyncStore.set({
    userId: null,
    revision: null,
    remoteTheme: null,
    status: 'idle',
  }, 'sync');
}

/** Instalar una única escucha de tema y auth; devuelve cleanup idempotente. */
export function initPreferencesSync(): () => void {
  if (sharedCleanup) return sharedCleanup;

  stopThemeSubscription = themeStore.subscribe((mode, source) => {
    if (source === 'user') queueLocalUpdate(mode);
  });
  stopAuthSubscription = authStore.subscribe((state) => {
    if (!state.isAuthenticated) clearPreferencesSync();
  });

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    stopThemeSubscription?.();
    stopThemeSubscription = null;
    stopAuthSubscription?.();
    stopAuthSubscription = null;
    sharedCleanup = null;
    clearPreferencesSync();
  };
  sharedCleanup = cleanup;
  return cleanup;
}
