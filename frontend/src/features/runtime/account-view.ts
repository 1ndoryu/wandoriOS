/* wandori.us — Account App View
 * Vista reactiva de Cuenta para el runtime del OS.
 * AuthService es la única frontera HTTP; authStore es la única fuente de
 * verdad de sesión. La vista no crea router ni estado paralelo.
 * [297A-13] */

import { ArrowLeft, createElement, KeyRound, LogIn, LogOut, Mail, ShieldCheck, UserPlus, UserRound, type IconNode } from 'lucide';
import { AuthService } from '../../services';
import { authStore, type AuthState } from '../../store';
import { createInput } from '../../components/ui/input';
import { showToast } from '../../components/ui/toast';
import { safeClick, safeRun } from '../../utils/safe-async';
import { createEl } from '../../utils/dom';
import { createPreferencesPanel } from './preferences-panel';
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

type GuestMode = 'login' | 'register' | 'recover';

function renderGuest(container: HTMLElement): void {
  let mode: GuestMode = 'login';

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
    }[mode];
    const title = createEl('h1', { className: 'account-app__title', textContent: copy.title });
    const message = createEl('p', { className: 'account-app__message', textContent: copy.message });
    const emailField = createInput({ label: 'email', type: 'email', placeholder: 'email', required: true });
    const emailInput = emailField.querySelector<HTMLInputElement>('input');
    const fields: HTMLElement[] = [emailField];
    let passwordInput: HTMLInputElement | null = null;
    let confirmationInput: HTMLInputElement | null = null;

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
      /* [028A-4] Sin boton-grande: dentro de la ventana el tamaño lo gobierna
       * el chrome (receta .boton OS), no el contenido. El envío debe medir lo
       * mismo que las acciones secundarias (crear cuenta/recuperar acceso). */
      className: 'boton boton-con-icono account-app__submit',
      ariaLabel: copy.aria,
    }, icon(copy.icon), createEl('span', { textContent: copy.submit }));

    submit.addEventListener('click', safeClick(async () => {
      const email = emailInput?.value.trim() ?? '';
      const password = passwordInput?.value ?? '';
      const confirmation = confirmationInput?.value ?? '';
      feedback.hidden = true;
      if (!email || ((mode !== 'recover') && !password) || (mode === 'register' && !confirmation)) {
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
      feedback.textContent = mode === 'login'
        ? 'sesión iniciada'
        : mode === 'register'
          ? 'solicitud recibida; revisa tu correo cuando el registro esté habilitado'
          : 'si el correo existe, recibirás instrucciones';
      feedback.hidden = false;
      if (mode === 'login') showToast('sesión iniciada');
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
    if (mode !== 'login') {
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

interface PreferencesPanel {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

function mount(ctx: RenderContext): AccountMount {
  const container = createEl('section', {
    className: 'account-app',
    ariaLabel: 'Cuenta',
  });
  let stopped = false;
  let panel: PreferencesPanel | null = null;

  const render = (state: AuthState): void => {
    if (stopped) return;
    panel?.destroy();
    panel = null;
    renderView(container, state);
    /* [297A-26] Las preferencias (tema + resolución de conflicto) viven dentro
     * de la ventana Cuenta como panel embebido, no como modal global del
     * sistema. El panel siempre muestra la preferencia; si el conflicto sigue
     * pendiente al reabrir la ventana, reaparece. */
    if (state.isAuthenticated) {
      panel = createPreferencesPanel();
      container.append(panel.element);
    }
  };

  const stop = authStore.subscribe(render);
  const cleanup = (): void => {
    if (stopped) return;
    stopped = true;
    stop();
    panel?.destroy();
    panel = null;
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
