/* wandori.us — Legacy Login Compatibility
 * `/login` pertenece a Cuenta dentro del runtime. Este export se conserva para
 * consumidores legacy del router y delega en la misma vista, sin duplicar UI ni
 * autenticación. */

import { createAccountView } from '../features/runtime/account-view';
import type { RenderContext } from '../core/lifecycle';

export function renderLogin(ctx: RenderContext): HTMLElement {
  return createAccountView(ctx);
}
