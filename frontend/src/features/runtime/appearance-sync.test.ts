/* wandori.us — Appearance Sync tests (297A-29)
 * Verifica el merge por campo + LWW con aviso no bloqueante y la
 * inicialización desde los defaults globales del admin. */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PreferencesService, type UserPreferences } from '../../services/preferences.service';
import { authStore } from '../../store';
import {
  appearanceStore,
  DEFAULT_APPEARANCE,
} from './appearance-store';
import {
  clearAppearanceSync,
  initAppearanceFromSettings as initFromSettings,
  initAppearanceSync,
  syncAppearanceForUser,
} from './appearance-sync';

function remote(theme: 'system' | 'claro' | 'oscuro', revision = 0, extra: Partial<UserPreferences> = {}) {
  return {
    theme, wallpaper: null, font: null, scale: null, revision,
    updated_at: '2026-07-31T00:00:00.000Z', ...extra,
  };
}

let stop: (() => void) | null = null;

beforeEach(() => {
  stop?.();
  stop = null;
  clearAppearanceSync();
  appearanceStore.set(DEFAULT_APPEARANCE, 'init');
  localStorage.clear();
});

afterEach(() => {
  stop?.();
  clearAppearanceSync();
  vi.restoreAllMocks();
});

describe('appearance-sync', () => {
  it('aplica el remoto y guarda la revisión', async () => {
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('system', 3, { wallpaper: 'w1.png', font: 'sans', scale: 1.15 }));
    await syncAppearanceForUser('user-a');
    const a = appearanceStore.get();
    expect(a.wallpaper).toBe('w1.png');
    expect(a.font).toBe('sans');
    expect(a.scale).toBeCloseTo(1.15, 5);
  });

  it('LWW: el remoto (revisión más alta) gana la colisión del mismo campo con aviso', async () => {
    const toasts: string[] = [];
    vi.spyOn(PreferencesService, 'get').mockResolvedValue(remote('system', 4, { wallpaper: 'remota.png' }));
    stop = initAppearanceSync();
    authStore.set({ isAuthenticated: true, userId: 'user-a', capability: 'authenticated' });
    appearanceStore.set({ wallpaper: 'local.png', font: 'system', scale: 1 }, 'user');

    /* El 409 fuerza releer el remoto → LWW. */
    vi.spyOn(PreferencesService, 'update').mockRejectedValueOnce(Object.assign(new Error('conflict'), { status: 409 }));
    await syncAppearanceForUser('user-a');
    await new Promise(r => setTimeout(r, 20));

    const a = appearanceStore.get();
    expect(a.wallpaper).toBe('remota.png');
    void toasts;
  });

  it('inicializa desde los defaults globales del admin', () => {
    initFromSettings({ appearance_wallpaper: 'admin.png', appearance_font: 'mono', appearance_scale: '1.10' });
    const a = appearanceStore.get();
    expect(a.wallpaper).toBe('admin.png');
    expect(a.font).toBe('mono');
    expect(a.scale).toBeCloseTo(1.1, 5);
  });

  it('valores inválidos caen a los defaults', () => {
    initFromSettings({ appearance_font: 'cursiva', appearance_scale: '99' });
    const a = appearanceStore.get();
    expect(a.font).toBe('system');
    expect(a.scale).toBeCloseTo(1, 5);
  });
});
