/* [GAME-01] Puente temporal de rutas del juego hacia el RouteAppAdapter.
 * El router exige una ruta conocida antes de delegarla; el fallback solo
 * aparece si el shell todavía no está montado. Los bocetos game/game-3d se
 * retiraron el 05-ago; queda el fixture jugable /forest-playable. */

import { createEl } from '../../utils/dom';
import { addRoute } from '../../router';

function createPreviewFallback(): HTMLElement {
  return createEl('p', { textContent: 'abriendo el bosque…' });
}

addRoute({ path: '/forest-playable', render: createPreviewFallback });
