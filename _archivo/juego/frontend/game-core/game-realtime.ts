/* GAME-01 — Contrato puro de realtime v1.
 * No conoce WebSocket, DOM, sesiones ni Three.js. El ticket es opaco y solo
 * cruza el boundary de join; el servidor resuelve la identidad real. */

import type { Vector2 } from './contracts';

export const GAME_REALTIME_PROTOCOL_VERSION = 1 as const;

export const GAME_REALTIME_LIMITS = {
  maxClientMessageBytes: 512,
  maxServerMessageBytes: 4_096,
  maxPlayersPerRoom: 8,
  maxClientMessagesPerSecond: 20,
  maxSequenceJump: 1_024,
  maxTicketLength: 256,
  maxClientVersionLength: 32,
  maxMapVersionLength: 128,
  maxEntityIdLength: 128,
  maxCharacterIdLength: 64,
  maxErrorMessageLength: 160,
  /* Decisión 8 (05-ago): aviso de reinicio coordinado. Motivo bounded y
   * cuenta atrás acotada (el flujo oficial usa 300 s). */
  maxRestartReasonLength: 200,
  maxRestartSeconds: 3_600,
} as const;

type UnknownRecord = Record<string, unknown>;

export interface GameRealtimeJoinPayload {
  readonly ticket: string;
  readonly clientVersion: string;
}

export interface GameRealtimeMovePayload {
  readonly sequence: number;
  readonly direction: Vector2;
}

export interface GameRealtimeHeartbeatPayload {
  readonly lastSnapshotSequence: number;
}

export interface GameRealtimeClientAckPayload {
  readonly snapshotSequence: number;
}

export type GameRealtimeClientMessage =
  | { readonly v: 1; readonly type: 'join'; readonly payload: GameRealtimeJoinPayload }
  | { readonly v: 1; readonly type: 'move'; readonly payload: GameRealtimeMovePayload }
  | { readonly v: 1; readonly type: 'heartbeat'; readonly payload: GameRealtimeHeartbeatPayload }
  | { readonly v: 1; readonly type: 'client_ack'; readonly payload: GameRealtimeClientAckPayload };

export interface GameRealtimeEntity {
  readonly id: string;
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly radius: number;
  /** Personaje del catálogo resuelto server-side; nunca es identidad. */
  readonly characterId: string;
}

export interface GameRealtimeJoinedPayload {
  /** ID efímero dentro de la sala; nunca es el UUID de cuenta. */
  readonly playerId: string;
  readonly mapVersion: string;
  readonly tick: number;
}

export interface GameRealtimeSnapshotPayload {
  readonly snapshotSequence: number;
  readonly tick: number;
  readonly entities: readonly GameRealtimeEntity[];
}

export interface GameRealtimeHeartbeatAckPayload {
  readonly serverTick: number;
}

/** Aviso de reinicio coordinado (decisión 8, 05-ago): el servidor anuncia que
 * el mundo migrará a la versión nueva con cuenta atrás. `restartInSeconds` se
 * valida en 1..=maxRestartSeconds; el motivo es texto bounded sin controles. */
export interface GameRealtimeServerRestartPayload {
  readonly reason: string;
  readonly restartInSeconds: number;
}

export type GameRealtimeErrorCode =
  | 'invalid_message'
  | 'unauthorized'
  | 'rate_limited'
  | 'sequence_replay'
  | 'sequence_jump'
  | 'room_full'
  | 'map_unavailable'
  | 'server_busy';

export interface GameRealtimeErrorPayload {
  readonly code: GameRealtimeErrorCode;
  readonly message: string;
  readonly fatal: boolean;
}

export type GameRealtimeServerMessage =
  | { readonly v: 1; readonly type: 'joined'; readonly payload: GameRealtimeJoinedPayload }
  | { readonly v: 1; readonly type: 'snapshot'; readonly payload: GameRealtimeSnapshotPayload }
  | { readonly v: 1; readonly type: 'heartbeat_ack'; readonly payload: GameRealtimeHeartbeatAckPayload }
  | { readonly v: 1; readonly type: 'server_restart'; readonly payload: GameRealtimeServerRestartPayload }
  | { readonly v: 1; readonly type: 'error'; readonly payload: GameRealtimeErrorPayload };

export type RealtimeParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every(key => expected.has(key))
    && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
}

function isFiniteSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/* Rust `char::is_control` también rechaza DEL y el bloque de controles C1;
 * mantener la misma allowlist evita que ticket/error diverjan entre stacks. */
function isControlCharacter(value: string): boolean {
  const codePoint = value.codePointAt(0) ?? 0;
  return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
}

function validBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && value.trim().length > 0
    && Array.from(value).length <= maxLength
    && !Array.from(value).some(isControlCharacter);
}

