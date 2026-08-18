/* wandori.us — Security Panel (MFA TOTP)
 * Panel de segundo factor embebido en la ventana Cuenta [297A-13].
 * No conoce HTTP: delega todo en AuthService y solo presenta estados.
 * Alta en dos pasos: setup (secreto + URI otpauth) → confirmación con código.
 * Desactivación exige un código válido (prueba de propiedad). */

import { createEl } from '../../utils/dom';
import { safeRun } from '../../utils/safe-async';
import { createInput } from '../../components/ui/input';
import { AuthService } from '../../services';

export function createSecurityPanel(): { element: HTMLElement; destroy: () => void } {
  const element = createEl('div', { className: 'security-panel' });
  let stopped = false;

  const render = (): void => {
    if (stopped) return;
    element.replaceChildren();
    const title = createEl('h2', {
      className: 'preferences-conflict__title',
      textContent: 'seguridad',
    });
    element.append(title);
    void renderTotpStatus(element);
  };

  async function renderTotpStatus(container: HTMLElement): Promise<void> {
    const status = createEl('p', {
      className: 'account-app__message',
      textContent: 'cargando…',
    });
    container.append(status);
    const result = await safeRun(AuthService.totpStatus(), 'no se pudo leer el estado de seguridad');
    if (stopped) return;
    if (!result.ok) {
      status.textContent = 'no se pudo leer el estado de seguridad';
      return;
    }
    status.textContent = result.value.enabled
      ? 'segundo factor activo: al iniciar sesión pedirá un código de 6 dígitos.'
      : 'segundo factor desactivado: solo email y contraseña.';
    if (result.value.enabled) {
      container.append(buildDisableAction());
    } else {
      container.append(buildSetupAction());
    }
  }

  function buildSetupAction(): HTMLElement {
    const section = createEl('div', { className: 'security-panel__setup' });
    const startButton = createEl('button', {
      className: 'boton boton-con-icono security-panel__action',
      type: 'button',
      textContent: 'configurar segundo factor',
      'aria-label': 'Configurar segundo factor TOTP',
    });
    startButton.addEventListener('click', () => {
      void (async () => {
        startButton.disabled = true;
        const result = await safeRun(AuthService.beginTotpSetup(), 'no se pudo iniciar la configuración');
        if (stopped) return;
        startButton.disabled = false;
        if (!result.ok) {
          startButton.textContent = 'no se pudo iniciar; reintentar';
          return;
        }
        section.replaceChildren(buildConfirmStep(result.value.secret, result.value.otpauth_uri));
      })();
    });
    section.append(startButton);
    return section;
  }

  function buildConfirmStep(secret: string, otpauthUri: string): HTMLElement {
    const intro = createEl('p', {
      className: 'security-panel__hint',
      textContent: 'añade la cuenta en tu app autenticadora con el código o la URI, y escribe el código de 6 dígitos:',
    });
    const uri = createEl('code', {
      className: 'security-panel__uri',
      textContent: otpauthUri,
    });
    const secretRow = createEl('p', {
      className: 'security-panel__hint',
    }, createEl('span', { textContent: 'secreto: ' }), createEl('code', { textContent: secret }));
    const codeField = createInput({ label: 'código', type: 'text', placeholder: '000000', required: true });
    const codeInput = codeField.querySelector<HTMLInputElement>('input');
    const feedback = createEl('p', {
      className: 'account-app__feedback',
      role: 'status',
      textContent: '',
    });
    feedback.hidden = true;
    const confirmButton = createEl('button', {
      className: 'boton boton-con-icono security-panel__action',
      type: 'button',
      textContent: 'activar',
      'aria-label': 'Activar segundo factor',
    });
    confirmButton.addEventListener('click', () => {
      void (async () => {
        const code = codeInput?.value.trim() ?? '';
        if (code.length !== 6) {
          feedback.textContent = 'el código tiene 6 dígitos';
          feedback.hidden = false;
          return;
        }
        confirmButton.disabled = true;
        const result = await safeRun(AuthService.confirmTotp(code), 'código inválido');
        if (stopped) return;
        confirmButton.disabled = false;
        if (!result.ok) {
          feedback.textContent = 'código inválido; inténtalo de nuevo';
          feedback.hidden = false;
          return;
        }
        feedback.textContent = 'segundo factor activado';
        feedback.hidden = false;
        render();
      })();
    });
    const step = createEl('div', { className: 'security-panel__step' }, intro, uri, secretRow, codeField, feedback, confirmButton);
    return step;
  }

  function buildDisableAction(): HTMLElement {
    const section = createEl('div', { className: 'security-panel__disable' });
    const codeField = createInput({ label: 'código actual', type: 'text', placeholder: '000000', required: true });
    const codeInput = codeField.querySelector<HTMLInputElement>('input');
    const feedback = createEl('p', {
      className: 'account-app__feedback',
      role: 'status',
      textContent: '',
    });
    feedback.hidden = true;
    const disableButton = createEl('button', {
      className: 'boton boton-con-icono security-panel__action',
      type: 'button',
      textContent: 'desactivar segundo factor',
      'aria-label': 'Desactivar segundo factor',
    });
    disableButton.addEventListener('click', () => {
      void (async () => {
        const code = codeInput?.value.trim() ?? '';
        if (code.length !== 6) {
          feedback.textContent = 'el código tiene 6 dígitos';
          feedback.hidden = false;
          return;
        }
        disableButton.disabled = true;
        const result = await safeRun(AuthService.disableTotp(code), 'código inválido');
        if (stopped) return;
        disableButton.disabled = false;
        if (!result.ok) {
          feedback.textContent = 'código inválido; no se desactivó';
          feedback.hidden = false;
          return;
        }
        feedback.textContent = 'segundo factor desactivado';
        feedback.hidden = false;
        render();
      })();
    });
    section.append(codeField, feedback, disableButton);
    return section;
  }

  /* [297A-13] Render inicial: sin esta llamada el panel nace vacío
   * (el render solo se disparaba al confirmar/desactivar). */
  render();

  const destroy = (): void => {
    stopped = true;
  };
  return { element, destroy };
}
