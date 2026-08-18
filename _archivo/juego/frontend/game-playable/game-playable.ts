/* GAME-01 — Vertical slice jugable con fallback offline.
 * Orquesta perfil, mapa, transporte realtime y renderer. El core sigue puro;
 * el socket se crea para cuentas e invitados temporales y siempre se libera
 * junto con la vista. SRP: este módulo es el shell (vista, hidratación y
 * settings); el bucle jugable vive en game-playable-runtime. */

import type { MountedView, RenderContext } from '../../../../core/lifecycle';
import { authStore } from '../../../../store';
import { ApiError } from '../../../../api/client';
import { GameCharacterService, GameProfileService } from '../../../../services';
import type { GameCharacterDefinition } from '../../../../api/types';
import { createEl } from '../../../../utils/dom';
import { resolvePlayableMap } from './game-map-source';
import { createGameSettingsPanel, type GameSettingsPanel } from './game-settings';
import { mountGamePlayableRuntime, type GamePlayableElements } from './game-playable-runtime';
import '../../../../styles/desktop/desktop-game-playable.css';

export type { GamePlayableElements } from './game-playable-runtime';

/* [297A-51] Clave de identidad de juego: solo cambia entre invitado y cuenta
 * (o entre cuentas distintas); ignora transiciones de capacidad del OS. */
function authIdentityKey(state: { isAuthenticated: boolean; userId: string | null }): string {
  return state.isAuthenticated ? `account:${state.userId ?? ''}` : 'guest';
}

export function createGamePlayableView(): GamePlayableElements {
  const sceneHost = createEl('div', {
    className: 'juegoFixture__escena',
    ariaLabel: 'Escena jugable offline del Bosque',
  });
  /* [GAME-01-VIS] El estado solo se muestra en errores; en juego normal la
   * vista queda limpia, sin texto superpuesto (las letras se retiraron el
   * 05-ago; el editor de personaje vive en el toolbar de la ventana). */
  const status = createEl('p', {
    className: 'juegoFixture__estado',
    textContent: 'cargando fixture offline…',
  });
  status.setAttribute('aria-live', 'polite');
  return {
    element: createEl('section', { className: 'juegoFixture', ariaLabel: 'Bosque, fixture jugable offline' }, sceneHost, status),
    sceneHost,
    status,
  };
}

/* [297A-49] El perfil se resuelve antes de montar WebGL/realtime. La vista
 * conserva un shell síncrono para que el runtime pueda cerrarla mientras la
 * petición está pendiente, y el AbortSignal evita recursos huérfanos. */
