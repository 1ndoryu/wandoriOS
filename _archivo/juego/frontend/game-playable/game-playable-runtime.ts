/* GAME-01 — Runtime jugable del vertical slice (input, simulación, realtime
 * y renderer). Se monta desde renderGamePlayable una vez resuelto el perfil y
 * el mapa; su teardown libera WebGL/input/realtime junto con la vista. SRP:
 * este módulo es el bucle; el shell (perfil/hidratación) vive en
 * game-playable. */

import type { MountedView, RenderContext } from '../../../../core/lifecycle';
import { authStore } from '../../../../store';
import type { GameCharacterDefinition } from '../../../../api/types';
import {
  createWorldState,
  simulateTick,
  snapshotFromState,
  rotateInputToWorld,
  FramePerformanceMonitor,
  type WorldState,
} from '../../../game-core';
import { evaluateGamePerformanceBudget } from './game-performance-budget';
import { detectWebGL } from './game-webgl-capabilities';
import type { PlayableMapResolution } from './game-map-source';
import { createGameInput, type GameInputHandle } from './game-playable-input';
import { createGameRestartNotice } from './game-restart-notice';
import { mountGamePlayableScene, type GamePlayableSceneHandle } from './game-playable-scene';
import {
  createGameRealtimeClient,
  defaultGameSocketUrl,
  requestGameTicket,
  type GameRealtimeConnectionState,
} from './game-realtime-client';
import { openGameCharacterEditor } from './game-character-editor';

function normalizeRealtimeDirection(direction: { x: number; z: number }): { x: number; z: number } {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.z)) return { x: 0, z: 0 };
  const length = Math.hypot(direction.x, direction.z);
  if (length <= 1) return direction;
  return { x: direction.x / length, z: direction.z / length };
}

export interface GamePlayableElements {
  readonly element: HTMLElement;
  readonly sceneHost: HTMLElement;
  readonly status: HTMLElement;
}

