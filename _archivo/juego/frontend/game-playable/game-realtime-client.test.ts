import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createGameRealtimeClient,
  defaultGameSocketUrl,
  type GameRealtimeSocket,
} from './game-realtime-client';

class FakeSocket implements GameRealtimeSocket {
  readonly sent: string[] = [];
  readonly closed: Array<{ code?: number; reason?: string }> = [];
  private readonly listeners = new Map<string, Set<EventListener>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed.push({ code, reason });
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, data?: unknown): void {
    /* [297A-57] El evento `close` transporta el código para distinguir el
     * cierre por reemplazo de identidad (4001) de una caída de red (1006). */
    const event = type === 'close'
      ? ({ code: data } as CloseEvent)
      : ({ data } as MessageEvent<unknown>);
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('Bosque realtime client adapter', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('requests a ticket on open and sends the versioned join', async () => {
    const socket = new FakeSocket();
    const states: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('opaque-ticket'),
      socketFactory: () => socket,
      socketUrl: 'ws://localhost/api/game/ws',
      onState: state => states.push(state),
    });

    await client.connect();
    expect(client.getState()).toBe('connecting');
    socket.emit('open');
    await Promise.resolve();

    expect(JSON.parse(socket.sent[0] ?? '{}')).toEqual({
      v: 1,
      type: 'join',
      payload: { ticket: 'opaque-ticket', clientVersion: 'game-01' },
    });
    expect(states).toEqual(['connecting']);
    client.destroy();
  });

  it('stores joined identity and interpolates successive snapshots', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    const socket = new FakeSocket();
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => socket,
      socketUrl: 'ws://localhost/api/game/ws',
    });

    void client.connect();
    socket.emit('open');
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'snapshot',
      payload: {
        snapshotSequence: 1,
        tick: 1,
        entities: [{ id: 'p-local', position: { x: 0, z: 0 }, velocity: { x: 1, z: 0 }, radius: 0.5, characterId: 'forest-scout' }],
      },
    }));
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'snapshot',
      payload: {
        snapshotSequence: 2,
        tick: 2,
        entities: [{ id: 'p-local', position: { x: 2, z: 0 }, velocity: { x: 3, z: 0 }, radius: 0.5, characterId: 'forest-scout' }],
      },
    }));

    expect(client.getState()).toBe('connected');
    expect(client.getPlayerId()).toBe('p-local');
    expect(client.getMapVersion()).toBe('forest@1');
    expect(client.getRenderSnapshot(1_050)?.entities[0]?.position.x).toBe(1);
    client.destroy();
  });

  it('ignores stale snapshots and keeps the socket connected on non-fatal errors', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    const socket = new FakeSocket();
    const notices: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => socket,
      socketUrl: 'ws://localhost/api/game/ws',
      onState: (_state, message) => { if (message) notices.push(message); },
    });

    void client.connect();
    socket.emit('open');
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'snapshot',
      payload: {
        snapshotSequence: 2,
        tick: 2,
        entities: [{ id: 'p-local', position: { x: 2, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'forest-scout' }],
      },
    }));
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'snapshot',
      payload: {
        snapshotSequence: 1,
        tick: 1,
        entities: [{ id: 'p-local', position: { x: -4, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'forest-scout' }],
      },
    }));
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'error',
      payload: { code: 'sequence_replay', message: 'secuencia repetida', fatal: false },
    }));

    expect(client.getState()).toBe('connected');
    expect(client.getRenderSnapshot()?.entities[0]?.position.x).toBe(2);
    expect(notices).toEqual(['secuencia repetida']);
    client.sendMove({ x: 1, z: 0 });
    expect(JSON.parse(socket.sent.at(-1) ?? '{}').type).toBe('move');
    client.destroy();
  });

  it('resets snapshot state on joined so the new room is not treated as replay', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100);
    const socket = new FakeSocket();
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => socket,
      socketUrl: 'ws://localhost/api/game/ws',
    });

    void client.connect();
    socket.emit('open');
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-old', mapVersion: 'forest@1', tick: 0 },
    }));
    /* Sala anterior con contador avanzado (p. ej. actor recreado por TTL). */
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'snapshot',
      payload: {
        snapshotSequence: 9,
        tick: 9,
        entities: [{ id: 'p-old', position: { x: 5, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'forest-scout' }],
      },
    }));
    expect(client.getRenderSnapshot()?.entities[0]?.position.x).toBe(5);

    /* Reconexión: la sala nueva emite `joined` y reinicia su contador en 1.
     * Sin el reset, la secuencia 1 <= 9 se descartaría como replay y la
     * escena quedaría interpolando posiciones de otra sala. */
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-new', mapVersion: 'forest@1', tick: 0 },
    }));
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'snapshot',
      payload: {
        snapshotSequence: 1,
        tick: 1,
        entities: [{ id: 'p-new', position: { x: 1, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'forest-scout' }],
      },
    }));

    expect(client.getState()).toBe('connected');
    expect(client.getPlayerId()).toBe('p-new');
    expect(client.getRenderSnapshot()?.entities[0]?.position.x).toBe(1);
    client.destroy();
  });

  it('sends normalized move/heartbeat messages and closes on fatal server error', () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => socket,
      socketUrl: 'ws://localhost/api/game/ws',
    });

    void client.connect();
    socket.emit('open');
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    client.sendMove({ x: 1, z: 0 });
    vi.advanceTimersByTime(1_000);

    expect(JSON.parse(socket.sent.at(-1) ?? '{}')).toEqual({
      v: 1,
      type: 'heartbeat',
      payload: { lastSnapshotSequence: 0 },
    });

    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'error',
      payload: { code: 'room_full', message: 'sala llena', fatal: true },
    }));
    expect(client.getState()).toBe('error');
    expect(socket.closed.at(-1)).toEqual({ code: 1008, reason: 'room_full' });
    client.destroy();
    client.destroy();
  });

  it('derives the secure WebSocket URL from the page location', () => {
    expect(defaultGameSocketUrl({ protocol: 'https:', host: 'example.test' } as Location))
      .toBe('wss://example.test/api/game/ws');
    expect(defaultGameSocketUrl({ protocol: 'http:', host: 'localhost:5173' } as Location))
      .toBe('ws://localhost:5173/api/game/ws');
  });

  /* [297A-57] Reconexión persistente: backoff exponencial determinista
   * (jitter 0 con Math.random espiado), re-join tras caída, sin reintento
   * tras error fatal y cancelación al destruir. */
  it('re-joins and returns to connected after an unexpected close', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      socketUrl: 'ws://localhost/api/game/ws',
      onState: state => states.push(state),
    });

    void client.connect();
    sockets[0]!.emit('open');
    await Promise.resolve();
    sockets[0]!.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    expect(client.getState()).toBe('connected');

    sockets[0]!.emit('close');
    expect(client.getState()).toBe('reconnecting');
    expect(states).toContain('reconnecting');

    vi.advanceTimersByTime(1_000);
    await Promise.resolve();
    expect(sockets).toHaveLength(2);
    sockets[1]!.emit('open');
    await Promise.resolve();
    expect(JSON.parse(sockets[1]!.sent[0] ?? '{}')).toMatchObject({
      type: 'join',
      payload: { ticket: 'ticket', clientVersion: 'game-01' },
    });
    sockets[1]!.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    expect(client.getState()).toBe('connected');
    expect(client.getPlayerId()).toBe('p-local');
    client.destroy();
  });

  it('grows the backoff exponentially and caps at 30s', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sockets: FakeSocket[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      socketUrl: 'ws://localhost/api/game/ws',
    });

    void client.connect();
    sockets[0]!.emit('close');
    expect(client.getState()).toBe('reconnecting');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.emit('close');
    vi.advanceTimersByTime(2_000);
    expect(sockets).toHaveLength(3);

    sockets[2]!.emit('close');
    vi.advanceTimersByTime(4_000);
    expect(sockets).toHaveLength(4);

    sockets[3]!.emit('close');
    vi.advanceTimersByTime(8_000);
    expect(sockets).toHaveLength(5);

    sockets[4]!.emit('close');
    vi.advanceTimersByTime(16_000);
    expect(sockets).toHaveLength(6);

    sockets[5]!.emit('close');
    vi.advanceTimersByTime(32_000);
    expect(sockets).toHaveLength(7);
    client.destroy();
  });

  it('does not reconnect after a fatal server error', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const socket = new FakeSocket();
    const states: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => socket,
      socketUrl: 'ws://localhost/api/game/ws',
      onState: state => states.push(state),
    });

    void client.connect();
    socket.emit('message', JSON.stringify({
      v: 1,
      type: 'error',
      payload: { code: 'room_full', message: 'sala llena', fatal: true },
    }));
    expect(client.getState()).toBe('error');

    socket.emit('close');
    vi.advanceTimersByTime(60_000);
    expect(client.getState()).toBe('error');
    expect(states).not.toContain('reconnecting');
    client.destroy();
  });

  it('cancels a pending reconnect when destroyed', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sockets: FakeSocket[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      socketUrl: 'ws://localhost/api/game/ws',
    });

    void client.connect();
    sockets[0]!.emit('close');
    expect(client.getState()).toBe('reconnecting');
    client.destroy();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(client.getState()).toBe('closed');
  });

  /* [297A-57] En navegadores reales una caída de red dispara `error` y luego
   * `close` (1006): el error del transporte no debe marcar fatal y el close
   * posterior debe programar la reconexión. */
  it('reconnects after a transport error event followed by close', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      socketUrl: 'ws://localhost/api/game/ws',
      onState: state => states.push(state),
    });

    void client.connect();
    sockets[0]!.emit('error');
    sockets[0]!.emit('close');
    expect(client.getState()).toBe('reconnecting');

    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    sockets[1]!.emit('open');
    await Promise.resolve();
    sockets[1]!.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    expect(client.getState()).toBe('connected');
    client.destroy();
  });

  /* [297A-57] 4001 = el servidor reemplazó esta identidad por una conexión
   * nueva (otra pestaña/dispositivo): no reintentar para evitar el ping-pong. */
  it('does not reconnect when the server replaces the identity (close 4001)', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      socketUrl: 'ws://localhost/api/game/ws',
      onState: state => states.push(state),
    });

    void client.connect();
    sockets[0]!.emit('open');
    sockets[0]!.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    expect(client.getState()).toBe('connected');

    sockets[0]!.emit('close', 4001);
    expect(client.getState()).toBe('closed');
    expect(states).not.toContain('reconnecting');
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    client.destroy();
  });

  /* [Decisión 8] 4002 = el mundo se reinició (migración coordinada): a
   * diferencia del reemplazo de identidad, el cliente SÍ reintenta con
   * backoff para recargar la versión nueva. */
  it('reconnects when the server restarts the world (close 4002)', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    const client = createGameRealtimeClient({
      ticketProvider: vi.fn().mockResolvedValue('ticket'),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      socketUrl: 'ws://localhost/api/game/ws',
      onState: state => states.push(state),
    });

    void client.connect();
    sockets[0]!.emit('open');
    sockets[0]!.emit('message', JSON.stringify({
      v: 1,
      type: 'joined',
      payload: { playerId: 'p-local', mapVersion: 'forest@1', tick: 0 },
    }));
    expect(client.getState()).toBe('connected');

    sockets[0]!.emit('close', 4002);
    expect(states).toContain('reconnecting');
    vi.advanceTimersByTime(1_000);
    expect(sockets).toHaveLength(2);
    client.destroy();
  });
});
