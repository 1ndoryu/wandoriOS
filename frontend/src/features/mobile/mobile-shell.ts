/* wandori.us — Mobile Shell
 * Presentación móvil del mismo runtime del OS: launcher + vista full-screen.
 * Las apps entregan el mismo MountedView que desktop; este módulo coordina
 * navegación, stack y lifecycle. [297A-12 §2–4] */

import { createEl } from '../../utils/dom';
import { getCurrentPathname } from '../../utils/viewport';
import { getCanonicalAppPath, type AppOpenHistory } from '../runtime/deep-links';
import { AppRegistry } from '../runtime/app-registry';
import { createAppHeader, createNavigation } from './mobile-chrome';
import { isInternalPushHistoryEntry, navigate, replacePath } from '../../router';
import type { MountedView } from '../../core/lifecycle';
import { workspaceStore } from '../runtime/workspace/workspace-store';
import {
  clearMobileStack,
  getTopMobileApp,
  mobileStackStore,
  openMobileApp,
  openMobileView,
  popMobileApp,
  type MobileStackEntry,
} from './mobile-stack';
import { createMobileLauncher, type MobileLauncher } from './mobile-launcher';

export interface MobileShell {
  readonly element: HTMLElement;
  readonly routerOutlet: HTMLElement;
  readonly setLegacyContentVisible: (visible: boolean) => void;
  readonly destroy: () => void;
  readonly openApp: (appId: string, params?: Readonly<Record<string, string>>, options?: { history?: AppOpenHistory }) => Promise<void>;
  readonly openProfile: () => Promise<void>;
  readonly goHome: () => void;
  readonly goBack: () => void;
}

export function createMobileShell(
  profile: HTMLElement,
  onToggleExternalNav: () => void,
): MobileShell {
  const shell = createEl('section', { className: 'movilOs', ariaLabel: 'Sistema móvil' });
  const viewport = createEl('div', { className: 'movilOs__viewport' });
  const routerOutlet = createEl('main', {
    className: 'movilOs__routerOutlet',
    ariaHidden: 'true',
  });
  let currentView: HTMLElement | null = null;
  let launcher: MobileLauncher | null = null;
  let legacyContentVisible = false;
  let destroyed = false;
  const pendingControllers = new Set<AbortController>();

  const openApp = async (
    appId: string,
    params?: Readonly<Record<string, string>>,
    options: { history?: AppOpenHistory } = {},
  ): Promise<void> => {
    if (destroyed) return;
    await openMobileApp(appId, params, options);
  };

  const openProfile = async (): Promise<void> => {
    if (destroyed) return;
    const controller = new AbortController();
    pendingControllers.add(controller);
    const view: MountedView = { element: profile };
    try {
      await openMobileView('profile', 'Perfil', view, undefined, true, 'full-bleed', controller);
    } finally {
      pendingControllers.delete(controller);
    }
  };

  const clearLauncherResources = (): void => {
    launcher?.destroy();
    launcher = null;
  };

  const renderLauncher = (): HTMLElement => {
    clearLauncherResources();
    launcher = createMobileLauncher({
      openApp: (appId, params) => openApp(appId, params),
      openProfile,
      onToggleExternalNav,
    });
    return launcher.element;
  };

  const renderCurrent = (entry: MobileStackEntry | undefined): void => {
    if (entry || legacyContentVisible) clearLauncherResources();
    if (currentView) currentView.remove();
    if (entry) {
      routerOutlet.style.display = 'none';
      const contentClass = entry.layout === 'full-bleed'
        ? 'movilApp__contenido movilApp__contenido--fullBleed'
        : 'movilApp__contenido';
      const app = createEl('div', { className: 'movilApp' },
        createAppHeader(entry.title),
        createEl('div', { className: contentClass }, entry.view.element),
      );
      /* [018A-1 F1] La franja de acciones es el mismo slot que desktop: la
       * app la aporta en MountedView.actions y ambas presentaciones la
       * colocan como barra inferior fija (fuera del scroll del contenido),
       * sin duplicar lógica por plataforma. Si la app no aporta actions,
       * no hay tercera fila. */
      if (entry.view.actions) app.appendChild(entry.view.actions);
      currentView = app;
      viewport.prepend(app);
    } else if (legacyContentVisible) {
      routerOutlet.style.display = 'block';
      currentView = routerOutlet;
      viewport.prepend(routerOutlet);
    } else {
      routerOutlet.style.display = 'none';
      currentView = renderLauncher();
      viewport.prepend(currentView);
    }
    const navigation = viewport.querySelector('.movilNavegacion');
    navigation?.remove();
    viewport.appendChild(createNavigation(Boolean(entry), goBack, goHome));
    routerOutlet.setAttribute('aria-hidden', entry || !legacyContentVisible ? 'true' : 'false');
  };

  function syncPathToTopMobileApp(): void {
    const top = getTopMobileApp();
    const app = top ? AppRegistry.get(top.appId) : undefined;
    const targetPath = app ? getCanonicalAppPath(app, top?.params) ?? '/' : '/';
    if (getCurrentPathname() !== targetPath) replacePath(targetPath);
  }

  function goBack(): void {
    if (destroyed) return;
    const entry = getTopMobileApp();
    if (!entry) return;
    const app = AppRegistry.get(entry.appId);
    const canonicalPath = app ? getCanonicalAppPath(app, entry.params) : null;
    const ownsCurrentHistoryEntry = Boolean(
      canonicalPath
      && canonicalPath === getCurrentPathname()
      && isInternalPushHistoryEntry(),
    );
    if (ownsCurrentHistoryEntry) {
      popMobileApp({ preserveHistoryUrl: true });
      history.back();
    } else {
      popMobileApp();
      syncPathToTopMobileApp();
    }
  }

  function goHome(): void {
    if (destroyed) return;
    clearMobileStack();
    if (getCurrentPathname() !== '/') navigate('/');
  }

  const stopStack = mobileStackStore.subscribe((stack) => renderCurrent(stack.at(-1)));
  const stopWorkspace = workspaceStore.subscribe(() => {
    if (!getTopMobileApp() && !legacyContentVisible) renderCurrent(undefined);
  });

  function setLegacyContentVisible(visible: boolean): void {
    if (destroyed) return;
    legacyContentVisible = visible;
    if (!getTopMobileApp()) renderCurrent(undefined);
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    stopStack();
    stopWorkspace();
    clearLauncherResources();
    for (const controller of pendingControllers) controller.abort();
    pendingControllers.clear();
    clearMobileStack();
    currentView?.remove();
    currentView = null;
  }

  shell.append(viewport);
  return { element: shell, routerOutlet, setLegacyContentVisible, destroy, openApp, openProfile, goHome, goBack };
}
