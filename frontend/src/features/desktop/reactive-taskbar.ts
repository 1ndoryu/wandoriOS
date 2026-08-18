/* wandori.us — Reactive Taskbar
 * Taskbar del OS suscrito a windowStore. Extraído de desktop-shell.ts. */

import {
  createElement,
  FileUser,
  PanelLeft,
  X,
} from 'lucide';
import { createEl } from '../../utils/dom';
import type { WindowIdentity, WindowContent } from '../runtime/window-store';
import { windowStore, closeWindow, restoreWindow, focusWindow } from '../runtime/window-manager';
import { showSidebar } from '../../store';
import { CommandRegistry } from '../runtime/command-registry';

import { reconcileChildren } from '../../utils/reconcile';

function getTaskClass(win: WindowIdentity): string {
  const activeClass = win.state === 'open' && win.focused
    ? 'active'
    : win.state === 'minimized' ? 'minimized' : '';
  return `desktop-taskbar__task desktop-taskbar__task--${activeClass}`;
}

export function createReactiveTaskbar(): { element: HTMLElement; taskList: HTMLElement; destroy: () => void } {
  const taskbar = createEl('footer', { className: 'desktop-taskbar', ariaLabel: 'Ventanas abiertas' });

  const navControl = createEl('button', { type: 'button', className: 'desktop-taskbar__nav-control' });
  const navIcon = createElement(PanelLeft);
  navIcon.classList.add('desktop-taskbar__icon');
  navControl.appendChild(navIcon);
  const updateNavLabel = (visible: boolean): void => {
    navControl.setAttribute('aria-label', visible ? 'Ocultar navegación' : 'Mostrar navegación');
  };
  const stopSidebar = showSidebar.subscribe((visible) => updateNavLabel(visible));
  navControl.addEventListener('click', () => {
    void CommandRegistry.execute('navigation:toggle-external-nav');
  });

  const taskList = createEl('div', { className: 'desktop-taskbar__tasks' });

  taskbar.append(navControl, taskList);

  type TaskbarWin = WindowIdentity & Pick<WindowContent, 'icon' | 'app'>;
  const stopWindows = windowStore.subscribe((windows: readonly TaskbarWin[]) => {
    reconcileChildren(
      taskList,
      windows,
      (win) => win.instanceId,
      (win) => {
        const svgIcon = createElement(win.icon ?? win.app?.icon ?? FileUser);
        svgIcon.classList.add('desktop-taskbar__icon');

        /* [297A-12] El control de cerrar no puede vivir dentro de otro button:
         * el HTML inválido hacía que el navegador separara sus nodos y desarmara
         * visualmente la tarea de About. La envoltura agrupa dos controles hermanos. */
        const item = createEl('div', { className: getTaskClass(win) });
        const activate = createEl('button', {
          type: 'button', className: 'desktop-taskbar__activate', ariaLabel: `Abrir ${win.title}`,
        },
        svgIcon,
        createEl('span', { className: 'desktop-taskbar__label', textContent: win.title }),
        );
        const close = createEl('button', { type: 'button', className: 'desktop-taskbar__close', ariaLabel: `Cerrar ${win.title}` },
          createElement(X),
        );

        activate.addEventListener('click', () => {
          const id = item.dataset.key;
          if (!id) return;
          const win = windowStore.get().find(w => w.instanceId === id);
          if (win?.state === 'minimized') {
            restoreWindow(id);
          } else {
            focusWindow(id);
          }
        });
        close.addEventListener('click', () => {
          const id = item.dataset.key;
          if (!id) return;
          closeWindow(id);
        });

        item.append(activate, close);

        return item;
      },
      (el, win) => {
        el.className = getTaskClass(win);
        const label = el.querySelector('.desktop-taskbar__label');
        if (label && label.textContent !== win.title) label.textContent = win.title;
        const closeBtn = el.querySelector('.desktop-taskbar__close');
        if (closeBtn) closeBtn.setAttribute('aria-label', `Cerrar ${win.title}`);
      },
    );
  });

  const destroy = (): void => {
    stopWindows();
    stopSidebar();
    taskList.replaceChildren();
  };

  return { element: taskbar, taskList, destroy };
}
