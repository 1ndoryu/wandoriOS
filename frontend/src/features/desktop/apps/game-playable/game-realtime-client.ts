/* GAME-01 — Adaptador de transporte realtime del Bosque.
 * Este módulo conoce HTTP/WebSocket, pero no DOM, Three.js ni el shell. El core
 * recibe snapshots puros y el consumidor decide cómo presentarlos. */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../../../../api/client';
import {
  interpolateSnapshots,
  validateGameRealtimeServerMessage,
  type GameRealtimeServerMessage,
  type GameRealtimeServerRestartPayload,
  type GameRealtimeSnapshotPayload,
  type Vector2,
  type WorldSnapshot,
} from '../../../game-core';

const CLIENT_VERSION = 'game-01';
const HEARTBEAT_MS = 1_000;
const MOVE_SEQUENCE_START = 0;
/* [297A-57] Reconexión persistente con backoff exponencial (1s → 2s → 4s …,
 * tope 30s) y jitter para no sincronizar reintentos entre clientes. */
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const RECONNECT_JITTER_MS = 200;
/* [297A-57] El servidor cierra con este código cuando la misma identidad
 * abrió una conexión nueva (reemplazo): el cliente NO debe reintentar para
 * evitar el ping-pong entre pestañas/dispositivos del mismo usuario. */
const GAME_WS_REPLACED_CLOSE_CODE = 4001;
/* [Decisión 8] El servidor cierra con este código tras el drenaje coordinado
 * de la migración: el mundo se reinició y el cliente SÍ debe reintentar (el
 * backoff recarga la versión nueva). */
const GAME_WS_RESTART_CLOSE_CODE = 4002;

export type GameRealtimeConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error' | 'closed';

export interface GameRealtimeTicketResponse {
  readonly ticket: string;
}

export interface GameRealtimeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface GameRealtimeClientOptions {
  readonly ticketProvider: () => Promise<string>;
  readonly socketFactory: (url: string) => GameRealtimeSocket;
  readonly socketUrl: string;
  readonly onState?: (state: GameRealtimeConnectionState, message?: string) => void;
  /* [Decisión 8] Aviso de reinicio coordinado (05-ago): el servidor anuncia
   * la cuenta atrás de la migración del mundo. El consumidor decide cómo
   * presentarlo (banner/estado); mientras no haya UX, el evento es seguro
   * de ignorar: no afecta la simulación ni la conexión. */
  readonly onServerRestart?: (payload: GameRealtimeServerRestartPayload) => void;
}

export interface GameRealtimeClientHandle {
  readonly connect: () => Promise<void>;
  readonly sendMove: (direction: Vector2) => void;
  readonly getRenderSnapshot: (nowMs?: number) => WorldSnapshot | null;
  readonly getPlayerId: () => string | null;
  readonly getMapVersion: () => string | null;
  readonly getState: () => GameRealtimeConnectionState;
  readonly destroy: () => void;
}

export async function requestGameTicket(): Promise<string> {
  const response = await generatedFetcher<GeneratedResponse<GameRealtimeTicketResponse>>(
    '/api/game/ticket',
    { method: 'POST' },
  );
  return unwrapGeneratedResponse<GameRealtimeTicketResponse>(response, [200]).ticket;
}

