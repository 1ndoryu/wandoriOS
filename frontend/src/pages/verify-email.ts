/* wandori.us — Verify Email Page
 * [297A-13] Destino del enlace de verificación enviado por correo (o por el
 * buzón de desarrollo): consume el token de un solo uso y muestra el estado.
 * No guarda el token en la URL ni en estado persistente. */

import { createEl } from '../utils/dom';
import { AuthService } from '../services';
import { showToast } from '../components/ui/toast';
import { safeRun } from '../utils/safe-async';
import type { RenderContext } from '../core/lifecycle';

export function renderVerifyEmail(ctx: RenderContext): HTMLElement {
  const container = createEl('section', {
    className: 'account-app',
    ariaLabel: 'Verificar correo',
  });

  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const title = createEl('h1', { className: 'account-app__title', textContent: 'verificar correo' });
  const feedback = createEl('p', {
    className: 'account-app__feedback',
    role: 'status',
    textContent: 'verificando…',
  });
  const action = createEl('div', { className: 'account-app__actions' });
  const openCuenta = createEl('button', {
    className: 'boton boton-con-icono account-app__action',
    type: 'button',
    textContent: 'abrir cuenta',
    'aria-label': 'Abrir la app Cuenta',
  });
  openCuenta.addEventListener('click', () => {
    window.location.href = '/login';
  });
  action.append(openCuenta);
  container.append(title, feedback, action);

  const verify = (): void => {
    if (!token) {
      feedback.textContent = 'enlace incompleto: falta el token de verificación.';
      feedback.hidden = false;
      return;
    }
    void safeRun(AuthService.verifyEmail(token), 'no se pudo verificar el correo').then((result) => {
      if (ctx.signal.aborted) return;
      if (result.ok) {
        feedback.textContent = 'cuenta verificada. ya puedes iniciar sesión.';
        feedback.hidden = false;
        showToast('cuenta verificada');
      } else {
        feedback.textContent = 'el enlace es inválido o ya fue usado; solicita uno nuevo.';
        feedback.hidden = false;
      }
    });
  };
  verify();

  ctx.signal.addEventListener('abort', () => container.replaceChildren(), { once: true });
  return container;
}
