import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { PreferencesService } from '../../services/preferences.service';
import { authStore } from '../../store';
import { themeStore } from './theme-store';
import {
  clearPreferencesSync,
  initPreferencesSync,
  preferencesSyncStore,
  resolvePreferencesConflict,
  syncPreferencesForUser,
} from './preferences-sync';

function remote(theme: 'system' | 'claro' | 'oscuro', revision = 0) {
  return { theme, revision, updated_at: '2026-07-31T00:00:00.000Z' };
}

let stop: (() => void) | null = null;

beforeEach(() => {
  stop?.();
  stop = initPreferencesSync();
  clearPreferencesSync();
  themeStore.set('system', 'sync');
  authStore.set({ isAuthenticated: true, userId: 'test-user', capability: 'authenticated' }, 'sync');
  vi.restoreAllMocks();
});

describe('preferences sync', () => {
  it('aplica la preferencia remota cuando no hay decisión local explícita', async () => {
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 4));

    await syncPreferencesForUser('user-a');

    expect(themeStore.get()).toBe('oscuro');
    expect(preferencesSyncStore.get()).toMatchObject({
      userId: 'user-a',
      revision: 4,
      status: 'ready',
    });
  });

  it('marca conflicto y no sobrescribe una elección local explícita', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 2));

    await syncPreferencesForUser('user-a');

    expect(themeStore.get()).toBe('claro');
    expect(preferencesSyncStore.get().status).toBe('conflict');
  });

  it('permite elegir remoto o conservar local después del conflicto', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 2));
    const update = vi.spyOn(PreferencesService, 'update').mockResolvedValue(remote('claro', 3));

    await syncPreferencesForUser('user-a');
    resolvePreferencesConflict('local');
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith({
      theme: 'claro',
      expected_revision: 2,
    }));

    expect(update).toHaveBeenCalledWith({ theme: 'claro', expected_revision: 2 });
    expect(preferencesSyncStore.get().status).toBe('ready');
    expect(preferencesSyncStore.get().revision).toBe(3);

    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('oscuro', 5));
    await syncPreferencesForUser('user-a');
    resolvePreferencesConflict('remote');
    expect(themeStore.get()).toBe('oscuro');
  });

  it('conserva el fallback local si la API no está disponible', async () => {
    themeStore.set('claro', 'user');
    vi.spyOn(PreferencesService, 'get').mockRejectedValue(new Error('offline'));

    await syncPreferencesForUser('user-a');

    expect(themeStore.get()).toBe('claro');
    expect(preferencesSyncStore.get().status).toBe('offline');
  });

  it('invalida la revisión si no puede refrescar después de un 409', async () => {
    vi.spyOn(PreferencesService, 'get')
      .mockResolvedValueOnce(remote('system', 1))
      .mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(PreferencesService, 'update').mockRejectedValue(new ApiError(409, {}, 'conflict'));

    await syncPreferencesForUser('user-a');
    themeStore.set('claro', 'user');
    await vi.waitFor(() => expect(preferencesSyncStore.get().status).toBe('offline'));

    expect(preferencesSyncStore.get()).toMatchObject({
      revision: null,
      remoteTheme: null,
      status: 'offline',
    });
  });

  it('refresca revisión y tema después de un 409 antes de mostrar el conflicto', async () => {
    const get = vi.spyOn(PreferencesService, 'get')
      .mockResolvedValueOnce(remote('system', 1))
      .mockResolvedValueOnce(remote('oscuro', 2));
    vi.spyOn(PreferencesService, 'update').mockRejectedValue(new ApiError(409, {}, 'conflict'));

    await syncPreferencesForUser('user-a');
    themeStore.set('claro', 'user');
    await vi.waitFor(() => expect(preferencesSyncStore.get().status).toBe('conflict'));

    expect(get).toHaveBeenCalledTimes(2);
    expect(preferencesSyncStore.get()).toMatchObject({
      revision: 2,
      remoteTheme: 'oscuro',
      status: 'conflict',
    });
  });

  it('ignora la respuesta de una cuenta anterior tras cambiar de usuario', async () => {
    let resolveFirst: ((value: ReturnType<typeof remote>) => void) | undefined;
    const first = new Promise<ReturnType<typeof remote>>((resolve) => { resolveFirst = resolve; });
    vi.spyOn(PreferencesService, 'get')
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(remote('oscuro', 7));

    const oldSync = syncPreferencesForUser('user-a');
    await syncPreferencesForUser('user-b');
    resolveFirst?.(remote('claro', 1));
    await oldSync;

    expect(themeStore.get()).toBe('oscuro');
    expect(preferencesSyncStore.get().userId).toBe('user-b');
  });
});