export function mountGamePlayableRuntime(
  context: RenderContext,
  view: GamePlayableElements,
  displayName: string,
  profileLoadWarning: boolean,
  profileSessionExpired: boolean,
  character: GameCharacterDefinition | null,
  characters: GameCharacterDefinition[],
  profileRevision: number,
  mapResolution: PlayableMapResolution,
): MountedView {
  const setStatus = (message: string, error = false): void => {
    view.status.textContent = message;
    view.status.dataset.state = error ? 'error' : 'ready';
    view.status.hidden = !error;
  };
  /* La carga lazy puede resolver después de que WindowManager haya abortado la
   * vista. No montar listeners, observers ni WebGL si el scope ya terminó. */
  if (context.signal.aborted) {
    return { element: view.element, destroy: () => {} };
  }
  view.element.dataset.playerName = displayName;
  if (character) {
    view.element.dataset.characterId = character.id;
    view.element.dataset.characterTone = character.bodyTone;
  }
  /* [297A-54] Editor del jugador: abre el modal del OS con el catálogo activo
   * y, al guardar, aplica el perfil persistido en vivo (dataset + estado) sin
   * rehidratar la escena ni reconectar realtime. */
  /* [297A-54] El editor del jugador se abre desde el toolbar de la ventana
   * (comando game:character), no desde un texto flotante sobre la escena. */
  const onEditCharacter = (): void => {
    openGameCharacterEditor({
      characters,
      initial: {
        displayName,
        characterId: character?.id ?? 'forest-scout',
        revision: profileRevision,
      },
      isAuthenticated: authStore.get().isAuthenticated,
      onSaved: (profile) => {
        /* [297A-54] Si el runtime ya se destruyó (rehidratación por cambio de
         * identidad mientras el modal estaba abierto), no tocar su estado. */
        if (destroyed) return;
        displayName = profile.displayName;
        const nextCharacter = characters.find(option => option.id === profile.characterId) ?? character;
        character = nextCharacter;
        profileRevision = profile.revision;
        view.element.dataset.playerName = displayName;
        if (character) {
          view.element.dataset.characterId = character.id;
          view.element.dataset.characterTone = character.bodyTone;
        }
        setStatus(`${displayName} · perfil actualizado`, false);
      },
    });
  };
  const capabilities = detectWebGL();
  if (!capabilities.available) {
    setStatus(`3D no disponible: ${capabilities.reason ?? 'WebGL rechazado'}`, true);
    return { element: view.element, destroy: () => {} };
  }
  /* [297A-54] El listener del editor se registra tras el chequeo de WebGL para
   * que el return temprano no deje listeners colgados (teardown por camino). */
  view.element.addEventListener('game:character', onEditCharacter);
  view.element.dataset.webglKind = capabilities.kind ?? 'unknown';
  const input: GameInputHandle = createGameInput();
  view.element.appendChild(input.controls);

  /* [297A-65] El spawn local usa el primer spawn del mapa resuelto (publicado
   * o fixture), con respaldo determinista si el documento no lo tuviera. */
  const spawn = mapResolution.map.document.spawnPoints[0];
  const localSpawn = spawn
    ? { position: { x: spawn.position.x, z: spawn.position.z }, radius: spawn.radius }
    : { position: { x: 0, z: -0.5 }, radius: 0.38 };
  let scene: GamePlayableSceneHandle | null = null;
  /* [297A-77] El jugador local offline lleva su personaje del catálogo para
   * que la escena aplique el tono también en modo sin realtime. */
  let state: WorldState = createWorldState([{
    id: 'local',
    ...localSpawn,
    characterId: character?.id ?? 'forest-scout',
  }]);
  let sequence = 0;
  let frameHandle = 0;
  let lastTime = performance.now();
  let visible = !document.hidden;
  let contextLost = false;
  let destroyed = false;
  let lastNetworkMoveAt = 0;
  const frameMonitor = new FramePerformanceMonitor({ maxSamples: 120 });
  let frameCount = 0;
  let realtimeState: GameRealtimeConnectionState = 'idle';
  /* [Decisión 8] Aviso de reinicio coordinado: el banner se muestra al
   * recibir `server_restart` y se retira al reconectar (estado connected). */
  const restartNotice = createGameRestartNotice(view.element);
  /* La identidad de juego puede ser cuenta o invitado temporal. `authStore`
   * sigue gobernando permisos del OS; no debe bloquear el loop realtime público. */
  const realtime = createGameRealtimeClient({
    ticketProvider: requestGameTicket,
    socketFactory: (url) => new WebSocket(url),
    socketUrl: defaultGameSocketUrl(),
    onState: (next, message) => {
      realtimeState = next;
      if (next === 'connected') restartNotice.hide();
      if (next === 'error') setStatus(message ?? 'realtime no disponible', true);
    },
    onServerRestart: (payload) => {
      restartNotice.show({ reason: payload.reason, restartInSeconds: payload.restartInSeconds });
    },
  });

  const stopFrameLoop = (): void => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  const renderFrame = (now: number): void => {
    frameHandle = 0;
    if (destroyed || contextLost || !visible || !scene) return;

    const frameStart = performance.now();
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 0.1);
    lastTime = now;
    const direction = input.getDirection();
    /* [GAME-01-VIS] Teclas/pad relativos a la cámara: la intención se rota por
     * el azimuth orbital antes de simular o enviar (W siempre aleja la cámara,
     * como en Genshin). La simulación y el servidor siguen recibiendo X/Z de
     * mundo; solo el input cambia de marco. */
    const worldDirection = rotateInputToWorld(direction, scene.getCameraAzimuth());
    try {
      const networkSnapshot = realtime?.getState() === 'connected'
        ? realtime.getRenderSnapshot(now)
        : null;
      if (networkSnapshot) {
        if (now - lastNetworkMoveAt >= 66) {
          realtime?.sendMove(normalizeRealtimeDirection(worldDirection));
          lastNetworkMoveAt = now;
        }
        scene.update(networkSnapshot, realtime?.getPlayerId() ?? undefined);
      } else {
        state = simulateTick(
          state,
          mapResolution.map.world,
          [{ playerId: 'local', direction: worldDirection, sequence: sequence++ }],
          delta,
        );
        scene.update(snapshotFromState(state));
      }
      scene.render();
      frameMonitor.record(performance.now() - frameStart);
      frameCount += 1;
      const streaming = scene.streamingStats();
      const rendererMetrics = scene.rendererMetrics();
      const batchStats = scene.batchStats();
      const gpuFrameMs = scene.gpuFrameMs();
      const gpuMemory = scene.gpuMemoryEstimate();
      const performanceSnapshot = frameMonitor.snapshot();
      const performanceBudget = evaluateGamePerformanceBudget(performanceSnapshot, rendererMetrics);
      view.element.dataset.visibleChunks = String(streaming.visibleChunks);
      view.element.dataset.visibleInstances = String(streaming.visibleInstances);
      view.element.dataset.frameP95Ms = performanceSnapshot.p95Ms.toFixed(2);
      view.element.dataset.rendererDrawCalls = String(rendererMetrics.drawCalls);
      view.element.dataset.rendererTriangles = String(rendererMetrics.triangles);
      view.element.dataset.rendererGeometries = String(rendererMetrics.geometries);
      view.element.dataset.rendererTextures = String(rendererMetrics.textures);
      view.element.dataset.rendererBudgetStatus = performanceBudget.status;
      view.element.dataset.rendererBudgetFrameStatus = performanceBudget.frame.status;
      view.element.dataset.rendererBudgetHeapStatus = performanceBudget.jsHeapUsedBytes.status;
      view.element.dataset.batchDrawCalls = String(batchStats.drawCalls);
      view.element.dataset.batchSourceMeshes = String(batchStats.sourceMeshes);
      if (gpuFrameMs !== null) view.element.dataset.gpuFrameMs = gpuFrameMs.toFixed(2);
      view.element.dataset.gpuTextureBytes = String(gpuMemory.textureBytes);
      view.element.dataset.gpuGeometryBytes = String(gpuMemory.geometryBytes);
      const gpuIdentity = scene.gpuIdentity();
      if (gpuIdentity) {
        view.element.dataset.gpuVendor = gpuIdentity.vendor;
        view.element.dataset.gpuRenderer = gpuIdentity.renderer;
      }
      if (rendererMetrics.jsHeapUsedBytes !== undefined) {
        view.element.dataset.jsHeapUsedBytes = String(rendererMetrics.jsHeapUsedBytes);
      }
      if (rendererMetrics.jsHeapLimitBytes !== undefined) {
        view.element.dataset.jsHeapLimitBytes = String(rendererMetrics.jsHeapLimitBytes);
      }
      if (frameCount % 30 === 0 && realtimeState !== 'error' && !profileLoadWarning) {
        const mode = realtimeState === 'connected'
          ? `conectado${realtime?.getMapVersion() ? ` · ${realtime.getMapVersion()}` : ''}`
          : realtimeState === 'connecting'
            ? 'conectando… · fallback local'
            : realtimeState === 'reconnecting'
              ? 'reconectando… · fallback local'
              : 'offline · movimiento local';
        setStatus(
          `${displayName} · ${mode} · chunks ${streaming.visibleChunks} · props ${streaming.visibleInstances} · p95 ${performanceSnapshot.p95Ms.toFixed(1)}ms`,
          false,
        );
      }
    } catch (error: unknown) {
      stopFrameLoop();
      setStatus('no se pudo ejecutar el fixture offline', true);
      console.error('[Bosque fixture] Tick rechazado.', error);
      return;
    }
    frameHandle = requestAnimationFrame(renderFrame);
  };

  const startFrameLoop = (): void => {
    if (destroyed || contextLost || !visible || frameHandle !== 0) return;
    lastTime = performance.now();
    frameHandle = requestAnimationFrame(renderFrame);
  };

  const onVisibilityChange = (): void => {
    visible = !document.hidden;
    if (visible) startFrameLoop();
    else stopFrameLoop();
  };
  const onContextLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    stopFrameLoop();
    setStatus('el navegador perdió el contexto 3D; cierra y vuelve a abrir Bosque', true);
  };
  const onResize = (): void => scene?.resize();

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    stopFrameLoop();
    view.element.removeEventListener('game:character', onEditCharacter);
    context.signal.removeEventListener('abort', destroy);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    scene?.canvas.removeEventListener('webglcontextlost', onContextLost);
    resizeObserver.disconnect();
    input.destroy();
    restartNotice.destroy();
    realtime?.destroy();
    scene?.destroy();
    scene = null;
  };

  context.signal.addEventListener('abort', destroy, { once: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  /* El evento pertenece al canvas real de Three; no dependemos de bubbling. */
  const attachContextLossListener = (): void => {
    scene?.canvas.addEventListener('webglcontextlost', onContextLost, { once: true });
  };
  const resizeObserver = new ResizeObserver(onResize);

  try {
    scene = mountGamePlayableScene(view.sceneHost, mapResolution.map.world, mapResolution.map.document);
    attachContextLossListener();
    resizeObserver.observe(view.sceneHost);
    scene.update(snapshotFromState(state));
    setStatus(
      profileSessionExpired
        ? `${displayName} · sesión expirada · modo local`
        : profileLoadWarning
          ? `${displayName} · perfil no disponible · modo local`
          : mapResolution.warning
            ? `${displayName} · mapa no disponible · modo local (${mapResolution.map.label})`
            : authStore.get().isAuthenticated
              ? `${displayName} · ${mapResolution.map.label} · conectando… · fallback local mientras se autentica`
              : `${displayName} · ${mapResolution.map.label} · conectando… · fallback local mientras se identifica el invitado`,
      profileLoadWarning || mapResolution.warning,
    );
    if (!profileSessionExpired) void realtime?.connect();
    startFrameLoop();
  } catch (error: unknown) {
    setStatus('este dispositivo no pudo iniciar el fixture 3d', true);
    console.error('[Bosque fixture] No se pudo iniciar la escena.', error);
  }

  return { element: view.element, destroy };
}
