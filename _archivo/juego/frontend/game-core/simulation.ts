/* GAME-01 — Tick determinista de movimiento.
 * Esta primera versión resuelve límites y obstáculos estáticos. La colisión
 * jugador-jugador queda fuera del contrato hasta definir realtime/presencia. */

import type { MoveInput, SimulationConfig, StaticCollider, WorldMap, WorldState, Vector2 } from './contracts';
import { assertValidWorldMap } from './map-validation';
import { moveCircle } from './collision';
import { createColliderIndex, type SpatialEntry, type SpatialHash } from './spatial-hash';
import { GAME_CORE_LIMITS } from './limits';

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  speedUnitsPerSecond: 4,
  maxDeltaSeconds: 0.1,
  maxSubstepDistance: 0.25,
};

/* R7 — El mapa es inmutable por contrato, así que el índice espacial de sus
 * colliders se cachea por referencia de mapa (WeakMap: no retiene el mapa).
 * Se reconstruye solo si cambia la referencia de `colliders` o la granularidad
 * (`maxSubstepDistance`), que es el único input del índice. En el tick típico
 * con el mismo MapVersion esto ahorra la reconstrucción por frame. */
const colliderIndexCache = new WeakMap<WorldMap, {
  readonly colliders: readonly StaticCollider[];
  readonly cellSize: number;
  readonly index: SpatialHash<SpatialEntry>;
}>();

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function normalizeDirection(direction: Vector2): Vector2 {
  const length = Math.hypot(direction.x, direction.z);
  if (!Number.isFinite(length) || length === 0) return { x: 0, z: 0 };
  return { x: direction.x / length, z: direction.z / length };
}

function safeDelta(seconds: number, maxDelta: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.min(seconds, maxDelta);
}

function insideBounds(position: Vector2, radius: number, map: WorldMap): boolean {
  return position.x - radius >= map.bounds.minX
    && position.x + radius <= map.bounds.maxX
    && position.z - radius >= map.bounds.minZ
    && position.z + radius <= map.bounds.maxZ;
}

function normalizeConfig(value: unknown): SimulationConfig {
  if (!isRecord(value)
    || !isFiniteNumber(value.speedUnitsPerSecond)
    || !isFiniteNumber(value.maxDeltaSeconds)
    || !isFiniteNumber(value.maxSubstepDistance)) {
    throw new Error('configuración inválida');
  }
  if (value.speedUnitsPerSecond < 0 || value.speedUnitsPerSecond > GAME_CORE_LIMITS.maxSpeedUnitsPerSecond) {
    throw new Error('speedUnitsPerSecond fuera de presupuesto');
  }
  if (value.maxDeltaSeconds <= 0 || value.maxDeltaSeconds > GAME_CORE_LIMITS.maxDeltaSeconds) {
    throw new Error('maxDeltaSeconds fuera de presupuesto');
  }
  if (value.maxSubstepDistance < GAME_CORE_LIMITS.minSubstepDistance) {
    throw new Error('maxSubstepDistance fuera de presupuesto');
  }
  return {
    speedUnitsPerSecond: value.speedUnitsPerSecond,
    maxDeltaSeconds: value.maxDeltaSeconds,
    maxSubstepDistance: value.maxSubstepDistance,
  };
}

function normalizeState(value: unknown): WorldState {
  if (!isRecord(value)
    || !isNonNegativeInteger(value.tick)
    || !isRecord(value.players)
    || !isRecord(value.lastInputSequence)) {
    throw new Error('estado inválido');
  }

  const players = Object.create(null) as Record<string, WorldState['players'][string]>;
  for (const [key, valuePlayer] of Object.entries(value.players)) {
    if (!isRecord(valuePlayer)
      || valuePlayer.id !== key
      || !isRecord(valuePlayer.position)
      || !isRecord(valuePlayer.velocity)
      || !isFiniteNumber(valuePlayer.position.x)
      || !isFiniteNumber(valuePlayer.position.z)
      || !isFiniteNumber(valuePlayer.velocity.x)
      || !isFiniteNumber(valuePlayer.velocity.z)
      || !isFiniteNumber(valuePlayer.radius)
      || valuePlayer.radius <= 0) {
      throw new Error(`jugador inválido: ${key}`);
    }
    players[key] = {
      id: key,
      position: { x: valuePlayer.position.x, z: valuePlayer.position.z },
      velocity: { x: valuePlayer.velocity.x, z: valuePlayer.velocity.z },
      radius: valuePlayer.radius,
      characterId: typeof valuePlayer.characterId === 'string' && valuePlayer.characterId.trim()
        ? valuePlayer.characterId
        : 'forest-scout',
    };
  }

  const lastInputSequence = Object.create(null) as Record<string, number>;
  for (const [key, sequence] of Object.entries(value.lastInputSequence)) {
    if (!isNonNegativeInteger(sequence)) throw new Error(`secuencia inválida: ${key}`);
    lastInputSequence[key] = sequence;
  }
  return { tick: value.tick, players, lastInputSequence };
}

