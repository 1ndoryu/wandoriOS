/* wandori.us — Desktop Shell
 * Shell reactivo del escritorio. Orquesta: menu bar, workspace, ventanas y taskbar.
 * Icon grid y taskbar están extraídos en módulos separados. */

import { FileUser } from 'lucide';
import { createEl } from '../../utils/dom';
import { createDesktopMenuBar } from './components/desktop-menu-bar';
import { createDesktopWindow } from './components/desktop-window';
import { createProfileSettingsPanel } from '../settings/profile-settings';
import { setProfileSettingsToggle } from '../runtime/commands/profile-commands';
import type { AppToolbarGroup } from '../runtime/app-registry';
import {
  windowStore, focusWindow, restoreWindow, closeWindow,
  minimizeWindow, reframeAllWindows, setWorkspaceBounds, registerShellWindow,
} from '../runtime/window-manager';
import { CommandRegistry } from '../runtime/command-registry';
import { authStore } from '../../store';
import { enableDragResize } from './utils/drag-resize';
import { openContextMenu } from './components/desktop-context-menu';
import { selectBackground } from '../runtime/selection-store';
import { makeDropTarget, onGlobalDrop } from './utils/icon-drag';
import { moveNodeToParent } from '../runtime/workspace/workspace-store';
import { createWorkspaceIconGrid } from './workspace-icon-grid';
import { createReactiveTaskbar } from './reactive-taskbar';

export interface DesktopShell {
  element: HTMLElement;
  contentWindow: HTMLElement;
  setProfileVisible(visible: boolean): void;
  destroy(): void;
}

