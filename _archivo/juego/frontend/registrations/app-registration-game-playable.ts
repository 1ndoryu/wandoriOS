/* GAME-01 — Registro del vertical slice offline.
 * Los bocetos game/game-3d se retiraron el 05-ago; esta entrada es la única
 * app del juego y monta el movimiento local. */

import { Gamepad2 } from 'lucide';
import type { MountedView, RenderContext } from '../../core/lifecycle';
import { dispatchEvent } from '../analytics/dispatcher';
import { AppRegistry } from './app-registry';
import { createPathDeepLink } from './deep-links';

AppRegistry.registerLazy({
  id: 'game-playable',
  title: 'Bosque · prueba',
  icon: Gamepad2,
  iconType: 'application',
  singleton: true,
  requires: 'public',
  deepLink: createPathDeepLink('/forest-playable'),
  layout: 'full-bleed',
  /* [GAME-01-VIS] El juego abre expandido (maximizado) automáticamente; el
   * usuario siempre puede restaurar con el control de la ventana. */
  openMaximized: true,
  /* [297A-62] Configuración del juego dentro de la ventana: el toolbar real
   * del shell proyecta el comando `game:settings`, que es adminOnly; para
   * no-admin el grupo entero se oculta (fail-closed) y se re-renderiza en
   * vivo con authStore. El grupo "Personaje" es público (game:character). */
  toolbar: [
    { label: 'Personaje', items: ['game:character'] },
    { label: 'Configuración', items: ['game:settings'] },
  ],
  load: () => import('../desktop/apps/game-playable/game-playable').then((module) => ({
    render: (context: RenderContext): MountedView => {
      dispatchEvent({ type: 'app_opened', appId: 'game-playable' });
      const view = module.renderGamePlayable(context);
      let destroyed = false;
      return {
        element: view.element,
        destroy: () => {
          if (destroyed) return;
          destroyed = true;
          view.destroy?.();
          dispatchEvent({ type: 'app_closed', appId: 'game-playable' });
        },
      };
    },
  })),
});
