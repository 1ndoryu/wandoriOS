import { describe, expect, it } from 'vitest';
import {
  GAME_REALTIME_LIMITS,
  assessGameRealtimeSequence,
  consumeGameRealtimeRateBudget,
  filterGameRealtimeSnapshot,
  parseGameRealtimeClientMessage,
  serializeGameRealtimeServerMessage,
  validateGameRealtimeServerMessage,
} from './game-realtime';

describe('GAME-01 realtime contract v1', () => {
  it('accepts an opaque-ticket join and rejects unknown fields or versions', () => {
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'join',
      payload: { ticket: 'opaque-ticket', clientVersion: 'game-01' },
    }))).toEqual({
      ok: true,
      value: { v: 1, type: 'join', payload: { ticket: 'opaque-ticket', clientVersion: 'game-01' } },
    });
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 2,
      type: 'join',
      payload: { ticket: 'opaque-ticket', clientVersion: 'game-01' },
    })).ok).toBe(false);
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'join',
      payload: { ticket: 'opaque-ticket', clientVersion: 'game-01', userId: 'account-id' },
    })).ok).toBe(false);
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'join',
      payload: { ticket: 'opaque-ticket', clientVersion: 'game-01' },
      extra: true,
    })).ok).toBe(false);
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'join',
      payload: { ticket: 'opaque-ticket', clientVersion: '🚀'.repeat(32) },
    })).ok).toBe(true);
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'join',
      payload: { ticket: 'ticket\u007f', clientVersion: 'game-01' },
    })).ok).toBe(false);
  });

  it('rejects malformed, oversized and unsafe move payloads', () => {
    expect(parseGameRealtimeClientMessage('{invalid')).toEqual({ ok: false, error: 'JSON inválido' });
    expect(parseGameRealtimeClientMessage(new Uint8Array([0x7b, 0x22, 0xff, 0x22, 0x7d])))
      .toEqual({ ok: false, error: 'JSON inválido' });
    expect(parseGameRealtimeClientMessage(new Uint8Array(GAME_REALTIME_LIMITS.maxClientMessageBytes + 1)))
      .toEqual({ ok: false, error: 'mensaje supera el tamaño máximo' });
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'move',
      payload: { sequence: 1, direction: { x: 2, z: 0 } },
    })).ok).toBe(false);
    expect(parseGameRealtimeClientMessage(JSON.stringify({
      v: 1,
      type: 'move',
      payload: { sequence: 1.5, direction: { x: 1, z: 0 } },
    })).ok).toBe(false);
  });

  it('accepts arbitrary finite world positions and rejects invalid error codes', () => {
    const snapshot = {
      v: 1 as const,
      type: 'snapshot' as const,
      payload: {
        snapshotSequence: 4,
        tick: 10,
        entities: [{
          id: 'remote',
          position: { x: 20, z: 30 },
          velocity: { x: 4, z: -2 },
          radius: 0.5,
          characterId: 'forest-scout',
        }],
      },
    };
    expect(validateGameRealtimeServerMessage(snapshot)).toEqual({ ok: true, value: snapshot });
    expect(validateGameRealtimeServerMessage({
      v: 1, type: 'error', payload: { code: 'not_allowlisted', message: 'no', fatal: false },
    }).ok).toBe(false);
    expect(validateGameRealtimeServerMessage({
      v: 1, type: 'error', payload: { code: 'server_busy', message: '\n', fatal: false },
    }).ok).toBe(false);
  });

  it('accepts Unicode error messages by character count, not UTF-16 units', () => {
    const message = 'ñ'.repeat(GAME_REALTIME_LIMITS.maxErrorMessageLength);
    expect(validateGameRealtimeServerMessage({
      v: 1, type: 'error', payload: { code: 'server_busy', message, fatal: false },
    }).ok).toBe(true);
  });

  it('rejects snapshots with entities missing or misbounded characterId', () => {
    const base = {
      v: 1 as const,
      type: 'snapshot' as const,
      payload: {
        snapshotSequence: 1,
        tick: 1,
        entities: [{
          id: 'remote',
          position: { x: 1, z: 1 },
          velocity: { x: 0, z: 0 },
          radius: 0.5,
          characterId: 'forest-scout',
        }],
      },
    };
    expect(validateGameRealtimeServerMessage(base).ok).toBe(true);
    const { characterId: _ignored, ...withoutCharacter } = base.payload.entities[0];
    expect(validateGameRealtimeServerMessage({
      ...base,
      payload: { ...base.payload, entities: [withoutCharacter] },
    }).ok).toBe(false);
    expect(validateGameRealtimeServerMessage({
      ...base,
      payload: {
        ...base.payload,
        entities: [{
          ...base.payload.entities[0],
          characterId: 'x'.repeat(GAME_REALTIME_LIMITS.maxCharacterIdLength + 1),
        }],
      },
    }).ok).toBe(false);
  });

  it('filters snapshots by interest and keeps deterministic entity order', () => {
    const snapshot = {
      snapshotSequence: 3,
      tick: 8,
      entities: [
        { id: 'z', position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'forest-scout' },
        { id: 'a', position: { x: 1, z: 1 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'paper' },
      ],
    } as const;
    expect(filterGameRealtimeSnapshot(snapshot, new Set(['z', 'a'])).entities.map(entity => entity.id))
      .toEqual(['a', 'z']);
  });

  it('classifies replay, jump and valid sequence transitions', () => {
    expect(assessGameRealtimeSequence(null, 0)).toBe('accept');
    expect(assessGameRealtimeSequence(10, 10)).toBe('replay');
    expect(assessGameRealtimeSequence(10, 9)).toBe('replay');
    expect(assessGameRealtimeSequence(10, 10 + GAME_REALTIME_LIMITS.maxSequenceJump + 1)).toBe('jump');
    expect(assessGameRealtimeSequence(10, 11)).toBe('accept');
    expect(assessGameRealtimeSequence(10, -1)).toBe('invalid');
  });

  it('enforces the per-client rate budget using an injected clock', () => {
    let history: readonly number[] = [];
    for (let index = 0; index < GAME_REALTIME_LIMITS.maxClientMessagesPerSecond; index += 1) {
      const result = consumeGameRealtimeRateBudget(history, 100);
      expect(result.ok).toBe(true);
      if (result.ok) history = result.value;
    }
    expect(consumeGameRealtimeRateBudget(history, 100)).toEqual({ ok: false, error: 'rate limit realtime excedido' });
    expect(consumeGameRealtimeRateBudget([101], 100)).toEqual({ ok: false, error: 'reloj de rate limit inválido' });
    expect(consumeGameRealtimeRateBudget([-1], 100)).toEqual({ ok: false, error: 'reloj de rate limit inválido' });
    expect(consumeGameRealtimeRateBudget(history, 1_101).ok).toBe(true);
  });

  it('accepts a bounded server_restart notice and rejects unsafe countdowns', () => {
    const valid = {
      v: 1 as const,
      type: 'server_restart' as const,
      payload: { reason: 'publicación de versión nueva', restartInSeconds: 300 },
    };
    expect(validateGameRealtimeServerMessage(valid)).toEqual({ ok: true, value: valid });
    expect(validateGameRealtimeServerMessage({
      v: 1, type: 'server_restart', payload: { reason: 'x', restartInSeconds: 0 },
    }).ok).toBe(false);
    expect(validateGameRealtimeServerMessage({
      v: 1,
      type: 'server_restart',
      payload: { reason: 'x', restartInSeconds: GAME_REALTIME_LIMITS.maxRestartSeconds + 1 },
    }).ok).toBe(false);
    expect(validateGameRealtimeServerMessage({
      v: 1,
      type: 'server_restart',
      payload: { reason: 'x'.repeat(GAME_REALTIME_LIMITS.maxRestartReasonLength + 1), restartInSeconds: 300 },
    }).ok).toBe(false);
    expect(validateGameRealtimeServerMessage({
      v: 1, type: 'server_restart', payload: { reason: 'aviso\nnueva línea', restartInSeconds: 300 },
    }).ok).toBe(false);
    expect(validateGameRealtimeServerMessage({
      v: 1, type: 'server_restart', payload: { reason: 'x', restartInSeconds: 300, extra: true },
    }).ok).toBe(false);
  });

  it('keeps serialized server messages within the transport budget', () => {
    const result = serializeGameRealtimeServerMessage({
      v: 1,
      type: 'heartbeat_ack',
      payload: { serverTick: 12 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.value).v).toBe(1);
  });
});
