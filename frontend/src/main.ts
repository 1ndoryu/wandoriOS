/* wandori.us — Entry Point
 * Inicializa el router, estilos, layout y paginas. */

/* Estilos */
import './styles/variables.css';
import './styles/reset.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/pages.css';
import './styles/desktop/desktop-shell.css';
import './styles/desktop/desktop-menu.css';
import './styles/desktop/desktop-apps.css';
import './styles/desktop/desktop-window.css';
import './styles/desktop/desktop-responsive.css';
import './styles/desktop/desktop-context-menu.css';
import './styles/desktop/desktop-select.css';
import './styles/desktop/desktop-app-toolbar.css';
import './styles/desktop/desktop-trash.css';
import './styles/desktop/desktop-media-library.css';
import './styles/desktop/desktop-article-editor.css';
import './styles/desktop/desktop-properties.css';
import './styles/mobile/mobile-prototype.css';

/* Core */
import {addRoute, setOutlet, initRouter, refreshRoute} from './router';
import {createSidebar} from './components/layout/sidebar';
import {createProfile} from './components/layout/profile';
import {createDesktopShell} from './features/desktop/desktop-shell';
import {createMobileShell} from './features/mobile/mobile-shell';
import './features/runtime/app-registration';
import './features/runtime/commands';
import {initKeyboardShortcuts} from './features/runtime/commands';
import {CommandRegistry} from './features/runtime/command-registry';
import {initRouteAppAdapter, setMobileOpenHandler, openAppWindow} from './features/runtime/route-app-adapter';
import {initWindowUrlSync} from './features/runtime/window-url-sync';
import {initWindowSessionPersistence} from './features/runtime/window-session';
import {restoreWindowSession} from './features/runtime/window-session-restore';
import {AppRegistry} from './features/runtime/app-registry';
import {initResourceTypeRegistry} from './features/runtime/resource-type-registry';
import {setActorCategory} from './features/analytics/dispatcher';
import {loadProfileSettings} from './features/settings/settings-repo';
import {initTracking, trackPageView} from './features/analytics/tracker';
import {initPageMeta} from './features/seo/page-meta';
import {createAnalyticsConsentBanner} from './features/analytics/consent-banner';
import {initThemeStore} from './features/runtime/theme-store';
import {initPreferencesSync} from './features/runtime/preferences-sync';
import {initAppearanceSync} from './features/runtime/appearance-sync';
import {authStore, showProfile, showSidebar, siteConfig} from './store';
import {AuthService} from './services';
import {fetchWorkspaceRelease} from './features/runtime/workspace/workspace-store';
import {initOverlaySync} from './features/runtime/workspace/overlay-sync';
import {initArticleNotasSync} from './features/runtime/workspace/article-notas-sync';
import {createAccountView} from './features/runtime/account-view';
import {getTopMobileApp} from './features/mobile/mobile-stack';
import {closeAllWindows, windowStore} from './features/runtime/window-manager';
import {createEl} from './utils/dom';
import {getPresentationMode} from './utils/viewport';
import {captureTransientState, discardTransientState, restoreTransientState, clearTransientState, type TransientStateKey} from './features/runtime/transient-state';

/* Pages */
import {renderHome} from './pages/home';
import {renderArticle} from './pages/article';
import {renderAbout} from './pages/about';
import {renderGallery} from './pages/gallery';
import {renderProjects} from './pages/projects';
import {renderCheckoutSuccess, renderCheckoutCancel} from './pages/checkout';
import {renderVerifyEmail} from './pages/verify-email';

/* === Registrar rutas === */
addRoute({path: '/', render: () => renderHome()});
addRoute({path: '/article/:slug', render: params => renderArticle(params)});
addRoute({path: '/about', render: () => renderAbout()});
addRoute({path: '/gallery', render: () => renderGallery()});
addRoute({path: '/projects', render: () => renderProjects()});
/* `/login` es el deep link canónico de Cuenta; si el adapter aún no está
 * montado, el router conserva el mismo contenido como fallback. */
addRoute({path: '/login', render: (_params, ctx) => createAccountView(ctx)});
/* [297A-13] Destino del enlace de verificación por correo (token de un solo uso). */
addRoute({path: '/verify-email', render: (_params, ctx) => renderVerifyEmail(ctx)});
addRoute({path: '/checkout/success', render: () => renderCheckoutSuccess()});
addRoute({path: '/checkout/cancel', render: () => renderCheckoutCancel()});

