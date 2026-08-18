import { describe, expect, it, vi } from 'vitest';
import { ArticleService } from '../../services';
import { AppRegistry } from './app-registry';
import './app-registration';

describe('Account app registration', () => {
  /* Los bocetos game (2D) y game-3d (3D) se retiraron el 05-ago: la
   * dirección visual quedó decidida y solo vive la app jugable. */
  it('removed the 2D and 3D sketch registrations', () => {
    expect(AppRegistry.get('game')).toBeUndefined();
    expect(AppRegistry.get('game-3d')).toBeUndefined();
  });

  it('keeps the playable fixture lazy until its first instantiation', () => {
    expect(AppRegistry.isLazy('game-playable')).toBe(true);
    const playable = AppRegistry.get('game-playable');
    expect(playable).toBeDefined();
    expect(playable?.singleton).toBe(true);
    expect(playable?.requires).toBe('public');
    expect(playable?.layout).toBe('full-bleed');
    expect(playable?.deepLink?.stringify()).toBe('/forest-playable');
    expect(playable?.routePatterns).toBeUndefined();
    /* [GAME-01-VIS] El juego abre expandido y su toolbar expone el personaje
     * del jugador (público) y la configuración (adminOnly: el shell oculta el
     * grupo completo para no-admin). */
    expect(playable?.openMaximized).toBe(true);
    expect(playable?.toolbar).toEqual([
      { label: 'Personaje', items: ['game:character'] },
      { label: 'Configuración', items: ['game:settings'] },
    ]);
  });

  it('registers a public singleton with the /login deep link', () => {
    const account = AppRegistry.get('account');
    expect(account).toBeDefined();
    expect(account?.singleton).toBe(true);
    expect(account?.requires).toBe('public');
    expect(account?.deepLink?.patterns).toEqual(['/login']);
    expect(account?.deepLink?.parse({})).toEqual({});
    expect(account?.deepLink?.stringify()).toBe('/login');
  });

  it('does not allow unexpected login URL parameters', () => {
    const account = AppRegistry.get('account');
    expect(account?.deepLink?.parse({ redirect: '/admin' })).toBeNull();
  });

  it('registers article editor as an internal admin app', () => {
    const editor = AppRegistry.get('article-editor');
    expect(editor).toBeDefined();
    expect(editor?.requires).toBe('admin');
    expect(editor?.singleton).toBe(false);
    expect(editor?.deepLink).toBeUndefined();
    expect(editor?.routePatterns).toBeUndefined();
  });

  it('registers project editor as an internal admin app', () => {
    const editor = AppRegistry.get('project-editor');
    expect(editor).toBeDefined();
    expect(editor?.requires).toBe('admin');
    expect(editor?.singleton).toBe(false);
    expect(editor?.deepLink).toBeUndefined();
    expect(editor?.routePatterns).toBeUndefined();
  });

  it('registers admin as an internal app without a legacy route', () => {
    const admin = AppRegistry.get('admin');
    expect(admin).toBeDefined();
    expect(admin?.requires).toBe('admin');
    expect(admin?.singleton).toBe(true);
    expect(admin?.deepLink).toBeUndefined();
    expect(admin?.routePatterns).toBeUndefined();
  });

  it('registers product editor as an internal admin app', () => {
    const editor = AppRegistry.get('product-editor');
    expect(editor).toBeDefined();
    expect(editor?.requires).toBe('admin');
    expect(editor?.singleton).toBe(false);
    expect(editor?.deepLink).toBeUndefined();
    expect(editor?.routePatterns).toBeUndefined();
  });

  it('registers media library as an admin-only singleton without public deep link', () => {
    const library = AppRegistry.get('media-library');
    expect(library).toBeDefined();
    expect(library?.requires).toBe('admin');
    expect(library?.singleton).toBe(true);
    expect(library?.deepLink).toBeUndefined();
    expect(library?.routePatterns).toBeUndefined();
  });

  it('does not reinterpret an internal resourceId as a public Reader slug', async () => {
    const reader = AppRegistry.get('reader');
    expect(reader).toBeDefined();

    const getBySlug = vi.spyOn(ArticleService, 'getBySlug');
    try {
      const view = await AppRegistry.instantiate('reader', {
        signal: new AbortController().signal,
        params: { resourceId: 'internal-resource-uuid' },
      });

      expect(view?.element.textContent).toContain('Selecciona un artículo para leer.');
      expect(getBySlug).not.toHaveBeenCalled();
    } finally {
      getBySlug.mockRestore();
    }
  });
});