export function renderGamePlayable(context: RenderContext): MountedView {
  const view = createGamePlayableView();
  let disposed = false;
  let runtime: MountedView | null = null;
  let profileController: AbortController | null = null;
  let profileTimeout: number | null = null;
  let hydrationVersion = 0;
  /* [297A-51] La identidad se relee en cada hidratación: si la sesión cambia
   * mientras la app está abierta (login, logout o cambio de cuenta), el juego
   * se rehidrata y reconecta con la identidad correcta. */
  let accountSessionAtStart = authStore.get().isAuthenticated;
  /* [297A-63] Panel de configuración DENTRO de la ventana: la escena se
   * retira un momento y el panel con tabs la reemplaza; al volver, la
   * hidratación remonta el runtime. Se destruye el runtime real para liberar
   * WebGL/input/realtime mientras se administra el catálogo. */
  let settingsPanel: GameSettingsPanel | null = null;
  let gameChildren: HTMLElement[] = [];

  const closeSettingsPanel = (): void => {
    settingsPanel?.destroy();
    settingsPanel = null;
    for (const child of gameChildren) child.hidden = false;
    gameChildren = [];
    /* Volver al Bosque: rehidratar remonta el runtime (perfil + WebGL). */
    void hydrate();
  };

  const openSettingsPanel = (): void => {
    if (disposed || context.signal.aborted || settingsPanel) return;
    /* Retirar el juego: liberar el runtime y abortar cargas pendientes. */
    runtime?.destroy?.();
    runtime = null;
    if (profileTimeout !== null) window.clearTimeout(profileTimeout);
    profileTimeout = null;
    profileController?.abort();
    profileController = null;
    gameChildren = Array.from(view.element.children) as HTMLElement[];
    for (const child of gameChildren) child.hidden = true;
    const panel = createGameSettingsPanel({ onBack: closeSettingsPanel });
    settingsPanel = panel;
    view.element.appendChild(panel.element);
  };

  /* [297A-63] El comando game:settings del toolbar dispara este evento sobre
   * el content de la ventana enfocada (mismo patrón que finder:navigate). */
  const onGameSettingsEvent = (): void => openSettingsPanel();
  view.element.addEventListener('game:settings', onGameSettingsEvent);

  const setLoadingStatus = (message: string): void => {
    view.status.textContent = message;
    view.status.dataset.state = 'loading';
    view.status.hidden = false;
  };

  const hydrate = async (): Promise<void> => {
    if (context.signal.aborted || disposed) return;
    const version = ++hydrationVersion;
    accountSessionAtStart = authStore.get().isAuthenticated;
    setLoadingStatus('cargando perfil de juego…');
    const controller = new AbortController();
    profileController = controller;
    const abortProfile = (): void => controller.abort();
    profileTimeout = window.setTimeout(() => controller.abort(), 5_000);
    context.signal.addEventListener('abort', abortProfile, { once: true });

    let displayName = 'Jugador';
    let profileLoadWarning = false;
    let profileSessionExpired = false;
    let character: GameCharacterDefinition | null = null;
    let characters: GameCharacterDefinition[] = [];
    /* [297A-54] Revisión leída del perfil; el editor la usa como
     * expectedRevision y la actualiza al guardar. */
    let profileRevision = 0;

    try {
      try {
        characters = await GameCharacterService.list({ signal: profileController.signal });
      } catch (error: unknown) {
        if (version !== hydrationVersion || context.signal.aborted || disposed) return;
        profileLoadWarning = true;
        setLoadingStatus('catálogo no disponible · cierra y vuelve a abrir Bosque');
      }

      try {
        const profile = await GameProfileService.get({ signal: profileController.signal });
        if (version !== hydrationVersion) return;
        displayName = profile.displayName;
        profileRevision = profile.revision;
        character = characters.find(option => option.id === profile.characterId) ?? null;
      } catch (error: unknown) {
        if (version !== hydrationVersion || context.signal.aborted || disposed) return;
        /* 401 es el camino normal del invitado: usa la opción base del catálogo.
         * Una cuenta revocada no puede degradarse a identidad invitada. */
        if (error instanceof ApiError && error.status === 401 && accountSessionAtStart) {
          profileLoadWarning = true;
          profileSessionExpired = true;
          character = characters.find(option => option.id === 'forest-scout') ?? null;
          setLoadingStatus('sesión expirada · modo local');
        } else if (error instanceof ApiError && error.status === 401) {
          character = characters.find(option => option.id === 'forest-scout') ?? null;
        } else {
          profileLoadWarning = true;
          setLoadingStatus('perfil no disponible · modo local');
        }
      }

      if (version !== hydrationVersion) return;
      if (!character && !profileSessionExpired) {
        profileLoadWarning = true;
        setLoadingStatus('personaje no disponible · catálogo inválido');
      }
      if (!character) {
        /* No inventar una identidad visual si el catálogo no está disponible. */
        return;
      }

      if (version !== hydrationVersion || context.signal.aborted || disposed) return;
      /* [297A-65] El mapa jugable se resuelve ANTES de montar WebGL/realtime:
       * publicación activa si existe, fixture offline fail-closed si no. Al
       * volver al Bosque tras publicar (297A-64), la rehidratación resuelve
       * aquí la versión nueva y el circuito editar→publicar→jugar se cierra. */
      const mapResolution = await resolvePlayableMap({ signal: profileController.signal });
      if (version !== hydrationVersion || context.signal.aborted || disposed) return;
      try {
        runtime = mountGamePlayableRuntime(
          context,
          view,
          displayName,
          profileLoadWarning,
          profileSessionExpired,
          character,
          characters,
          profileRevision,
          mapResolution,
        );
      } catch (error: unknown) {
        if (context.signal.aborted || disposed) return;
        setLoadingStatus('este dispositivo no pudo iniciar Bosque');
        console.error('[Bosque fixture] No se pudo montar el runtime.', error);
      }
    } finally {
      if (profileTimeout !== null) window.clearTimeout(profileTimeout);
      profileTimeout = null;
      context.signal.removeEventListener('abort', abortProfile);
      if (profileController === controller) profileController = null;
    }
  };

  /* [297A-51] Rehidratación ante cambio de identidad. Se aborta cualquier
   * carga pendiente, se destruye el runtime anterior y se vuelve a hidratar
   * con la sesión actual; la versión evita que una hidratación vieja
   * sobrescriba el estado de la nueva. */
  const rehydrate = (): void => {
    if (disposed || context.signal.aborted) return;
    hydrationVersion += 1;
    profileController?.abort();
    profileController = null;
    if (profileTimeout !== null) window.clearTimeout(profileTimeout);
    profileTimeout = null;
    runtime?.destroy?.();
    runtime = null;
    void hydrate();
  };

  let lastAuthKey = authIdentityKey(authStore.get());
  const stopAuth = authStore.subscribe((state, source) => {
    if (source === 'init') return;
    const key = authIdentityKey(state);
    if (key === lastAuthKey) return;
    lastAuthKey = key;
    rehydrate();
  });

  void hydrate();

  return {
    element: view.element,
    destroy: () => {
      if (disposed) return;
      disposed = true;
      view.element.removeEventListener('game:settings', onGameSettingsEvent);
      settingsPanel?.destroy();
      settingsPanel = null;
      stopAuth();
      if (profileTimeout !== null) window.clearTimeout(profileTimeout);
      profileTimeout = null;
      profileController?.abort();
      runtime?.destroy?.();
      runtime = null;
    },
  };
}
