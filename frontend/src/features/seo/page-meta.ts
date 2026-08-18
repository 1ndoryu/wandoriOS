/* wandori.us — Page Meta por ruta pública
 * [297A-17] Aplica título/descripción/canonical al navegar por rutas que las
 * páginas de contenido no cubren (login, verify-email, escritorio, 404).
 * Reutiliza `updateMeta` para que og/twitter/canonical sigan una sola fuente.
 * Las rutas con contenido (article, about, gallery, projects, checkout) ya
 * llaman a `updateMeta`/`updateArticleMeta` por su cuenta; este módulo solo
 * rellena el resto. */

import { onNavigate, getCurrentPath } from '../../router';
import { updateMeta } from './meta';

interface PageMeta {
  title: string;
  description: string;
}

function metaForPath(pathname: string): PageMeta | null {
  if (pathname === '/' || pathname === '') {
    return {
      title: 'escritorio',
      description: 'tu escritorio en wandorius — blog, portfolio y proyectos',
    };
  }
  if (pathname === '/login') {
    return {
      title: 'cuenta · inicia sesión',
      description: 'inicia sesión en tu cuenta de wandorius',
    };
  }
  if (pathname === '/verify-email') {
    return {
      title: 'verificar correo',
      description: 'verifica tu dirección de correo para activar la cuenta',
    };
  }
  if (pathname === '/checkout/success' || pathname === '/checkout/cancel') {
    return {
      title: pathname === '/checkout/success' ? 'pedido realizado' : 'pedido cancelado',
      description: 'estado de tu pedido en wandorius',
    };
  }
  return null;
}

/** Aplica la meta de la ruta actual; devuelve teardown idempotente. */
export function initPageMeta(): () => void {
  const apply = (): void => {
    const meta = metaForPath(getCurrentPath());
    if (meta) updateMeta({ title: meta.title, description: meta.description });
  };
  const stop = onNavigate(apply);
  apply();
  return stop;
}

export { metaForPath };