export function createWorldState(players: unknown): WorldState {
  if (!Array.isArray(players)) throw new Error('jugadores inválidos');
  const statePlayers = Object.create(null) as Record<string, WorldState['players'][string]>;
  for (const player of players) {
    if (!isRecord(player)
      || typeof player.id !== 'string'
      || !isRecord(player.position)
      || !isFiniteNumber(player.position.x)
      || !isFiniteNumber(player.position.z)
      || !isFiniteNumber(player.radius)) {
      throw new Error('jugador inválido');
    }
    if (Object.prototype.hasOwnProperty.call(statePlayers, player.id)) {
      throw new Error('id de jugador duplicado');
    }
    if (!player.id.trim() || player.radius <= 0) throw new Error('jugador inválido');
    statePlayers[player.id] = {
      id: player.id,
      position: { x: player.position.x, z: player.position.z },
      velocity: { x: 0, z: 0 },
      radius: player.radius,
      /* [297A-77] El personaje viaja en el snapshot para que el presentador
       * aplique el tono; si no viene (fixtures sintéticos), default del
       * catálogo. */
      characterId: typeof player.characterId === 'string' && player.characterId.trim()
        ? player.characterId
        : 'forest-scout',
    };
  }
  return {
    tick: 0,
    players: statePlayers,
    lastInputSequence: Object.create(null) as Record<string, number>,
  };
}

export function simulateTick(
  rawState: unknown,
  rawMap: unknown,
  rawInputs: unknown,
  deltaSeconds: unknown,
  rawConfig: unknown = DEFAULT_SIMULATION_CONFIG,
): WorldState {
  const state = normalizeState(rawState);
  const map = rawMap;
  assertValidWorldMap(map);
  const inputs = rawInputs;
  if (!Array.isArray(inputs)) throw new Error('inputs inválidos');
  const config = normalizeConfig(rawConfig);
  if (!isFiniteNumber(deltaSeconds)) throw new Error('delta inválido');

  const dt = safeDelta(deltaSeconds, config.maxDeltaSeconds);
  const cellSize = Math.max(config.maxSubstepDistance, 1);
  const cached = colliderIndexCache.get(map);
  let index: SpatialHash<SpatialEntry>;
  if (cached === undefined || cached.colliders !== map.colliders || cached.cellSize !== cellSize) {
    index = createColliderIndex(map.colliders, cellSize);
    colliderIndexCache.set(map, { colliders: map.colliders, cellSize, index });
  } else {
    index = cached.index;
  }
  const byPlayer = new Map<string, MoveInput>();
  for (const input of inputs) {
    if (!isRecord(input)
      || typeof input.playerId !== 'string'
      || !isRecord(input.direction)
      || !isFiniteNumber(input.direction.x)
      || !isFiniteNumber(input.direction.z)
      || !isNonNegativeInteger(input.sequence)) {
      throw new Error('input inválido');
    }
    const playerId = input.playerId;
    if (!playerId.trim()) throw new Error('input inválido');
    if (!Object.prototype.hasOwnProperty.call(state.players, playerId)) {
      throw new Error(`jugador desconocido: ${playerId}`);
    }
    if (byPlayer.has(playerId)) throw new Error(`input duplicado: ${playerId}`);
    byPlayer.set(playerId, {
      playerId,
      direction: { x: input.direction.x, z: input.direction.z },
      sequence: input.sequence,
    });
  }

  const lastInputSequence = Object.assign(
    Object.create(null) as Record<string, number>,
    state.lastInputSequence,
  );
  const players = Object.create(null) as Record<string, WorldState['players'][string]>;

  for (const player of Object.values(state.players)) {
    if (!insideBounds(player.position, player.radius, map)) {
      throw new Error(`spawn fuera de bounds: ${player.id}`);
    }
    const input = byPlayer.get(player.id);
    const previousSequence = lastInputSequence[player.id] ?? -1;
    const accepted = input !== undefined && input.sequence > previousSequence;
    const direction = accepted ? normalizeDirection(input.direction) : { x: 0, z: 0 };
    if (accepted) lastInputSequence[player.id] = input.sequence;
    const velocity = { x: direction.x * config.speedUnitsPerSecond, z: direction.z * config.speedUnitsPerSecond };
    const position = moveCircle(
      player.position,
      { x: velocity.x * dt, z: velocity.z * dt },
      player.radius,
      map.bounds,
      map.colliders,
      index,
      config.maxSubstepDistance,
    );
    players[player.id] = { ...player, position, velocity };
  }
  return { tick: state.tick + 1, players, lastInputSequence };
}
