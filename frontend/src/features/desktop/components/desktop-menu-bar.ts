/* wandori.us — Desktop Menu Bar
 * Barra superior del OS con menús desplegables.
 * Archivo: artículos del blog. Aplicaciones: apps del AppRegistry.
 * Configuración: abre la app de settings.
 * [Plan §2.3] Los menús proyectan CommandRegistry/AppRegistry. */

import { createElement, Bell, FileUser, Folder, UserRound, type IconNode } from 'lucide';
import { createEl } from '../../../utils/dom';
import { formatShortcut } from '../../../utils/format-shortcut';
import { AppRegistry } from '../../runtime/app-registry';
import type { Capability } from '../../runtime/capability';
import { hasCapability } from '../../runtime/capability';
import { authStore, authAccountName } from '../../../store';
import { ArticleService } from '../../../services';
import { createThemeToggleButton } from '../../../components/ui/theme-toggle-button';
import { loadNotifications, notificationsStore, unreadNotificationCount } from '../../notifications/notifications-store';
import { createNotificationsPopover } from '../../notifications/notifications-popover';

interface MenuController {
  readonly close: () => void;
  readonly toggle: (entry: HTMLElement) => void;
  readonly registerOpenCallback: (menu: HTMLElement, callback: () => void) => void;
}

function createMenuController(): MenuController {
  let openEntry: HTMLElement | null = null;
  let openToggleTimer: number | null = null;
  const callbacks = new WeakMap<HTMLElement, () => void>();

  function close(): void {
    if (openEntry) {
      openEntry.classList.remove('desktop-menu-bar__entry--open');
      const menu = openEntry.querySelector('.desktop-context-menu') as HTMLElement | null;
      if (menu) menu.hidden = true;
      const button = openEntry.querySelector('.desktop-menu-bar__item') as HTMLButtonElement | null;
      if (button) button.setAttribute('aria-expanded', 'false');
      openEntry = null;
    }
    if (openToggleTimer !== null) {
      window.clearTimeout(openToggleTimer);
      openToggleTimer = null;
    }
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onEscapeKey);
  }

  function onOutsideClick(event: MouseEvent): void {
    if (openEntry && !openEntry.contains(event.target as Node)) close();
  }

  function onEscapeKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  function toggle(entry: HTMLElement): void {
    if (openEntry === entry) {
      close();
      return;
    }
    close();

    const menu = entry.querySelector('.desktop-context-menu') as HTMLElement | null;
    const button = entry.querySelector('.desktop-menu-bar__item') as HTMLButtonElement | null;
    if (menu) callbacks.get(menu)?.();

    entry.classList.add('desktop-menu-bar__entry--open');
    if (menu) menu.hidden = false;
    if (button) button.setAttribute('aria-expanded', 'true');
    openEntry = entry;

    openToggleTimer = window.setTimeout(() => {
      openToggleTimer = null;
      document.addEventListener('click', onOutsideClick);
      document.addEventListener('keydown', onEscapeKey);
    }, 0);
  }

  return {
    close,
    toggle,
    registerOpenCallback: (menu, callback) => callbacks.set(menu, callback),
  };
}

function createMenuLabel(label: string): HTMLButtonElement {
  return createEl('button', {
    type: 'button', className: 'desktop-menu-bar__item', textContent: label,
    ariaHaspopup: 'menu', ariaExpanded: 'false',
  });
}

function createMenuItem(
  label: string,
  closeMenu: () => void,
  options?: { icon?: IconNode; shortcut?: string; disabled?: boolean; onClick?: () => void },
): HTMLElement {
  const children: (string | HTMLElement)[] = [];
  if (options?.icon) {
    children.push(createEl('span', { className: 'desktop-context-menu__icon' }, createElement(options.icon)));
  }
  children.push(createEl('span', { className: 'desktop-context-menu__label', textContent: label }));
  if (options?.shortcut) {
    /* [297A-20] Atajo renderizado con glifos de tecla (Meta+Shift+l -> ⌘⇧L).
     * Para revertir: volver a textContent: options.shortcut. */
    children.push(createEl('span', { className: 'desktop-context-menu__shortcut', textContent: formatShortcut(options.shortcut) }));
  }

  const item = createEl('div', { className: 'desktop-context-menu__item', role: 'menuitem' }, ...children);
  if (options?.disabled) {
    item.classList.add('desktop-context-menu__item--disabled');
    item.setAttribute('aria-disabled', 'true');
  } else if (options?.onClick) {
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      closeMenu();
      options.onClick!();
    });
  }
  return item;
}