export function createGameRealtimeClient(
  options: GameRealtimeClientOptions,
): GameRealtimeClientHandle {
  let socket: GameRealtimeSocket | null = null;
  let state: GameRealtimeConnectionState = 'idle';
  let destroyed = false;
  let playerId: string | null = null;
  let mapVersion: string | null = null;
  let sequence = MOVE_SEQUENCE_START;
  let lastSnapshotSequence: number | null = null;
  let previousSnapshot: WorldSnapshot | null = null;
  let currentSnapshot: WorldSnapshot | null = null;
  let previousSnapshotAt = 0;
  let currentSnapshotAt = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  /* [297A-57] Fallo deliberado (protocolo, servidor fatal o reemplazo de
   * identidad): NO se reintenta. Los errores transitorios del transporte
   * (evento `error` del socket) no lo marcan; el `close` que les sigue
   * programa la reconexión. Sin esto, una caída de red real (error → close
   * 1006 en navegadores) nunca volvería a conectar. */
  let fatal = false;

  const notify = (next: GameRealtimeConnectionState, message?: string): void => {
    state = next;
    options.onState?.(next, message);
  };

  const fail = (message: string, code: number, reason: string): void => {
    fatal = true;
    notify('error', message);
    closeSocket(code, reason);
  };

  const clearHeartbeat = (): void => {
    if (heartbeatTimer === null) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  };

  /* [297A-57] Cancela cualquier reintento pendiente y reinicia el backoff
   * (se invoca al conectar con éxito y al destruir la vista). */
  const clearReconnect = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectAttempt = 0;
  };

  const scheduleReconnect = (): void => {
    if (destroyed) return;
    reconnectAttempt += 1;
    const exponential = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempt - 1),
      RECONNECT_MAX_DELAY_MS,
    );
    const delay = exponential + Math.floor(Math.random() * RECONNECT_JITTER_MS);
    notify('reconnecting');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, delay);
  };

  const closeSocket = (code = 1000, reason = 'cliente cerrado'): void => {
    clearHeartbeat();
    if (!socket) return;
    socket.close(code, reason);
    socket = null;
  };

  const send = (message: Record<string, unknown>): boolean => {
    if (destroyed || !socket || state !== 'connected') return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch {
      options.onState?.(state, 'no se pudo enviar el mensaje realtime');
      return false;
    }
  };

  const updateSnapshot = (payload: GameRealtimeSnapshotPayload): void => {
    const next: WorldSnapshot = {
      tick: payload.tick,
      entities: payload.entities.map(entity => ({ ...entity })),
    };
    const now = Date.now();
    previousSnapshot = currentSnapshot;
    previousSnapshotAt = currentSnapshotAt;
    currentSnapshot = next;
    currentSnapshotAt = now;
    lastSnapshotSequence = payload.snapshotSequence;
  };

  const handleMessage = (event: Event): void => {
    const data = (event as MessageEvent<unknown>).data;
    if (typeof data !== 'string') {
      fail('mensaje realtime no textual', 1003, 'mensaje no textual');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      fail('JSON realtime inválido', 1007, 'JSON inválido');
      return;
    }
    const result = validateGameRealtimeServerMessage(parsed);
    if (!result.ok) {
      fail(result.error, 1007, 'mensaje inválido');
      return;
    }
    const message: GameRealtimeServerMessage = result.value;
    if (message.type === 'joined') {
      playerId = message.payload.playerId;
      mapVersion = message.payload.mapVersion;
      /* [297A-77] Nueva sesión: el contador de snapshot y los snapshots
       * previos pertenecen al actor anterior, cuyo contador puede reiniciarse
       * (sala recreada por TTL) o saltar. Sin este reset, el primer snapshot
       * de la sala nueva se descartaría por parecer "replay" y la escena se
       * quedaría interpolando posiciones de otra sala. */
      lastSnapshotSequence = null;
      previousSnapshot = null;
      currentSnapshot = null;
      previousSnapshotAt = 0;
      currentSnapshotAt = 0;
      clearReconnect();
      notify('connected');
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        send({
          v: 1,
          type: 'heartbeat',
          payload: { lastSnapshotSequence: lastSnapshotSequence ?? 0 },
        });
      }, HEARTBEAT_MS);
      return;
    }
    if (message.type === 'snapshot') {
      if (lastSnapshotSequence !== null && message.payload.snapshotSequence <= lastSnapshotSequence) return;
      updateSnapshot(message.payload);
      return;
    }
    if (message.type === 'server_restart') {
      options.onServerRestart?.(message.payload);
      return;
    }
    if (message.type === 'error') {
      if (message.payload.fatal) {
        fail(message.payload.message, 1008, message.payload.code);
      } else if (state === 'connected') {
        options.onState?.('connected', message.payload.message);
      }
    }
  };

  const handleOpen = (): void => {
    if (destroyed || !socket) return;
    const ticketPromise = options.ticketProvider();
    void ticketPromise.then((ticket) => {
      if (destroyed || !socket) return;
      const join = {
        v: 1,
        type: 'join',
        payload: { ticket, clientVersion: CLIENT_VERSION },
      };
      try {
        socket.send(JSON.stringify(join));
      } catch {
        /* Transitorio: el cierre posterior (close → handleClose) reintenta y
         * en el próximo open se obtiene un ticket nuevo. */
        notify('error', 'no se pudo enviar el join realtime');
        closeSocket(1011, 'join fallido');
      }
    }).catch((error: unknown) => {
      /* Un ticket fallido puede ser temporal (red); el backoff reintenta y
       * el próximo open pide un ticket nuevo. No se marca fatal. */
      notify('error', error instanceof Error ? error.message : 'no se pudo obtener ticket');
      closeSocket(1008, 'ticket inválido');
    });
  };

  const handleError = (): void => {
    /* Error transitorio del transporte: no marcar fatal. El evento `close`
     * que le sigue en navegadores (1006) programa la reconexión. */
    if (!destroyed) options.onState?.(state, 'conexión realtime no disponible');
  };

  const handleClose = (event?: Event): void => {
    clearHeartbeat();
    socket = null;
    if (destroyed || fatal) return;
    /* [297A-57] 4001 = el servidor reemplazó esta identidad por una conexión
     * nueva (otra pestaña/dispositivo del mismo usuario): no reintentar; la
     * sesión terminó deliberadamente. */
    const closeCode = (event as CloseEvent | undefined)?.code;
    if (closeCode === GAME_WS_REPLACED_CLOSE_CODE) {
      notify('closed', 'identidad reemplazada');
      return;
    }
    /* [Decisión 8] 4002 = el mundo se reinició (migración coordinada): el
     * banner ya mostró la cuenta atrás y este cierre la cumple; se reintenta
     * con backoff y el join recarga la versión activa nueva. */
    if (closeCode === GAME_WS_RESTART_CLOSE_CODE) {
      scheduleReconnect();
      return;
    }
    /* [297A-57] Caída inesperada (red, servidor o timeout): se programa la
     * reconexión con backoff; el render conserva el último snapshot y el
     * consumidor vuelve a simulación local hasta volver a 'connected'. */
    scheduleReconnect();
  };

  const connect = async (): Promise<void> => {
    if (destroyed || fatal || state === 'connecting' || state === 'connected') return;
    notify('connecting');
    try {
      socket = options.socketFactory(options.socketUrl);
      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleError);
      socket.addEventListener('close', handleClose);
    } catch (error: unknown) {
      /* Fallo al instanciar el socket: transitorio, se reintenta con backoff. */
      options.onState?.(state, error instanceof Error ? error.message : 'no se pudo abrir realtime');
      scheduleReconnect();
    }
  };

  return {
    connect,
    sendMove: (direction: Vector2): void => {
      if (state !== 'connected') return;
      send({
        v: 1,
        type: 'move',
        payload: { sequence: sequence++, direction },
      });
    },
    getRenderSnapshot: (nowMs = Date.now()): WorldSnapshot | null => {
      if (!currentSnapshot) return null;
      if (!previousSnapshot || currentSnapshotAt <= previousSnapshotAt) return currentSnapshot;
      const alpha = (nowMs - currentSnapshotAt) / (currentSnapshotAt - previousSnapshotAt) + 1;
      return interpolateSnapshots(previousSnapshot, currentSnapshot, alpha);
    },
    getPlayerId: () => playerId,
    getMapVersion: () => mapVersion,
    getState: () => state,
    destroy: (): void => {
      if (destroyed) return;
      destroyed = true;
      clearReconnect();
      clearHeartbeat();
      if (socket) {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('error', handleError);
        socket.removeEventListener('close', handleClose);
      }
      closeSocket(1000, 'vista destruida');
      notify('closed');
    },
  };
}

export function defaultGameSocketUrl(locationLike: Location = window.location): string {
  const protocol = locationLike.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${locationLike.host}/api/game/ws`;
}

