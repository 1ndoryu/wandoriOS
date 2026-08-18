import { Check, createElement, Maximize2, Minus, X, type IconNode } from 'lucide';
import { createEl } from '../../../utils/dom';
import type { AppToolbarGroup, ToolbarItemRef } from '../../runtime/app-registry';
import { CommandRegistry, type CommandContext } from '../../runtime/command-registry';
import { authStore } from '../../../store';
import { openDropdownMenu, type DropdownMenuItem } from './dropdown-menu';

export interface DesktopWindowOptions {
  title: string;
  content: HTMLElement;
  className?: string;
  active?: boolean;
  resizable?: boolean;
  layout?: 'padded' | 'full-bleed';
  toolbar?: AppToolbarGroup[];
  /* [018A-1] Franja de acciones inferior de la ventana: hija directa de
   * .desktop-window, debajo del body padded. La provee la app. */
  actions?: HTMLElement;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

function createWindowControl(
  icon: IconNode,
  className: string,
  label: string,
  onActivate?: () => void,
): HTMLButtonElement {
  const control = createEl('button', { type: 'button', className: `desktop-window__control ${className}`, ariaLabel: label },
    createElement(icon),
  );
  control.disabled = !onActivate;

  if (onActivate) control.addEventListener('click', onActivate);
  return control;
}

/* [297A-2] Receta visual única para todas las futuras aplicaciones.
 * Los controles son decorativos hasta que exista el gestor de ventanas.
 * [297A-29 F2] Devuelve { element, destroy } para cancelar la suscripción
 * del toolbar (login/logout en vivo) cuando la ventana se cierra. */
export function createDesktopWindow(options: DesktopWindowOptions): { element: HTMLElement; destroy: () => void } {
  const windowElement = createEl('section', { className: 'desktop-window', ariaLabel: `Ventana ${options.title}` });

  if (options.className) windowElement.classList.add(...options.className.split(' '));
  if (options.active) windowElement.classList.add('desktop-window--active');
  if (options.resizable) windowElement.classList.add('desktop-window--resizable');

  const closeControl = createWindowControl(
    X, 'desktop-window__control--close', `Cerrar ${options.title}`, options.onClose,
  );

  const minimizeControl = createWindowControl(
    Minus, 'desktop-window__control--minimize', `Minimizar ${options.title}`, options.onMinimize,
  );

  const titleBar = createEl('header', { className: 'desktop-window__titlebar' },
    closeControl,
    createEl('span', { className: 'desktop-window__title', textContent: options.title }),
    minimizeControl,
  );

  windowElement.append(titleBar);

  /* App toolbar */
  const allGroups: AppToolbarGroup[] = [
    {
      label: 'Ventana',
      items: [
        { id: 'window:minimize', label: 'Minimizar', icon: Minus },
        { id: 'window:maximize', label: 'Maximizar', icon: Maximize2 },
        { id: 'navigation:copy-url' },
        '---',
        { id: 'window:close', label: 'Cerrar', icon: X },
      ],
    },
    ...(options.toolbar ?? []),
  ];
  const toolbar = createAppToolbar(allGroups, {
    onClose: options.onClose, onMinimize: options.onMinimize, onMaximize: options.onMaximize,
  });
  windowElement.appendChild(toolbar.element);

  const body = createEl('div', { className: 'desktop-window__body' });
  if (options.layout !== 'full-bleed') {
    body.classList.add('desktop-window__body--padded');
  }
  body.appendChild(options.content);
  windowElement.appendChild(body);

  /* [018A-1] Slot de acciones en el chrome: va después del body (fuera de
   * su padding y scroll), como franja inferior de la ventana. */
  if (options.actions) {
    windowElement.appendChild(options.actions);
  }

  return {
    element: windowElement,
    destroy: toolbar.destroy,
  };
}

/* === App Toolbar === */

function resolveToolbarItem(
  ref: ToolbarItemRef,
): { id: string; label: string; icon?: IconNode; shortcut?: string } | null {
  if (ref === '---' || (typeof ref === 'object' && ref.id === '---')) return null;
  if (typeof ref === 'string') {
    const cmd = CommandRegistry.get(ref);
    if (!cmd) return null;
    return { id: ref, label: cmd.label, icon: cmd.icon, shortcut: cmd.shortcut };
  }
  const cmd = CommandRegistry.get(ref.id);
  if (!cmd && !ref.label) return null;
  return {
    id: ref.id,
    label: ref.label ?? (cmd ? cmd.label : ref.id),
    icon: (ref.icon === null ? undefined : ref.icon) ?? cmd?.icon,
    shortcut: cmd?.shortcut,
  };
}

type WindowCallbacks = { onClose?: () => void; onMinimize?: () => void; onMaximize?: () => void };

/* [297A-29 F2] Toolbar reactivo a la capacidad.
 * - La capacidad se lee EN VIVO (authStore.get()) al abrir cada menú, no al
 *   crear el toolbar: login/logout con la ventana abierta se reflejan en la
 *   próxima apertura sin reabrir la ventana.
 * - Se suscribe a authStore para re-renderizar los grupos cuando cambia la
 *   capacidad (login/logout en vivo).
 * - Un grupo cuyos items son todos hidden (p.ej. acciones admin-only con
 *   adminOnly()) se oculta completo: el shell no hace if/else por capacidad.
 * - Devuelve { element, destroy } para cancelar la suscripción en teardown. */
export function createAppToolbar(
  groups: AppToolbarGroup[],
  callbacks?: WindowCallbacks,
): { element: HTMLElement; destroy: () => void } {
  const toolbar = createEl('div', { className: 'desktop-app-toolbar' });

  const windowCallbackMap: Record<string, 'onClose' | 'onMinimize' | 'onMaximize'> = {
    'window:close': 'onClose',
    'window:minimize': 'onMinimize',
    'window:maximize': 'onMaximize',
  };

  function currentContext(): CommandContext {
    return {
      capability: authStore.get().capability,
      presentationMode: 'desktop',
    };
  }

  function buildEntry(group: AppToolbarGroup): HTMLElement {
    const btn = createEl('button', { type: 'button', className: 'desktop-app-toolbar__item', textContent: group.label, ariaHaspopup: 'menu' });

    const entry = createEl('div', { className: 'desktop-app-toolbar__entry' }, btn);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      btn.setAttribute('aria-expanded', 'true');

      const ctx = currentContext();
      const items: DropdownMenuItem[] = [];
      for (const ref of group.items) {
        if (ref === '---' || (typeof ref === 'object' && ref.id === '---')) {
          items.push({ label: '', separator: true });
          continue;
        }

        const resolved = resolveToolbarItem(ref);
        if (!resolved) continue;

        const cmd = CommandRegistry.get(resolved.id);
        type Avail = { state: 'enabled' } | { state: 'disabled'; reason: string } | { state: 'hidden' };
        let availability: Avail = { state: 'enabled' };
        if (cmd?.isAvailable) {
          availability = cmd.isAvailable(ctx);
          if (availability.state === 'hidden') continue;
        }

        /* [018A-71] Item activo con checkmark: el comando declara isActive
         * (filtros/vistas/toggles) y la superficie lo proyecta como Check,
         * patrón de menú de OS. Se evalúa en cada apertura, por lo que
         * refleja el estado al momento de abrir. */
        const active = cmd?.isActive?.(ctx) ?? false;

        const callbackKey = windowCallbackMap[resolved.id];
        const isWindowCmd = !!callbackKey;
        const callbackDisabled = isWindowCmd && !callbacks?.[callbackKey];
        const disabled = availability.state !== 'enabled' || callbackDisabled;

        items.push({
          icon: active ? Check : resolved.icon,
          label: resolved.label,
          shortcut: resolved.shortcut,
          disabled,
          onClick: disabled ? undefined : () => {
            if (resolved.id === 'window:minimize') { callbacks?.onMinimize?.(); return; }
            if (resolved.id === 'window:maximize') { callbacks?.onMaximize?.(); return; }
            if (resolved.id === 'window:close') { callbacks?.onClose?.(); return; }
            void CommandRegistry.execute(resolved.id, ctx);
          },
        });
      }

      const rect = btn.getBoundingClientRect();
      openDropdownMenu({
        items,
        positioning: 'fixed',
        x: rect.left,
        y: rect.bottom,
        ariaLabel: group.label,
        onClose: () => { btn.setAttribute('aria-expanded', 'false'); },
      });
    });

    return entry;
  }

  /* Un grupo solo se muestra si al menos un item es visible para la
   * capacidad actual (fail-closed: items con isAvailable hidden se omiten). */
  function groupHasVisibleItem(group: AppToolbarGroup, ctx: CommandContext): boolean {
    for (const ref of group.items) {
      if (ref === '---' || (typeof ref === 'object' && ref.id === '---')) continue;
      const resolved = resolveToolbarItem(ref);
      if (!resolved) continue;
      const cmd = CommandRegistry.get(resolved.id);
      if (cmd?.isAvailable) {
        const avail = cmd.isAvailable(ctx);
        if (avail.state === 'hidden') continue;
      }
      return true;
    }
    return false;
  }

  function render(): void {
    toolbar.textContent = '';
    const ctx = currentContext();
    for (const group of groups) {
      if (!groupHasVisibleItem(group, ctx)) continue;
      toolbar.appendChild(buildEntry(group));
    }
  }

  render();

  /* Re-render en login/logout: la visibilidad de grupos admin-only cambia en vivo */
  const unsubscribe = authStore.subscribe(() => render());

  return {
    element: toolbar,
    destroy: unsubscribe,
  };
}
