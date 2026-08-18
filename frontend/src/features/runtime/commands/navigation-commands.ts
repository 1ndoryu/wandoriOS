/* wandori.us — Navigation Commands
 * Comandos de navegación compartidos por todas las apps del OS.
 * [297A-19] Una sola acción de copiar URL; no se duplica por app.
 */

import { Link, PanelLeft } from 'lucide';
import { showToast } from '../../../components/ui/toast';
import { dispatchEvent } from '../../analytics/dispatcher';
import { resolveFocusedCanonicalTarget } from '../window-url-sync';
import { CommandRegistry, type CommandResult } from '../command-registry';
import { showSidebar } from '../../../store';

/* [018A-61] El shell solo proyecta este comando; la visibilidad persistente
 * de la navegación vive en el store y se mide una vez por activación. */
CommandRegistry.register({
  id: 'navigation:toggle-external-nav',
  label: 'Mostrar/Ocultar navegación',
  icon: PanelLeft,
  order: 1,
  contexts: ['desktop', 'mobile', 'taskbar', 'launcher', 'shortcut'],
  undoPolicy: 'local',
  analyticsEvent: 'external_nav_toggled',
  execute: (): CommandResult => {
    const expanded = !showSidebar.get();
    showSidebar.set(expanded, 'user');
    dispatchEvent({ type: 'external_nav_toggled', expanded });
    return { status: 'success' };
  },
});

/** Copiar texto usando Clipboard API y fallback para contextos no seguros. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Intentar fallback síncrono si el permiso o contexto seguro lo rechaza. */
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    textarea.remove();
  }
  return copied;
}

CommandRegistry.register({
  id: 'navigation:copy-url',
  label: 'Copiar URL',
  icon: Link,
  order: 12,
  contexts: ['toolbar'],
  undoPolicy: 'none',
  analyticsEvent: 'share_url_copied',
  isAvailable: () => resolveFocusedCanonicalTarget()
    ? { state: 'enabled' }
    : { state: 'hidden' },
  execute: async (): Promise<CommandResult> => {
    const target = resolveFocusedCanonicalTarget();
    if (!target) return { status: 'failure', reason: 'no canonical URL for focused app' };

    const success = await copyText(target.url);
    dispatchEvent({
      type: 'share_url_copied',
      success,
      routeName: target.routeName,
      appId: target.appId,
      presentationMode: target.presentationMode,
    });
    showToast(success ? 'URL copiada' : 'no se pudo copiar la URL');
    return success
      ? { status: 'success' }
      : { status: 'failure', reason: 'clipboard unavailable' };
  },
});
