/* wandori.us — Mobile Launcher
 * Render y gestos del launcher; no coordina rutas ni stack de apps.
 * MobileShell solo conserva la presentación full-screen y el lifecycle global. */

import { Bell, Circle, FileUser, createElement, type IconNode } from 'lucide';
import { createEl } from '../../utils/dom';
import { createThemeToggleButton, type ThemeToggleButton } from '../../components/ui/theme-toggle-button';
import { openContextMenu } from '../desktop/components/desktop-context-menu';
import { bindLongPressDrag } from './mobile-gestures';
import { authStore } from '../../store';
import { createMobileAccountControl, type MobileAccountControl } from './mobile-account-control';
import { AppRegistry } from '../runtime/app-registry';
import { resolveResourceIcon } from '../runtime/resource-type-registry';
import { moveMobileNodesPosition, workspaceStore } from '../runtime/workspace/workspace-store';
import { getMobileCellAt, getMobileGridMetrics, planMobilePlacement, sortMobileNodes } from '../runtime/workspace/mobile-grid';
import type { ResolvedNode } from '../runtime/workspace/types';
import { resolvePublicResourceTarget } from '../runtime/workspace/public-resource-locator';
import { loadNotifications, notificationsStore, unreadNotificationCount } from '../notifications/notifications-store';
import { createNotificationsPopover } from '../notifications/notifications-popover';

export interface MobileLauncherOptions {
  readonly openApp: (appId: string, params?: Readonly<Record<string, string>>) => Promise<void>;
  readonly openProfile: () => Promise<void>;
  readonly onToggleExternalNav: () => void;
}

