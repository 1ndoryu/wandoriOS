/* wandori.us — Account App View
 * Vista reactiva de Cuenta para el runtime del OS.
 * AuthService es la única frontera HTTP; authStore es la única fuente de
 * verdad de sesión. La vista no crea router ni estado paralelo.
 * [297A-13] Incluye login en dos pasos (TOTP), registro verificado con
 * verificación "dev" (buzón mockeado) y el panel de seguridad de MFA. */

import { ArrowLeft, createElement, KeyRound, LogIn, LogOut, Mail, ShieldCheck, UserPlus, UserRound, type IconNode } from 'lucide';
import { AuthService, DevMailService } from '../../services';
import { authStore, type AuthState } from '../../store';
import { createInput } from '../../components/ui/input';
import { showToast } from '../../components/ui/toast';
import { safeClick, safeRun } from '../../utils/safe-async';
import { createEl } from '../../utils/dom';
import { createPreferencesPanel } from './preferences-panel';
import { createSecurityPanel } from './security-panel';
import type { MountedView, RenderContext } from '../../core/lifecycle';

function icon(iconNode: IconNode): HTMLElement {
  return createEl('span', { className: 'account-app__icon' }, createElement(iconNode));
}

function createActionButton(
  label: string,
  iconNode: IconNode,
  onClick: () => void,
  ariaLabel: string,
): HTMLButtonElement {
  const button = createEl('button', {
    type: 'button',
    // [018A-65] boton-con-icono: receta compartida que centra icono+texto en
    // botones OS (la superficie .desktop-window .boton rompería el flex).
    className: 'boton boton-con-icono account-app__action',
    ariaLabel,
  }, icon(iconNode), createEl('span', { textContent: label }));
  button.addEventListener('click', () => onClick());
  return button;
}

type GuestMode = 'login' | 'register' | 'recover' | 'totp';

/** [297A-13] En desarrollo el enlace de verificación llega al buzón mockeado
 *  (GET /api/dev/mail); en producción solo existe el correo real. */
async function devVerificationFor(email: string): Promise<string | null> {
  const link = await DevMailService.latestVerificationLink(email);
  if (!link) return null;
  try {
    return new URL(link).searchParams.get('token');
  } catch {
    return null;
  }
}