function createArchiveMenu(isAlive: () => boolean, closeMenu: () => void): HTMLElement {
  const menu = createEl('div', { className: 'desktop-context-menu', role: 'menu', ariaLabel: 'Archivo' });
  menu.hidden = true;
  const loading = createMenuItem('cargando…', closeMenu, { disabled: true });
  menu.appendChild(loading);

  void ArticleService.list(1, 20)
    .then(({ items }) => {
      if (!isAlive()) return;
      loading.remove();
      if (items.length === 0) {
        menu.appendChild(createMenuItem('sin artículos', closeMenu, { disabled: true }));
        return;
      }
      for (const article of items) {
        menu.appendChild(createMenuItem(article.title, closeMenu, {
          icon: FileUser,
          onClick: () => {
            void import('../../../router').then(router => router.navigate(`/article/${article.slug}`));
          },
        }));
      }
    })
    .catch(() => {
      if (!isAlive()) return;
      loading.remove();
      menu.appendChild(createMenuItem('error al cargar', closeMenu, { disabled: true }));
    });
  return menu;
}

function createApplicationsMenu(
  isAlive: () => boolean,
  closeMenu: () => void,
  controller: MenuController,
): HTMLElement {
  const menu = createEl('div', { className: 'desktop-context-menu', role: 'menu', ariaLabel: 'Aplicaciones' });
  menu.hidden = true;
  let refreshGeneration = 0;

  function refresh(): void {
    const generation = ++refreshGeneration;
    menu.innerHTML = '';
    void import('../../runtime/workspace/workspace-store').then(({ workspaceStore }) => {
      if (!isAlive() || generation !== refreshGeneration) return;
      const ws = workspaceStore.get();
      const capability: Capability = authStore.get().capability;
      const launcherItems = Object.values(ws.nodes)
        .filter(node => node.parentId === 'desktop' && (node.type === 'app' || node.type === 'folder'))
        .sort((a, b) => (a.mobileOrder ?? 0) - (b.mobileOrder ?? 0));

      for (const node of launcherItems) {
        const app = node.type === 'app' && node.refId ? AppRegistry.get(node.refId) : undefined;
        if (app && !hasCapability(capability, app.requires)) continue;
        const icon = app?.icon ?? Folder;
        menu.appendChild(createMenuItem(node.label, closeMenu, {
          icon,
          onClick: () => {
            const appId = app?.id ?? 'finder';
            const params = node.type === 'folder' ? { folderId: node.id } : undefined;
            void import('../../runtime/route-app-adapter').then(adapter => adapter.openAppWindow(appId, params));
          },
        }));
      }
      if (launcherItems.length === 0) {
        menu.appendChild(createMenuItem('sin aplicaciones', closeMenu, { disabled: true }));
      }
    }).catch(() => {
      if (!isAlive() || generation !== refreshGeneration) return;
      menu.innerHTML = '';
      menu.appendChild(createMenuItem('error al cargar', closeMenu, { disabled: true }));
    });
  }

  refresh();
  controller.registerOpenCallback(menu, refresh);
  return menu;
}

function createMenuEntry(label: string, menu: HTMLElement, controller: MenuController): HTMLElement {
  const button = createMenuLabel(label);
  const entry = createEl('div', { className: 'desktop-menu-bar__entry' }, button, menu);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    controller.toggle(entry);
  });
  return entry;
}