export interface MobileLauncher {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

function resolveNodeIcon(node: ResolvedNode): IconNode {
  if (node.id === 'profile' || node.refId === 'shell-profile') return FileUser;
  if (node.type === 'app' && node.refId) return AppRegistry.get(node.refId)?.icon ?? Circle;
  /* [018A-79] Carpetas y recursos usan el icono oficial del registro (fuente única),
   * no el icono de la app destino (product ya no hereda la carpeta de Galería). */
  if (node.type === 'folder') return resolveResourceIcon('folder');
  if (node.type === 'resource' && node.resourceKind) {
    return resolveResourceIcon(node.resourceKind);
  }
  return Circle;
}

function resolveNodeAction(
  node: ResolvedNode,
  openApp: MobileLauncherOptions['openApp'],
  openProfile: MobileLauncherOptions['openProfile'],
): (() => void) | undefined {
  if (node.id === 'profile' || node.refId === 'shell-profile') {
    return () => {
      void openProfile().catch(() => {
        /* El shell puede desmontarse durante el click; no reabrir vistas. */
      });
    };
  }
  if (node.type === 'folder') return () => { void openApp('finder', { folderId: node.id }); };
  if (node.type === 'resource' && node.resourceKind) {
    const publicTarget = resolvePublicResourceTarget(node);
    if (publicTarget) return () => { void openApp(publicTarget.appId, publicTarget.params); };
    /* [058A-3] Sin URL pública no se crea el botón: createIconButton devuelve
     * null para actions undefined y el recurso no aparece en el launcher. */
    return undefined;
  }
  if (node.refId && AppRegistry.get(node.refId)) return () => { void openApp(node.refId!); };
  return undefined;
}

function createIconButton(
  node: ResolvedNode,
  openApp: MobileLauncherOptions['openApp'],
  openProfile: MobileLauncherOptions['openProfile'],
): HTMLButtonElement | null {
  const action = resolveNodeAction(node, openApp, openProfile);
  if (!action) return null;

  const button = createEl('button', {
    type: 'button',
    className: 'movilLauncher__app',
    ariaLabel: `Abrir ${node.label}`,
    role: 'listitem',
  });
  const pictogram = createEl('span', { className: 'movilLauncher__pictograma', ariaHidden: 'true' });
  const icon = createElement(resolveNodeIcon(node));
  icon.classList.add('movilLauncher__icono');
  pictogram.appendChild(icon);
  button.append(
    pictogram,
    createEl('span', { className: 'movilLauncher__etiqueta', textContent: node.label }),
  );
  button.addEventListener('click', action);
  return button;
}

function resolveTargetKind(node: ResolvedNode): 'app' | 'folder' | 'resource' | 'shortcut' {
  if (node.type === 'app') return 'app';
  if (node.type === 'folder') return 'folder';
  if (node.type === 'resource') return 'resource';
  return 'shortcut';
}

function openLauncherMenu(node: ResolvedNode, event: { clientX: number; clientY: number }): void {
  openContextMenu({
    context: 'icon',
    targets: [{ id: node.refId ?? node.id, kind: resolveTargetKind(node) }],
    capability: authStore.get().capability,
    presentationMode: 'mobile',
    className: 'desktop-context-menu--mobile',
    x: event.clientX,
    y: event.clientY,
  });
}

export function createMobileLauncher(options: MobileLauncherOptions): MobileLauncher {
  const launcher = createEl('div', { className: 'movilLauncher' });
  const themeToggle: ThemeToggleButton = createThemeToggleButton('movilLauncher__tema');
  const accountControl: MobileAccountControl = createMobileAccountControl(() => {
    void options.openApp('account');
  });
  const notificationsButton = createEl('button', {
    type: 'button', className: 'movilLauncher__control', ariaLabel: 'Abrir novedades',
  }, createElement(Bell));
  const stopNotifications = notificationsStore.subscribeSimple((state) => {
    const count = unreadNotificationCount(state);
    notificationsButton.setAttribute('aria-label', count > 0 ? `Novedades (${count} sin leer)` : 'Abrir novedades');
    notificationsButton.toggleAttribute('data-hay-novedades', count > 0);
  });
  /* [028A-5] El launcher también abre el popover (no la ventana notifications). */
  const notificationsPopover = createNotificationsPopover(notificationsButton);
  notificationsButton.addEventListener('click', () => { notificationsPopover.toggle(); });
  void loadNotifications();
  const gestureCleanups: Array<() => void> = [];

  const header = createEl('header', { className: 'movilLauncher__cabecera' },
    createEl('span', { className: 'movilMarca', ariaHidden: 'true' }),
    createEl('p', { className: 'movilLauncher__fecha', textContent: 'inicio' }),
    createEl('span', { className: 'movilLauncher__acciones' }, accountControl.element, notificationsButton, themeToggle.element),
  );
  const grid = createEl('div', {
    className: 'movilLauncher__grid',
    role: 'list',
    ariaLabel: 'Aplicaciones del launcher',
  });
  const getColumns = (): number => window.innerWidth <= 480 ? 2 : 3;
  const nodes = sortMobileNodes(Object.values(workspaceStore.get().nodes)
    .filter((node) => node.parentId === 'desktop'), getColumns());

  for (const node of nodes) {
    const button = createIconButton(node, options.openApp, options.openProfile);
    if (!button) continue;
    grid.appendChild(button);

    let ghost: HTMLElement | null = null;
    let editing = false;
    const finishDrag = (): void => {
      button.classList.remove('movilLauncher__app--arrastrando');
      button.classList.remove('movilLauncher__app--editando');
      grid.classList.remove('movilLauncher__grid--editando');
      ghost?.remove();
      ghost = null;
      editing = false;
    };
    const gesture = bindLongPressDrag(button, {
      onLongPress: () => {
        editing = true;
        button.classList.add('movilLauncher__app--editando');
        grid.classList.add('movilLauncher__grid--editando');
      },
      onLongPressEnd: (event) => {
        if (editing) openLauncherMenu(node, event);
        finishDrag();
      },
      onDragStart: (event) => {
        button.classList.remove('movilLauncher__app--editando');
        button.classList.add('movilLauncher__app--arrastrando');
        ghost = button.cloneNode(true) as HTMLElement;
        ghost.classList.add('movilLauncher__app--ghost');
        ghost.style.position = 'fixed';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '10000';
        document.body.appendChild(ghost);
        const rect = button.getBoundingClientRect();
        ghost.style.left = `${event.clientX - rect.width / 2}px`;
        ghost.style.top = `${event.clientY - rect.height / 2}px`;
      },
      onDragMove: (event) => {
        if (!ghost) return;
        const rect = button.getBoundingClientRect();
        ghost.style.left = `${event.clientX - rect.width / 2}px`;
        ghost.style.top = `${event.clientY - rect.height / 2}px`;
      },
      onDragEnd: (event) => {
        const columns = getColumns();
        const metrics = getMobileGridMetrics(grid, columns);
        const cell = getMobileCellAt(event.clientX, event.clientY, metrics);
        if (cell) {
          const plan = planMobilePlacement(nodes, node.id, cell, columns);
          moveMobileNodesPosition(plan.moves);
        }
        finishDrag();
      },
    });
    gestureCleanups.push(() => {
      gesture.destroy();
      finishDrag();
    });
    button.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      openLauncherMenu(node, event);
    });
  }

  const navButton = createEl('button', {
    type: 'button',
    className: 'movilLauncher__app',
    ariaLabel: 'Mostrar navegación',
    role: 'listitem',
  },
    createEl('span', { className: 'movilLauncher__pictograma', ariaHidden: 'true' }, createElement(Circle)),
    createEl('span', { className: 'movilLauncher__etiqueta', textContent: 'Navegación' }),
  );
  navButton.addEventListener('click', options.onToggleExternalNav);
  navButton.classList.add('movilLauncher__navegacion');
  launcher.append(header, grid, navButton);

  return {
    element: launcher,
    destroy: (): void => {
      for (const cleanup of gestureCleanups.splice(0)) cleanup();
      themeToggle.destroy();
      stopNotifications();
      notificationsPopover.destroy();
      accountControl.destroy();
      launcher.remove();
    },
  };
}
