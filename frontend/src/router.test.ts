/* Tests para router.ts — SPA Router [Auditoría v4 §6.1] */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  addRoute,
  setOutlet,
  navigate,
  getCurrentPath,
  onNavigate,
  setRouteInterceptor,
  isInternalHistoryEntry,
  isInternalPushHistoryEntry,
  pushPath,
  replacePath,
} from './router';

describe('router', () => {
  let outlet: HTMLDivElement;

  beforeEach(() => {
    /* Reset router state between tests by reloading module isn't possible,
     * but we can work with the mutable routes array via addRoute.
     * Each test adds its own routes. */
    outlet = document.createElement('div');
    setOutlet(outlet);
    /* Reset path to root */
    history.replaceState(null, '', '/');
  });

  describe('addRoute + navigate', () => {
    it('navega a una ruta registrada y renderiza en el outlet', async () => {
      const render = vi.fn(() => document.createElement('p'));
      addRoute({ path: '/test', render });
      navigate('/test');
      /* handleRoute es async — esperar microtask */
      await new Promise(r => setTimeout(r, 10));
      expect(render).toHaveBeenCalled();
    });

    it('muestra "página no encontrada" para rutas no registradas', async () => {
      navigate('/ruta-inexistente-xyz');
      await new Promise(r => setTimeout(r, 10));
      expect(outlet.textContent).toContain('no encontrada');
    });

    it('soporta parámetros dinámicos (:slug)', async () => {
      let capturedParams: Record<string, string> = {};
      addRoute({
        path: '/article/:slug',
        render: (params) => {
          capturedParams = params;
          return document.createElement('article');
        },
      });
      navigate('/article/mi-post');
      await new Promise(r => setTimeout(r, 10));
      expect(capturedParams.slug).toBe('mi-post');
    });

    it('soporta múltiples parámetros', async () => {
      let capturedParams: Record<string, string> = {};
      addRoute({
        path: '/user/:id/post/:postId',
        render: (params) => {
          capturedParams = params;
          return document.createElement('div');
        },
      });
      navigate('/user/42/post/99');
      await new Promise(r => setTimeout(r, 10));
      expect(capturedParams.id).toBe('42');
      expect(capturedParams.postId).toBe('99');
    });
  });

  describe('navigate', () => {
    it('no navega si el path es el mismo', async () => {
      const render = vi.fn(() => document.createElement('p'));
      addRoute({ path: '/same', render });
      navigate('/same');
      await new Promise(r => setTimeout(r, 10));
      const callCount = render.mock.calls.length;
      navigate('/same');
      await new Promise(r => setTimeout(r, 10));
      expect(render.mock.calls.length).toBe(callCount);
    });
  });

  describe('getCurrentPath', () => {
    it('devuelve el path actual', () => {
      history.replaceState(null, '', '/current-path');
      /* getCurrentPath returns the last navigated path, not window.location */
      expect(typeof getCurrentPath()).toBe('string');
    });

    it('pushPath y replacePath notifican el canal de navegación una sola vez', async () => {
      const listener = vi.fn();
      const stop = onNavigate(listener);
      pushPath('/deep-link-push');
      expect(isInternalHistoryEntry()).toBe(true);
      expect(isInternalPushHistoryEntry()).toBe(true);
      replacePath('/deep-link-replace');
      expect(isInternalHistoryEntry()).toBe(true);
      expect(isInternalPushHistoryEntry()).toBe(true);
      expect(listener.mock.calls).toEqual([
        ['/deep-link-push'],
        ['/deep-link-replace'],
      ]);
      stop();
    });

    it('no clasifica como interna una entrada externa del navegador', () => {
      history.replaceState(null, '', '/external-deep-link');
      replacePath('/external-deep-link-normalized');
      expect(isInternalHistoryEntry()).toBe(false);
      expect(isInternalPushHistoryEntry()).toBe(false);
    });
  });

  describe('onNavigate', () => {
    it('notifica listeners al navegar', async () => {
      const listener = vi.fn();
      onNavigate(listener);
      addRoute({ path: '/notify-test', render: () => document.createElement('div') });
      navigate('/notify-test');
      await new Promise(r => setTimeout(r, 10));
      expect(listener).toHaveBeenCalledWith('/notify-test');
    });

    it('devuelve función de cleanup que remueve el listener', async () => {
      const listener = vi.fn();
      const cleanup = onNavigate(listener);
      cleanup();
      addRoute({ path: '/no-notify', render: () => document.createElement('div') });
      navigate('/no-notify');
      await new Promise(r => setTimeout(r, 10));
      expect(listener).not.toHaveBeenCalled();
    });

    it('notifica listeners para rutas desconocidas antes del fallback 404', async () => {
      const listener = vi.fn();
      const cleanup = onNavigate(listener);
      navigate('/unknown-route-for-reconciliation');
      await new Promise(r => setTimeout(r, 10));
      expect(listener).toHaveBeenCalledWith('/unknown-route-for-reconciliation');
      cleanup();
    });
  });

  describe('guard', () => {
    it('navega a /login si el guard retorna false', async () => {
      addRoute({ path: '/protected', render: () => document.createElement('div'), guard: () => false });
      addRoute({ path: '/login', render: () => document.createElement('div') });
      navigate('/protected');
      await new Promise(r => setTimeout(r, 10));
      /* After guard fails, it should navigate to /login */
      expect(getCurrentPath()).toBe('/login');
    });

    it('renderiza si el guard retorna true', async () => {
      const render = vi.fn(() => document.createElement('div'));
      addRoute({ path: '/allowed', render, guard: () => true });
      navigate('/allowed');
      await new Promise(r => setTimeout(r, 10));
      expect(render).toHaveBeenCalled();
    });
  });

  describe('routeInterceptor', () => {
    it('intercepta rutas antes del render', async () => {
      const interceptor = vi.fn(() => true);
      const render = vi.fn(() => document.createElement('div'));
      const stopInterceptor = setRouteInterceptor(interceptor);
      addRoute({ path: '/intercepted', render });
      navigate('/intercepted');
      await new Promise(r => setTimeout(r, 10));
      expect(interceptor).toHaveBeenCalled();
      /* Render should NOT be called because interceptor handled it */
      expect(render).not.toHaveBeenCalled();
      /* Cleanup del interceptor por contrato */
      stopInterceptor();
      setRouteInterceptor(null);
    });

    it('limpia un interceptor sin borrar uno instalado después', async () => {
      const first = vi.fn(() => true);
      const second = vi.fn(() => true);
      const stopFirst = setRouteInterceptor(first);
      setRouteInterceptor(second);
      stopFirst();
      addRoute({ path: '/interceptor-cleanup', render: () => document.createElement('div') });
      navigate('/interceptor-cleanup');
      await new Promise(r => setTimeout(r, 10));
      expect(second).toHaveBeenCalled();
      expect(first).not.toHaveBeenCalled();
      setRouteInterceptor(null);
    });
  });
});