export function createDesktopShell(
  profile: HTMLElement,
  content: HTMLElement,
): DesktopShell {
  let destroyed = false;
  const shell = createEl('section', { className: 'desktop-shell', ariaLabel: 'Escritorio' });
  /* [297A-17] Skip-link: primer elemento tabulable del shell, visible solo al
   * recibir foco por teclado. `content` es el main con el outlet del router. */
  const skipLink = createEl('a', {
    className: 'skip-link',
    href: '#contenido-principal',
    textContent: 'saltar al contenido',
    'aria-label': 'Saltar al contenido principal',
  });
  content.id = content.id || 'contenido-principal';
  const workspace = createEl('div', { className: 'desktop-workspace' });

  /* Profile como shell window.
   * [297A-29 F3] El contenido es un wrapper: header del perfil + panel de
   * configuración SOLO para admins. Un invitado no debe tener el panel en el
   * DOM ni handler registrado: el panel se monta/desmonta reactivamente según
   * authStore (login/logout en vivo), igual que el toolbar. El toggle lo
   * registra el shell y se limpia al destruir. */
  const profileInstanceId = 'shell-profile';
  const profileWindowContent = createEl('div', { className: 'desktop-profile-window__content' });
  profileWindowContent.append(profile);

  let profileSettingsPanel: HTMLElement | null = null;
  function syncProfileSettingsPanel(): void {
    const isAdmin = authStore.get().capability === 'admin';
    if (isAdmin && !profileSettingsPanel) {
      profileSettingsPanel = createProfileSettingsPanel();
      /* Oculto por defecto; se abre con el comando 'profile:settings'.
       * Clase canónica .oculto (display:none !important): el atributo HTML
       * hidden NO funciona porque config-tab-content define display:flex y
       * anula el [hidden] del browser. */
      profileSettingsPanel.classList.add('oculto');
      profileWindowContent.append(profileSettingsPanel);
    } else if (!isAdmin && profileSettingsPanel) {
      profileSettingsPanel.remove();
      profileSettingsPanel = null;
    }
  }
  /* subscribe llama al listener inmediatamente (estado inicial) */
  const stopAuthSync = authStore.subscribe(syncProfileSettingsPanel);

  /* Toolbar de la ventana Perfil: solo admins ven el botón (adminOnly). */
  const profileToolbar: AppToolbarGroup[] = [
    { label: 'Perfil', items: ['profile:settings'] },
  ];

  setProfileSettingsToggle(() => {
    if (!profileSettingsPanel) return; /* fail-closed: no hay panel montado */
    profileSettingsPanel.classList.toggle('oculto');
  });

  registerShellWindow({
    instanceId: profileInstanceId,
    title: 'Perfil',
    icon: FileUser,
    content: profileWindowContent,
    initialBounds: { x: 44, y: 42, w: 470, h: 264 },
    focused: true,
    cssClass: 'desktop-profile-window',
    layout: 'full-bleed',
    toolbar: profileToolbar,
  });

  /* Ventana legacy para páginas no-app */
  const contentWindowHandle = createDesktopWindow({
    title: 'Documento',
    content,
    className: 'desktop-content-window',
    resizable: true,
  });
  const contentWindow = contentWindowHandle.element;
  contentWindow.style.display = 'none';

  /* Icon grid reactivo */
  const iconGrid = createWorkspaceIconGrid({
    profile: () => {
      const existing = windowStore.get().find(w => w.instanceId === profileInstanceId);
      if (existing) {
        if (existing.state === 'minimized') restoreWindow(profileInstanceId);
        focusWindow(profileInstanceId);
      } else {
        registerShellWindow({
          instanceId: profileInstanceId,
          title: 'Perfil',
          icon: FileUser,
          content: profileWindowContent,
          initialBounds: { x: 44, y: 42, w: 470, h: 224 },
          focused: true,
          cssClass: 'desktop-profile-window',
          layout: 'full-bleed',
          toolbar: profileToolbar,
        });
      }
    },
  });
  makeDropTarget({ el: workspace, dropId: 'desktop', context: 'desktop' });

  workspace.append(iconGrid.element, contentWindow);

  const onWorkspaceContextMenu = (e: MouseEvent): void => {
    if (e.target !== workspace && e.target !== iconGrid.element) return;
    e.preventDefault();
    selectBackground('desktop');
    openContextMenu({
      context: 'desktop',
      capability: authStore.get().capability,
      x: e.clientX,
      y: e.clientY,
    });
  };
  workspace.addEventListener('contextmenu', onWorkspaceContextMenu);

  const taskbar = createReactiveTaskbar();

  const stopGlobalDrop = onGlobalDrop((result) => {
    if (result.sourceId === result.targetId) return;
    moveNodeToParent(result.sourceId, result.targetId);
  });

  const menuBar = createDesktopMenuBar();
  shell.append(skipLink, menuBar.element, workspace, taskbar.element);

  /* Window container */
  const windowContainer = createEl('div', { className: 'desktop-windows-container' });
  windowContainer.style.position = 'absolute';
  windowContainer.style.inset = '0';
  windowContainer.style.pointerEvents = 'none';
  workspace.appendChild(windowContainer);

  const resizeObserver = new ResizeObserver(() => {
    setWorkspaceBounds(windowContainer.clientWidth, windowContainer.clientHeight);
    reframeAllWindows('sync');
  });
  resizeObserver.observe(windowContainer);

  const renderedWindows = new Map<string, { el: HTMLElement; cleanup: () => void; destroy: () => void }>();

  const stopWindows = windowStore.subscribe((windows) => {
    for (const win of windows) {
      if (!renderedWindows.has(win.instanceId)) {
        const windowHandle = createDesktopWindow({
          title: win.title,
          content: win.content,
          /* [018A-1] Franja inferior opcional de la ventana. */
          actions: win.actions,
          className: win.cssClass ?? `desktop-window--${win.appId}`,
          layout: win.layout,
          toolbar: win.toolbar,
          active: win.focused,
          resizable: true,
          onClose: () => {
            /* closeWindow es el único dueño del teardown y MountedView.destroy.
             * Así app_closed no se emite dos veces desde shell y app. */
            closeWindow(win.instanceId);
          },
          onMinimize: () => { minimizeWindow(win.instanceId); },
          onMaximize: () => {
            void CommandRegistry.execute('window:maximize', {
              targets: [{ id: win.instanceId, kind: 'window' }],
            });
          },
        });
        const el = windowHandle.element;

        el.style.position = 'absolute';
        el.style.setProperty('--win-x', `${win.bounds.x}px`);
        el.style.setProperty('--win-y', `${win.bounds.y}px`);
        el.style.setProperty('--win-w', `${win.bounds.w}px`);
        el.style.setProperty('--win-h', `${win.bounds.h}px`);
        el.style.pointerEvents = 'auto';

        const titleBar = el.querySelector('.desktop-window__titlebar') as HTMLElement;
        let cleanup = () => {};
        if (titleBar) {
          cleanup = enableDragResize({
            windowEl: el,
            instanceId: win.instanceId,
            dragHandle: titleBar,
            resizable: true,
          });
        }

        el.addEventListener('mousedown', () => { focusWindow(win.instanceId); });
        windowContainer.appendChild(el);
        renderedWindows.set(win.instanceId, { el, cleanup, destroy: windowHandle.destroy });
      }
    }

    for (const [id, entry] of renderedWindows) {
      if (!windows.find(w => w.instanceId === id)) {
        entry.cleanup();
        entry.destroy();
        entry.el.remove();
        renderedWindows.delete(id);
      }
    }

    for (const win of windows) {
      const entry = renderedWindows.get(win.instanceId);
      if (!entry) continue;
      const el = entry.el;

      el.style.display = win.state === 'minimized' ? 'none' : '';
      el.style.zIndex = String(win.zIndex);
      el.classList.toggle('desktop-window--active', win.focused);
      el.style.setProperty('--win-x', `${win.bounds.x}px`);
      el.style.setProperty('--win-y', `${win.bounds.y}px`);
      el.style.setProperty('--win-w', `${win.bounds.w}px`);
      el.style.setProperty('--win-h', `${win.bounds.h}px`);

      /* [018A-77] El título de la barra se deriva del store (única fuente de
       * verdad). La navegación interna del Finder actualiza win.title y aquí
       * se sincroniza el DOM; antes se mutaba el DOM a mano y la taskbar
       * (fiel al store) quedaba desincronizada. */
      const titleEl = el.querySelector('.desktop-window__title');
      if (titleEl && titleEl.textContent !== win.title) titleEl.textContent = win.title;
    }
  });

  function setProfileVisible(visible: boolean): void {
    const win = windowStore.get().find(w => w.instanceId === profileInstanceId);
    if (!win) return;
    if (visible) {
      if (win.state === 'minimized') restoreWindow(profileInstanceId);
      focusWindow(profileInstanceId);
    } else {
      minimizeWindow(profileInstanceId);
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    /* [297A-29 F3] Liberar toggle del panel y suscripción de capacidad. */
    setProfileSettingsToggle(null);
    stopAuthSync();
    stopWindows();
    stopGlobalDrop();
    iconGrid.destroy();
    taskbar.destroy();
    menuBar.destroy();
    resizeObserver.disconnect();
    workspace.removeEventListener('contextmenu', onWorkspaceContextMenu);
    for (const entry of renderedWindows.values()) {
      entry.cleanup();
      entry.destroy();
      entry.el.remove();
    }
    renderedWindows.clear();
    contentWindowHandle.destroy();
    shell.remove();
  }

  return { element: shell, contentWindow, setProfileVisible, destroy };
}