function readDirection(value: unknown): Vector2 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['x', 'z'])
    || !isFiniteNumber(value.x) || !isFiniteNumber(value.z)
    || Math.abs(value.x) > 1 || Math.abs(value.z) > 1) return undefined;
  return { x: value.x, z: value.z };
}

function readFiniteVector(value: unknown): Vector2 | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['x', 'z'])
    || !isFiniteNumber(value.x) || !isFiniteNumber(value.z)) return undefined;
  return { x: value.x, z: value.z };
}

function readEntity(value: unknown): GameRealtimeEntity | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['id', 'position', 'velocity', 'radius', 'characterId'])
    || !validBoundedString(value.id, GAME_REALTIME_LIMITS.maxEntityIdLength)
    || !validBoundedString(value.characterId, GAME_REALTIME_LIMITS.maxCharacterIdLength)
    || !readFiniteVector(value.position)
    || !readFiniteVector(value.velocity)
    || !isFiniteNumber(value.radius) || value.radius <= 0 || value.radius > 16) return undefined;
  return {
    id: value.id,
    position: readFiniteVector(value.position)!,
    velocity: readFiniteVector(value.velocity)!,
    radius: value.radius,
    characterId: value.characterId,
  };
}

function parseJson(input: string | Uint8Array, maxBytes: number): RealtimeParseResult<unknown> {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > maxBytes) return { ok: false, error: 'mensaje supera el tamaño máximo' };
  try {
    const text = typeof input === 'string'
      ? input
      : new TextDecoder('utf-8', { fatal: true }).decode(input);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, error: 'JSON inválido' };
  }
}

export function parseGameRealtimeClientMessage(input: string | Uint8Array): RealtimeParseResult<GameRealtimeClientMessage> {
  const parsed = parseJson(input, GAME_REALTIME_LIMITS.maxClientMessageBytes);
  if (!parsed.ok) return parsed;
  const value = parsed.value;
  if (!isRecord(value) || !hasExactKeys(value, ['v', 'type', 'payload'])
    || value.v !== GAME_REALTIME_PROTOCOL_VERSION
    || typeof value.type !== 'string' || !isRecord(value.payload)) {
    return { ok: false, error: 'envelope realtime inválido' };
  }
  const payload = value.payload;
  if (value.type === 'join' && hasExactKeys(payload, ['ticket', 'clientVersion'])
    && validBoundedString(payload.ticket, GAME_REALTIME_LIMITS.maxTicketLength)
    && validBoundedString(payload.clientVersion, GAME_REALTIME_LIMITS.maxClientVersionLength)) {
    return { ok: true, value: { v: 1, type: 'join', payload: { ticket: payload.ticket, clientVersion: payload.clientVersion } } };
  }
  if (value.type === 'move' && hasExactKeys(payload, ['sequence', 'direction'])
    && isFiniteSafeInteger(payload.sequence) && readDirection(payload.direction)) {
    return { ok: true, value: { v: 1, type: 'move', payload: { sequence: payload.sequence, direction: readDirection(payload.direction)! } } };
  }
  if (value.type === 'heartbeat' && hasExactKeys(payload, ['lastSnapshotSequence'])
    && isFiniteSafeInteger(payload.lastSnapshotSequence)) {
    return { ok: true, value: { v: 1, type: 'heartbeat', payload: { lastSnapshotSequence: payload.lastSnapshotSequence } } };
  }
  if (value.type === 'client_ack' && hasExactKeys(payload, ['snapshotSequence'])
    && isFiniteSafeInteger(payload.snapshotSequence)) {
    return { ok: true, value: { v: 1, type: 'client_ack', payload: { snapshotSequence: payload.snapshotSequence } } };
  }
  return { ok: false, error: 'payload realtime inválido' };
}