export interface DesktopMenuBar {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

export function createDesktopMenuBar(): DesktopMenuBar {
  let destroyed = false;
  const isAlive = (): boolean => !destroyed;
  const controller = createMenuController();
  const archiveMenu = createArchiveMenu(isAlive, controller.close);
  const applicationsMenu = createApplicationsMenu(isAlive, controller.close, controller);

  const brand = createEl('span', { className: 'desktop-menu-bar__brand', ariaLabel: 'Menú del sistema' });
  const archiveEntry = createMenuEntry('Archivo', archiveMenu, controller);
  const applicationsEntry = createMenuEntry('Aplicaciones', applicationsMenu, controller);
  const settingsButton = createMenuLabel('Configuración');
  settingsButton.addEventListener('click', () => {
    controller.close();
    void import('../../runtime/route-app-adapter').then(adapter => adapter.openAppWindow('settings'));
  });
  const settingsEntry = createEl('div', { className: 'desktop-menu-bar__entry' }, settingsButton);
  /* [297A-18] Botón único de tema del OS; comparte el comando con el launcher móvil.
   * Se ubica junto a la hora en el extremo derecho de la barra. */
  const themeToggle = createThemeToggleButton('desktop-menu-bar__item desktop-menu-bar__tema');
  const notificationsButton = createEl('button', {
    type: 'button',
    className: 'desktop-menu-bar__item desktop-menu-bar__notificaciones',
    ariaLabel: 'Abrir novedades',
  }, createElement(Bell), createEl('span', { className: 'desktop-menu-bar__notificaciones-contador', ariaHidden: 'true' }));
  const notificationCount = notificationsButton.querySelector('.desktop-menu-bar__notificaciones-contador');
  const stopNotifications = notificationsStore.subscribeSimple((state) => {
    const count = unreadNotificationCount(state);
    if (notificationCount) notificationCount.textContent = count > 0 ? String(count) : '';
    notificationsButton.setAttribute('aria-label', count > 0 ? `Novedades (${count} sin leer)` : 'Abrir novedades');
    notificationsButton.toggleAttribute('data-hay-novedades', count > 0);
  });
  void loadNotifications();
  /* [028A-5] La campana abre un popover anclado (novedades), no una ventana. */
  const notificationsPopover = createNotificationsPopover(notificationsButton);
  notificationsButton.addEventListener('click', () => {
    controller.close();
    notificationsPopover.toggle();
  });
  const accountButton = createEl('button', {
    type: 'button',
    className: 'desktop-menu-bar__item desktop-menu-bar__account',
    ariaLabel: 'Abrir Cuenta',
  }, createElement(UserRound), createEl('span', { className: 'desktop-menu-bar__account-label' }));
  const accountLabel = accountButton.querySelector('.desktop-menu-bar__account-label');
  const stopAuth = authStore.subscribe((state) => {
    if (!accountLabel) return;
    /* [028A-7] Solo el nombre del usuario (parte local del email), sin el
     * prefijo redundante "Cuenta ·". Fallback admin/cuenta si no hay email. */
    accountLabel.textContent = state.isAuthenticated
      ? authAccountName(state)
      : 'Entrar';
    accountButton.setAttribute('aria-label', state.isAuthenticated ? 'Abrir Cuenta' : 'Iniciar sesión');
  });
  accountButton.addEventListener('click', () => {
    controller.close();
    void import('../../runtime/route-app-adapter').then(adapter => adapter.openAppWindow('account'));
  });
  const menus = createEl('div', { className: 'desktop-menu-bar__menus' },
    brand, archiveEntry, applicationsEntry, settingsEntry,
  );
  const clock = createEl('time', { className: 'desktop-menu-bar__clock' });
  /* [297A-18] La hora queda al final, a la extrema derecha; el botón de tema
   * va inmediatamente a su izquierda. */
  const barraDerecha = createEl('div', { className: 'desktop-menu-bar__derecha' },
    accountButton, notificationsButton, themeToggle.element, clock,
  );

  function updateClock(): void {
    if (destroyed) return;
    const now = new Date();
    clock.textContent = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  updateClock();
  const clockInterval = window.setInterval(updateClock, 30_000);
  const element = createEl('header', { className: 'desktop-menu-bar' }, menus, barraDerecha);

  return {
    element,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      window.clearInterval(clockInterval);
      controller.close();
      stopAuth();
      stopNotifications();
      notificationsPopover.destroy();
      themeToggle.destroy();
      element.remove();
    },
  };
}