/* === Inicializar aplicacion === */
async function initApp(): Promise<void> {
    /* [297A-18] Aplicar tema persistido y escuchar al SO antes de renderizar
     * (el anti-flash de index.html ya puso data-tema en la primera pintura). */
    initThemeStore();
    const stopPreferencesSync = initPreferencesSync();
    const stopAppearanceSync = initAppearanceSync();
    const stopOverlaySync = initOverlaySync();
    /* [018A-76] Puente artículo → escritorio: al publicar, garantiza la carpeta
     * real "Notas" y coloca el artículo dentro. Idempotente. */
    const stopArticleNotasSync = initArticleNotasSync();
    const app = document.getElementById('app');
    if (!app) return;
    let isMobile = getPresentationMode() === 'mobile';

    /* [297A-11] Cargar primero el release del workspace desde el backend.
     * El overlay remoto se rebasa contra este árbol; AuthService.me() cambia
     * authStore y puede iniciar el sync, así que el orden evita usar DEFAULT_RELEASE
     * por una carrera de red durante el arranque. */
    await fetchWorkspaceRelease();

    /* [297A-8] Verificar sesión existente al arrancar.
     * Las cookies HttpOnly se envían automáticamente con credentials: 'include'.
     * Si /auth/me responde con usuario válido, marcamos como autenticado. */
    try {
        const auth = await AuthService.me();
        setActorCategory(auth.capability === 'public' ? 'anonymous' : auth.capability);
    } catch {
        /* No hay sesión válida — permanecer como invitado */
        authStore.set({isAuthenticated: false, userId: null, capability: 'public'});
        setActorCategory('anonymous');
    }

    /* Cargar settings de perfil/redes antes de renderizar */
    await loadProfileSettings();

    /* Limpiar */
    app.innerHTML = '';

    /* Sidebar — menu + entradas */
    const sidebar = createSidebar();
    app.appendChild(sidebar);

    /* [297A-12] El concepto móvil arranca en launcher. La preferencia definitiva
     * y la transición entre modos pertenecen a MobileAppStack, tras aprobación. */
    if (isMobile) showSidebar.set(false, 'init');

    /* [Plan §2.2] navigation.toggleExternalNav: toggle sidebar */
    showSidebar.subscribe(visible => {
        sidebar.style.display = visible ? '' : 'none';
        app.style.gridTemplateColumns = visible ? '' : '1fr';
    });

    /* Columna derecha: superficie exclusiva del escritorio */
    const columnaDerecha = createEl('div', {className: 'columna-derecha'});

    /* Registrar asociaciones antes de pintar el launcher: el primer render ya
     * debe resolver iconos y apps de recursos sin depender del orden de listeners. */
    initResourceTypeRegistry();

    /* Perfil y outlet conservan sus contratos; el shell solo cambia su presentación. */
    const profile = createProfile();
    const contenido = createEl('main', {className: 'contenido-principal'});

    let desktop: ReturnType<typeof createDesktopShell> | null = null;
    let mobile: ReturnType<typeof createMobileShell> | null = null;
    let stopKeyboard: (() => void) | undefined;

    function mountPresentation(mobileMode: boolean): void {
        isMobile = mobileMode;
        if (mobileMode) {
            mobile = createMobileShell(profile, () => {
                void CommandRegistry.execute('navigation:toggle-external-nav');
            });
            columnaDerecha.appendChild(mobile.element);
        } else {
            desktop = createDesktopShell(profile, contenido);
            columnaDerecha.appendChild(desktop.element);
            stopKeyboard = initKeyboardShortcuts();
        }
        setOutlet(mobile?.routerOutlet ?? contenido);
        setMobileOpenHandler(mobile?.openApp ?? null);
    }

    function unmountPresentation(): void {
        setMobileOpenHandler(null);
        stopKeyboard?.();
        stopKeyboard = undefined;
        if (desktop) {
            closeAllWindows();
            desktop.destroy();
            desktop = null;
        }
        if (mobile) {
            mobile.destroy();
            mobile = null;
        }
    }

    mountPresentation(isMobile);

    app.appendChild(columnaDerecha);

    /* [018A-12] El consentimiento es una superficie global, no una app. La
     * decisión se toma antes de permitir que tracker.ts envíe métricas. */
    const analyticsConsentBanner = createAnalyticsConsentBanner();
    columnaDerecha.appendChild(analyticsConsentBanner.element);

    /* [Plan §9.1] Actualizar actor category al cambiar auth durante la sesión */
    authStore.subscribe(state => {
        setActorCategory(state.capability === 'public' ? 'anonymous' : state.capability);
    });

    /* Control de visibilidad del profile:
     * Se oculta cuando se esta viendo un articulo.
     * Usa setProfileVisible para mantener taskbar sincronizado. */
    showProfile.subscribe(visible => {
        desktop?.setProfileVisible(visible);
        /* Cuando no hay profile, centrar el contenido */
        if (visible) {
            columnaDerecha.classList.remove('columna-derecha--sin-profile');
        } else {
            columnaDerecha.classList.add('columna-derecha--sin-profile');
        }
    });

    /* Control de visibilidad del contenido principal (legacy outlet):
     * Se oculta cuando la ruta es manejada por una app del runtime (ventana propia),
     * o en home cuando las entradas están desactivadas. */
    function updateContenidoVisibility(): void {
        const path = window.location.pathname;
        if (!desktop) {
            const isAppRoute = !!AppRegistry.findByRoute(path);
            mobile?.setLegacyContentVisible(path !== '/' && !isAppRoute);
            return;
        }
        const isHome = path === '/';
        const showEntries = siteConfig.get().showEntriesOnHome;
        const isAppRoute = !!AppRegistry.findByRoute(path);
        desktop.contentWindow.style.display = isAppRoute || (isHome && !showEntries) ? 'none' : '';
    }
    siteConfig.subscribe(() => updateContenidoVisibility());
    updateContenidoVisibility();
    import('./router').then(({onNavigate}) => {
        onNavigate(path => {
            trackPageView(path);
            updateContenidoVisibility();
        });
    });

    /* Tracking de page views — cleanup almacenado para posible teardown */
    const stopTracking = initTracking();

    /* [297A-17] Meta por ruta pública (login, verify-email, escritorio, 404).
     * Se registra antes de initRouter para cubrir la primera navegación. */
    const stopPageMeta = initPageMeta();

    /* Registrar primero el destino móvil y después el interceptor: una navegación
     * inicial nunca puede caer accidentalmente en una ventana desktop. */
    const stopMobileAdapter = (): void => {
        setMobileOpenHandler(null);
    };
    /* [317A-5] restoreWindowSession corre antes de initRouter para evitar
     * duplicados de deep-link. En la primera ruta `/`, el escritorio restaurado
     * es la presentación válida y no debe ser limpiado por la reconciliación. */
    const stopRouteAdapter = initRouteAppAdapter({preserveRootOnInit: true});
    const stopWindowUrlSync = initWindowUrlSync();

    /* [317A-5] Persistir la sesión de ventanas y restaurarla ANTES de que el
     * router resuelva la URL: la app enfocada ya estará abierta y el interceptor
     * la enfocará sin duplicar; el resto de ventanas recupera geometría/estado. */
    const stopWindowSession = initWindowSessionPersistence();
    await restoreWindowSession();

    /* Iniciar router — cleanup almacenado */
    const stopRouter = initRouter();

    /* La URL conserva la app/recurso; al cambiar de breakpoint se reinstancia
     * en el shell nuevo en lugar de transferir MountedView entre stores.
     * [297A-12] El launcher móvil vive solo en ≤480px; tablet (481–1023)
     * conserva el escritorio, así que el límite del matchMedia es 480. */
    const mediaQuery = window.matchMedia('(max-width: 480px)');
    let transitionRequest = 0;
    let transitionQueue: Promise<void> = Promise.resolve();
    const onPresentationChange = (event: MediaQueryListEvent): void => {
        const requestId = ++transitionRequest;
        transitionQueue = transitionQueue
            .then(async () => {
                if (requestId !== transitionRequest || event.matches === isMobile) {
                    /* Si esta era la transición vigente pero ya no requiere cambiar de
                     * presentación, libera cualquier pausa dejada por una transición
                     * anterior obsoleta. */
                    if (requestId === transitionRequest) stopWindowUrlSync.resume();
                    return;
                }

                const currentPath = window.location.pathname;
                const focusedWindow = windowStore.get().find(win => win.focused);
                const activeMobile = getTopMobileApp();
                /* Perfil solo es la presentación inicial del OS; una ruta legacy activa
                 * debe conservar su outlet aunque Perfil haya quedado enfocado en desktop. */
                const activeProfile = currentPath === '/' && (focusedWindow?.instanceId === 'shell-profile' || activeMobile?.appId === 'profile');
                /* Perfil pertenece al chrome del shell, no al catálogo de apps. Nunca
                 * debe convertir una ruta legacy en una transición de app runtime. */
                const activeRuntimeWindow = focusedWindow?.instanceId === 'shell-profile' ? undefined : focusedWindow;
                const activeRuntimeMobile = activeMobile?.appId === 'profile' ? undefined : activeMobile;
                const activeAppId = activeRuntimeWindow?.appId ?? activeRuntimeMobile?.appId;
                const activeParams = activeRuntimeWindow?.params ?? activeRuntimeMobile?.params;
                const transientKey: TransientStateKey = activeAppId ? {appId: activeAppId, params: activeParams ? {...activeParams} : undefined} : {appId: `legacy:${currentPath}`};
                const transientRoot = activeAppId ? (focusedWindow?.content ?? activeMobile?.view.element) : (desktop?.contentWindow ?? mobile?.routerOutlet);
                if (transientRoot) captureTransientState(transientRoot, transientKey);

                /* [317A-5] Pausar la persistencia de sesión durante la transición:
                 * unmountPresentation llama a closeAllWindows y NO debe persistir un
                 * escritorio vacío que sobrescribiría la sesión previa. */
                stopWindowSession.pause();
                stopWindowUrlSync.pause();
                try {
                    unmountPresentation();
                    mountPresentation(event.matches);
                    await refreshRoute();

                    if (requestId !== transitionRequest) {
                        discardTransientState(transientKey);
                        return;
                    }
                    /* [317A-5] Al volver a una presentación, restaurar la sesión completa
                     * (ventanas desktop o stack móvil que había antes de cambiar). La app
                     * activa ya estaba en la sesión y openAppWindow/restore la enfocan
                     * sin duplicar; lo visible queda igual a lo que restauraría una recarga. */
                    await restoreWindowSession();
                    if (requestId !== transitionRequest) {
                        discardTransientState(transientKey);
                        return;
                    }
                    if (activeProfile && event.matches && mobile) {
                        await mobile.openProfile();
                    } else if (activeAppId && activeAppId !== 'profile' && !AppRegistry.findByRoute(currentPath)) {
                        await openAppWindow(activeAppId, activeParams ? {...activeParams} : undefined, {history: 'none'});
                    }

                    if (requestId !== transitionRequest) {
                        discardTransientState(transientKey);
                        return;
                    }

                    if (transientKey) {
                        const restoredWindow = activeProfile ? windowStore.get().find(win => win.instanceId === 'shell-profile') : windowStore.get().find(win => win.focused && win.appId === activeAppId);
                        const restoredMobile = getTopMobileApp();
                        const restoredRoot = activeAppId ? (restoredWindow?.content ?? restoredMobile?.view.element) : (desktop?.contentWindow ?? mobile?.routerOutlet);
                        if (restoredRoot) restoreTransientState(restoredRoot, transientKey);
                    }
                } catch (error) {
                    discardTransientState(transientKey);
                    throw error;
                } finally {
                    /* Una transición obsoleta no puede reactivar el sincronizador mientras
                     * otra más reciente sigue en cola; así nunca se proyecta '/' de forma
                     * transitoria sobre una deep link válida. */
                    if (requestId === transitionRequest) {
                        stopWindowUrlSync.resume();
                        stopWindowSession.resume();
                    }
                }
            })
            .catch((error: unknown) => {
                /* La transición no debe romper futuros cambios; deja diagnóstico sin
                 * serializar contenido de formularios ni detalles potencialmente sensibles. */
                console.warn('[presentation] transición cancelada:', error instanceof Error ? error.message : 'error desconocido');
            });
    };
    mediaQuery.addEventListener('change', onPresentationChange);

    /* Exponer un único teardown idempotente para integraciones/hot reload.
     * El orden libera primero eventos globales y termina desmontando la presentación. */
    let cleanedUp = false;
    const cleanup = (): void => {
        if (cleanedUp) return;
        cleanedUp = true;
        mediaQuery.removeEventListener('change', onPresentationChange);
        stopTracking();
        stopPageMeta();
        stopPreferencesSync();
        stopAppearanceSync();
        stopOverlaySync();
        stopArticleNotasSync();
        stopRouter();
        stopRouteAdapter();
        stopWindowUrlSync.stop();
        stopWindowSession.stop();
        stopMobileAdapter();
        clearTransientState();
        unmountPresentation();
        analyticsConsentBanner.destroy();
    };
    (window as unknown as Record<string, unknown>).__wandoriusCleanup = cleanup;
}

/* Arrancar cuando el DOM este listo */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