export function validateGameRealtimeServerMessage(value: unknown): RealtimeParseResult<GameRealtimeServerMessage> {
  if (!isRecord(value) || !hasExactKeys(value, ['v', 'type', 'payload'])
    || value.v !== GAME_REALTIME_PROTOCOL_VERSION
    || typeof value.type !== 'string' || !isRecord(value.payload)) {
    return { ok: false, error: 'envelope realtime inválido' };
  }
  const payload = value.payload;
  if (value.type === 'joined' && hasExactKeys(payload, ['playerId', 'mapVersion', 'tick'])
    && validBoundedString(payload.playerId, GAME_REALTIME_LIMITS.maxEntityIdLength)
    && validBoundedString(payload.mapVersion, GAME_REALTIME_LIMITS.maxMapVersionLength)
    && isFiniteSafeInteger(payload.tick)) {
    return { ok: true, value: { v: 1, type: 'joined', payload: { playerId: payload.playerId, mapVersion: payload.mapVersion, tick: payload.tick } } };
  }
  if (value.type === 'snapshot' && hasExactKeys(payload, ['snapshotSequence', 'tick', 'entities'])
    && isFiniteSafeInteger(payload.snapshotSequence) && isFiniteSafeInteger(payload.tick)
    && Array.isArray(payload.entities) && payload.entities.length <= GAME_REALTIME_LIMITS.maxPlayersPerRoom) {
    const entities = payload.entities.map(readEntity);
    const ids = new Set<string>();
    if (entities.every((entity): entity is GameRealtimeEntity => entity !== undefined && !ids.has(entity.id) && (ids.add(entity.id), true))) {
      return { ok: true, value: { v: 1, type: 'snapshot', payload: { snapshotSequence: payload.snapshotSequence, tick: payload.tick, entities } } };
    }
  }
  if (value.type === 'heartbeat_ack' && hasExactKeys(payload, ['serverTick'])
    && isFiniteSafeInteger(payload.serverTick)) {
    return { ok: true, value: { v: 1, type: 'heartbeat_ack', payload: { serverTick: payload.serverTick } } };
  }
  if (value.type === 'server_restart' && hasExactKeys(payload, ['reason', 'restartInSeconds'])
    && validBoundedString(payload.reason, GAME_REALTIME_LIMITS.maxRestartReasonLength)
    && isFiniteSafeInteger(payload.restartInSeconds)
    && payload.restartInSeconds >= 1
    && payload.restartInSeconds <= GAME_REALTIME_LIMITS.maxRestartSeconds) {
    return { ok: true, value: { v: 1, type: 'server_restart', payload: { reason: payload.reason, restartInSeconds: payload.restartInSeconds } } };
  }
  const errorCodes = new Set<GameRealtimeErrorCode>([
    'invalid_message', 'unauthorized', 'rate_limited', 'sequence_replay',
    'sequence_jump', 'room_full', 'map_unavailable', 'server_busy',
  ]);
  if (value.type === 'error' && hasExactKeys(payload, ['code', 'message', 'fatal'])
    && typeof payload.code === 'string' && errorCodes.has(payload.code as GameRealtimeErrorCode)
    && typeof payload.message === 'string'
    && Array.from(payload.message).length <= GAME_REALTIME_LIMITS.maxErrorMessageLength
    && !Array.from(payload.message).some(isControlCharacter)
    && typeof payload.fatal === 'boolean') {
    return { ok: true, value: { v: 1, type: 'error', payload: { code: payload.code as GameRealtimeErrorCode, message: payload.message, fatal: payload.fatal } } };
  }
  return { ok: false, error: 'payload realtime inválido' };
}

export function serializeGameRealtimeServerMessage(message: GameRealtimeServerMessage): RealtimeParseResult<string> {
  const validated = validateGameRealtimeServerMessage(message);
  if (!validated.ok) return validated;
  const serialized = JSON.stringify(message);
  if (new TextEncoder().encode(serialized).byteLength > GAME_REALTIME_LIMITS.maxServerMessageBytes) {
    return { ok: false, error: 'snapshot supera el tamaño máximo' };
  }
  return { ok: true, value: serialized };
}

export function filterGameRealtimeSnapshot(
  snapshot: GameRealtimeSnapshotPayload,
  visibleEntityIds: ReadonlySet<string>,
): GameRealtimeSnapshotPayload {
  return {
    ...snapshot,
    entities: snapshot.entities
      .filter(entity => visibleEntityIds.has(entity.id))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}

export type SequenceDecision = 'accept' | 'replay' | 'jump' | 'invalid';

export function assessGameRealtimeSequence(lastAccepted: number | null, incoming: unknown): SequenceDecision {
  if (!isFiniteSafeInteger(incoming)) return 'invalid';
  if (lastAccepted !== null && incoming <= lastAccepted) return 'replay';
  if (lastAccepted !== null && incoming - lastAccepted > GAME_REALTIME_LIMITS.maxSequenceJump) return 'jump';
  return 'accept';
}

export function consumeGameRealtimeRateBudget(history: readonly number[], nowMs: number): RealtimeParseResult<readonly number[]> {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0
    || history.some(value => !Number.isSafeInteger(value) || value < 0 || value > nowMs)) {
    return { ok: false, error: 'reloj de rate limit inválido' };
  }
  const active = history.filter(value => value > nowMs - 1_000);
  if (active.length >= GAME_REALTIME_LIMITS.maxClientMessagesPerSecond) {
    return { ok: false, error: 'rate limit realtime excedido' };
  }
  return { ok: true, value: [...active, nowMs] };
}