function renderGuest(container: HTMLElement): void {
  let mode: GuestMode = 'login';
  let mfaChallenge: string | null = null;
  /* [297A-13] La verificación dev es asíncrona tras el registro; si la ventana
   * se cierra a mitad, no se sigue escribiendo en el DOM. */
  let stopped = false;

  const renderMode = (): void => {
    container.replaceChildren();
    const copy = {
      login: {
        title: 'cuenta',
        message: 'inicia sesión para sincronizar tu organización y preferencias.',
        submit: 'entrar',
        aria: 'Iniciar sesión',
        icon: LogIn,
      },
      register: {
        title: 'crear cuenta',
        message: 'solicita una cuenta. el acceso se activa después de verificar el correo.',
        submit: 'registrar',
        aria: 'Crear cuenta',
        icon: UserPlus,
      },
      recover: {
        title: 'recuperar acceso',
        message: 'recibe instrucciones si existe una cuenta con ese correo.',
        submit: 'solicitar recuperación',
        aria: 'Solicitar recuperación',
        icon: Mail,
      },
      totp: {
        title: 'código de verificación',
        message: 'esta cuenta usa segundo factor. introduce el código de 6 dígitos de tu app autenticadora.',
        submit: 'verificar',
        aria: 'Verificar código de segundo factor',
        icon: KeyRound,
      },
    }[mode];
    const title = createEl('h1', { className: 'account-app__title', textContent: copy.title });
    const message = createEl('p', { className: 'account-app__message', textContent: copy.message });
    const emailField = createInput({ label: 'email', type: 'email', placeholder: 'email', required: true });
    const emailInput = emailField.querySelector<HTMLInputElement>('input');
    const fields: HTMLElement[] = mode === 'totp' ? [] : [emailField];
    let passwordInput: HTMLInputElement | null = null;
    let confirmationInput: HTMLInputElement | null = null;
    let codeInput: HTMLInputElement | null = null;

    if (mode === 'totp') {
      const codeField = createInput({ label: 'código', type: 'text', placeholder: '000000', required: true });
      codeInput = codeField.querySelector<HTMLInputElement>('input');
      fields.push(codeField);
    }
    if (mode === 'login' || mode === 'register') {
      const passwordField = createInput({ label: 'password', type: 'password', placeholder: 'password', required: true });
      passwordInput = passwordField.querySelector<HTMLInputElement>('input');
      fields.push(passwordField);
    }
    if (mode === 'register') {
      const confirmationField = createInput({ label: 'confirmar password', type: 'password', placeholder: 'confirmar password', required: true });
      confirmationInput = confirmationField.querySelector<HTMLInputElement>('input');
      fields.push(confirmationField);
    }

    const feedback = createEl('p', {
      className: 'account-app__feedback',
      role: 'status',
      textContent: '',
    });
    feedback.hidden = true;
    const submit = createEl('button', {
      type: 'button',
      className: 'boton boton-con-icono account-app__submit',
      ariaLabel: copy.aria,
    }, icon(copy.icon), createEl('span', { textContent: copy.submit }));

    submit.addEventListener('click', safeClick(async () => {
      const email = emailInput?.value.trim() ?? '';
      const password = passwordInput?.value ?? '';
      const confirmation = confirmationInput?.value ?? '';
      const code = codeInput?.value.trim() ?? '';
      feedback.hidden = true;
      if (mode === 'totp') {
        if (code.length !== 6) {
          feedback.textContent = 'el código tiene 6 dígitos';
          feedback.hidden = false;
          return;
        }
      } else if (!email || ((mode !== 'recover') && !password) || (mode === 'register' && !confirmation)) {
        feedback.textContent = 'completa todos los campos';
        feedback.hidden = false;
        return;
      }
      if (mode === 'register' && password !== confirmation) {
        feedback.textContent = 'las contraseñas no coinciden';
        feedback.hidden = false;
        return;
      }

      submit.disabled = true;
      const label = submit.querySelector('span:last-child');
      if (label) label.textContent = 'procesando…';

      if (mode === 'totp') {
        const result = mfaChallenge
          ? await safeRun(AuthService.verifyMfa(mfaChallenge, code), 'código inválido')
          : { ok: false as const, error: new Error('reto de sesión expirado') };
        submit.disabled = false;
        if (label) label.textContent = copy.submit;
        if (!result.ok) {
          feedback.textContent = 'código inválido o reto expirado; vuelve a entrar';
          feedback.hidden = false;
          mfaChallenge = null;
          return;
        }
        feedback.textContent = 'sesión iniciada';
        feedback.hidden = false;
        showToast('sesión iniciada');
        return;
      }

      const result = mode === 'login'
        ? await safeRun(AuthService.login(email, password), 'credenciales incorrectas')
        : mode === 'register'
          ? await safeRun(AuthService.register(email, password), 'no se pudo solicitar el registro')
          : await safeRun(AuthService.requestPasswordReset(email), 'no se pudo solicitar la recuperación');
      submit.disabled = false;
      if (label) label.textContent = copy.submit;
      if (!result.ok) {
        feedback.textContent = mode === 'login' ? 'no se pudo iniciar sesión' : 'la solicitud no pudo completarse';
        feedback.hidden = false;
        return;
      }
      if (mode === 'login') {
        /* [297A-13] Segundo factor: el login no emite sesión; pasamos al paso
         * de código con el reto devuelto por el backend. */
        const loginResult = result.value as { mfaRequired: boolean; challenge: string | null };
        if (loginResult.mfaRequired && loginResult.challenge) {
          mfaChallenge = loginResult.challenge;
          mode = 'totp';
          renderMode();
          return;
        }
        feedback.textContent = 'sesión iniciada';
        feedback.hidden = false;
        showToast('sesión iniciada');
        return;
      }
      if (mode === 'register') {
        feedback.textContent = 'solicitud recibida; revisa tu correo para activar la cuenta';
        feedback.hidden = false;
        /* [297A-13] En desarrollo, la verificación se puede completar desde el
         * buzón mockeado sin depender de un proveedor real. */
        const token = await devVerificationFor(email);
        if (stopped) return;
        if (token) {
          const verify = await safeRun(AuthService.verifyEmail(token), 'no se pudo verificar el correo');
          if (!stopped && verify.ok) {
            feedback.textContent = 'cuenta verificada en modo desarrollo; ya puedes entrar';
            feedback.hidden = false;
          }
        }
        return;
      }
      feedback.textContent = 'si el correo existe, recibirás instrucciones';
      feedback.hidden = false;
    }));

    const form = createEl('div', {
      className: 'account-app__form',
      role: 'form',
      ariaLabel: copy.aria,
    }, ...fields, feedback, submit);
    form.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') submit.click();
    });

    const actions = createEl('div', { className: 'account-app__actions' });
    if (mode === 'totp') {
      actions.appendChild(createActionButton('volver a entrar', ArrowLeft, () => { mode = 'login'; mfaChallenge = null; renderMode(); }, 'Volver a iniciar sesión'));
    } else if (mode !== 'login') {
      actions.appendChild(createActionButton('volver a entrar', ArrowLeft, () => { mode = 'login'; renderMode(); }, 'Volver a iniciar sesión'));
    } else {
      actions.append(
        createActionButton('crear cuenta', UserPlus, () => { mode = 'register'; renderMode(); }, 'Crear cuenta'),
        createActionButton('recuperar acceso', KeyRound, () => { mode = 'recover'; renderMode(); }, 'Recuperar acceso'),
      );
    }
    container.append(title, message, form, actions);
  };

  renderMode();
}

function renderAuthenticated(container: HTMLElement, state: AuthState): void {
  const title = createEl('h1', {
    className: 'account-app__title',
    textContent: 'cuenta',
  });
  const status = createEl('p', {
    className: 'account-app__status',
    role: 'status',
  }, icon(state.capability === 'admin' ? ShieldCheck : UserRound), createEl('span', {
    textContent: state.capability === 'admin' ? 'sesión activa · admin' : 'sesión activa',
  }));
  const message = createEl('p', {
    className: 'account-app__message',
    textContent: 'tus preferencias y organización se sincronizan con esta cuenta.',
  });
  const actions = createEl('div', { className: 'account-app__actions' });
  actions.appendChild(createActionButton('cerrar sesión', LogOut, () => {
    void safeRun(AuthService.logout(), 'no se pudo cerrar sesión');
  }, 'Cerrar sesión'));
  container.append(title, status, message, actions);
}

function renderView(container: HTMLElement, state: AuthState): void {
  container.replaceChildren();
  if (state.isAuthenticated) renderAuthenticated(container, state);
  else renderGuest(container);
}

interface AccountMount {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

interface Panel {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

function mount(ctx: RenderContext): AccountMount {
  const container = createEl('section', {
    className: 'account-app',
    ariaLabel: 'Cuenta',
  });
  let stopped = false;
  let preferencesPanel: Panel | null = null;
  let securityPanel: Panel | null = null;

  const render = (state: AuthState): void => {
    if (stopped) return;
    preferencesPanel?.destroy();
    securityPanel?.destroy();
    preferencesPanel = null;
    securityPanel = null;
    renderView(container, state);
    /* [297A-26] Las preferencias (tema + resolución de conflicto) viven dentro
     * de la ventana Cuenta como panel embebido, no como modal global del
     * sistema. El panel siempre muestra la preferencia; si el conflicto sigue
     * pendiente al reabrir la ventana, reaparece. */
    if (state.isAuthenticated) {
      preferencesPanel = createPreferencesPanel();
      container.append(preferencesPanel.element);
      /* [297A-13] MFA TOTP: alta/verificación desde la propia app Cuenta. */
      securityPanel = createSecurityPanel();
      container.append(securityPanel.element);
    }
  };

  const stop = authStore.subscribe(render);
  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    stop();
    preferencesPanel?.destroy();
    securityPanel?.destroy();
    preferencesPanel = null;
    securityPanel = null;
  };
  ctx.signal.addEventListener('abort', cleanup, { once: true });
  return { element: container, destroy: cleanup };
}

/** Crear el elemento para el fallback de ruta legacy `/login`. */
export function createAccountView(ctx: RenderContext): HTMLElement {
  return mount(ctx).element;
}

/** Contrato MountedView usado por AppRegistry. */
export function mountAccountView(ctx: RenderContext): MountedView {
  return mount(ctx);
}
