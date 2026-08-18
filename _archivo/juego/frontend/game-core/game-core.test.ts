import { describe, expect, it } from 'vitest';
import {
  SpatialHash,
  assertValidWorldMap,
  createWorldState,
  interpolateSnapshots,
  moveCircle,
  simulateTick,
  snapshotFromState,
  validateWorldMap,
  type StaticCollider,
  type WorldMap,
} from './index';

const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } as const;
const emptyMap: WorldMap = { schemaVersion: 1, bounds, colliders: [] };

function wall(id: string, x: number, z: number, halfWidth = 0.4, halfDepth = 2): StaticCollider {
  return { id, position: { x, z }, shape: { kind: 'aabb', halfWidth, halfDepth } };
}

describe('GAME-01 game-core', () => {
  describe('map validation', () => {
    it('accepts a bounded map and rejects duplicate or oversized colliders', () => {
      expect(validateWorldMap(emptyMap)).toEqual([]);
      expect(() => assertValidWorldMap(emptyMap)).not.toThrow();

      const invalid: WorldMap = {
        ...emptyMap,
        colliders: [
          wall('tree', 4, 4),
          wall('tree', 6, 6),
          wall('rock', 8, 8, 300, 1),
        ],
      };
      const issues = validateWorldMap(invalid);
      expect(issues).toEqual(expect.arrayContaining([
        { path: 'colliders[1].id', message: 'id duplicado' },
        { path: 'colliders[2].shape', message: 'dimensiones AABB fuera de límites' },
      ]));
      expect(() => assertValidWorldMap(invalid)).toThrow('Mapa inválido');
    });

    it('rejects colliders outside bounds', () => {
      const issues = validateWorldMap({
        ...emptyMap,
        colliders: [wall('outside', 0.2, 5, 0.5, 0.5)],
      });
      expect(issues).toContainEqual({ path: 'colliders[0].position', message: 'el collider debe quedar dentro de bounds' });
    });

    it('fails closed for malformed JSON-like map documents', () => {
      expect(validateWorldMap(null)).toEqual([{ path: 'map', message: 'debe ser un objeto' }]);
      expect(validateWorldMap({ schemaVersion: 1, bounds: null, colliders: [] })).toEqual([
        { path: 'bounds', message: 'debe ser un objeto' },
      ]);
      expect(validateWorldMap({
        schemaVersion: 1,
        bounds,
        colliders: [null, { id: 'broken', position: null, shape: null }],
      })).toEqual(expect.arrayContaining([
        { path: 'colliders[0]', message: 'debe ser un objeto' },
        { path: 'colliders[1].position', message: 'requiere coordenadas finitas' },
        { path: 'colliders[1].shape', message: 'requiere una forma permitida' },
      ]));
    });

    it('rejects inverted and oversized world bounds', () => {
      const issues = validateWorldMap({
        ...emptyMap,
        bounds: { minX: 4, maxX: 4, minZ: 0, maxZ: 5000 },
      });
      expect(issues).toEqual(expect.arrayContaining([
        { path: 'bounds', message: 'cada mínimo debe ser menor que su máximo' },
        { path: 'bounds.depth', message: 'supera 4096 unidades' },
      ]));
    });
  });

  describe('spatial hash', () => {
    it('rejects entries that would occupy too many cells', () => {
      const index = new SpatialHash<{ id: string; position: { x: number; z: number }; halfWidth: number; halfDepth: number }>(1);
      expect(() => index.upsert({
        id: 'too-wide',
        position: { x: 0, z: 0 },
        halfWidth: 31.5,
        halfDepth: 31.5,
      })).not.toThrow();
      expect(() => index.upsert({
        id: 'too-large',
        position: { x: 0, z: 0 },
        halfWidth: 32,
        halfDepth: 32,
      })).toThrow('entrada espacial demasiado grande');
    });

    it('rejects invalid or unbounded queries', () => {
      const index = new SpatialHash<{ id: string; position: { x: number; z: number }; halfWidth: number; halfDepth: number }>(1);
      expect(() => index.queryAabb(Number.NaN, 1, 0, 1)).toThrow('consulta espacial inválida');
      expect(() => index.queryAabb(2, 1, 0, 1)).toThrow('consulta espacial inválida');
      expect(() => index.queryAabb(-100, 100, -100, 100)).toThrow('consulta espacial demasiado grande');
    });

    it('returns deterministic nearby entries and updates cell membership', () => {
      const index = new SpatialHash<{ id: string; position: { x: number; z: number }; halfWidth: number; halfDepth: number }>(2);
      index.upsert({ id: 'b', position: { x: 3, z: 0 }, halfWidth: 0.2, halfDepth: 0.2 });
      index.upsert({ id: 'a', position: { x: 0, z: 0 }, halfWidth: 0.2, halfDepth: 0.2 });
      expect(index.queryAabb(-1, 4, -1, 1).map(entry => entry.id)).toEqual(['a', 'b']);

      index.upsert({ id: 'b', position: { x: 20, z: 20 }, halfWidth: 0.2, halfDepth: 0.2 });
      expect(index.queryAabb(-1, 4, -1, 1).map(entry => entry.id)).toEqual(['a']);
      index.remove('a');
      expect(index.queryAabb(-1, 1, -1, 1)).toEqual([]);
    });
  });

  describe('movement and collision', () => {
    it('rejects duplicate or malformed players', () => {
      expect(() => createWorldState([
        { id: 'same', position: { x: 1, z: 1 }, radius: 0.5 },
        { id: 'same', position: { x: 2, z: 2 }, radius: 0.5 },
      ])).toThrow('duplicado');
      expect(() => createWorldState([
        { id: 'invalid', position: { x: Number.NaN, z: 1 }, radius: 0.5 },
      ])).toThrow('inválido');
      const special = createWorldState([{ id: '__proto__', position: { x: 1, z: 1 }, radius: 0.5 }]);
      expect(Object.prototype.hasOwnProperty.call(special.players, '__proto__')).toBe(true);
      expect(() => createWorldState([null as never])).toThrow('jugador inválido');
    });

    it('rejects invalid state, map, input and delta containers', () => {
      expect(() => simulateTick(null, emptyMap, [], 0.1)).toThrow('estado inválido');
      expect(() => simulateTick({ tick: 0, players: null, lastInputSequence: {} }, emptyMap, [], 0.1)).toThrow('estado inválido');
      expect(() => simulateTick(createWorldState([]), null, [], 0.1)).toThrow('Mapa inválido');
      expect(() => simulateTick(createWorldState([]), emptyMap, null, 0.1)).toThrow('inputs inválidos');
      expect(() => simulateTick(createWorldState([]), emptyMap, [], 0.1, null)).toThrow('configuración inválida');
      expect(() => simulateTick(createWorldState([]), emptyMap, [], Number.NaN)).toThrow('delta inválido');
    });

    it('rejects duplicate, unknown and malformed inputs in one tick', () => {
      const state = createWorldState([{ id: 'local', position: { x: 5, z: 5 }, radius: 0.5 }]);
      expect(() => simulateTick(state, emptyMap, [
        { playerId: 'local', direction: { x: 1, z: 0 }, sequence: 1 },
        { playerId: 'local', direction: { x: 0, z: 1 }, sequence: 2 },
      ], 0.1)).toThrow('input duplicado');
      expect(() => simulateTick(state, emptyMap, [
        { playerId: 'ghost', direction: { x: 1, z: 0 }, sequence: 1 },
      ], 0.1)).toThrow('jugador desconocido');
      expect(() => simulateTick(state, emptyMap, [
        { playerId: 'toString', direction: { x: 1, z: 0 }, sequence: 1 },
      ], 0.1)).toThrow('jugador desconocido');
      expect(() => simulateTick(state, emptyMap, [
        { playerId: 'local', direction: { x: Number.NaN, z: 0 }, sequence: 1 },
      ], 0.1)).toThrow('input inválido');
      expect(() => simulateTick(state, emptyMap, [null as never], 0.1)).toThrow('input inválido');
    });

    it('rejects configurations outside the defensive movement budget', () => {
      const state = createWorldState([{ id: 'local', position: { x: 5, z: 5 }, radius: 0.5 }]);
      expect(() => simulateTick(state, emptyMap, [], 0.1, {
        speedUnitsPerSecond: 33,
        maxDeltaSeconds: 0.1,
        maxSubstepDistance: 0.25,
      })).toThrow('speedUnitsPerSecond fuera');
      expect(() => simulateTick(state, emptyMap, [], 0.1, {
        speedUnitsPerSecond: 4,
        maxDeltaSeconds: 0.1,
        maxSubstepDistance: 0.001,
      })).toThrow('maxSubstepDistance fuera');
      const index = new SpatialHash<{ id: string; position: { x: number; z: number }; halfWidth: number; halfDepth: number }>(1);
      expect(() => moveCircle({ x: 5, z: 5 }, { x: 100, z: 0 }, 0.5, bounds, [], index, 0.01))
        .toThrow('movimiento demasiado grande');
    });

    it('rejects invalid simulation configuration and out-of-bounds spawns', () => {
      const state = createWorldState([{ id: 'local', position: { x: 5, z: 5 }, radius: 0.5 }]);
      expect(() => simulateTick(state, emptyMap, [], 0.1, {
        speedUnitsPerSecond: 4,
        maxDeltaSeconds: 0,
        maxSubstepDistance: 0.25,
      })).toThrow('maxDeltaSeconds');
      const outside = createWorldState([{ id: 'local', position: { x: 0, z: 5 }, radius: 0.5 }]);
      expect(() => simulateTick(outside, emptyMap, [], 0.1)).toThrow('spawn fuera');
    });

    it('rejects a movement that starts outside bounds', () => {
      const index = new SpatialHash<{ id: string; position: { x: number; z: number }; halfWidth: number; halfDepth: number }>(1);
      expect(() => moveCircle(
        { x: 0, z: 5 },
        { x: 1, z: 0 },
        0.5,
        bounds,
        [],
        index,
        0.25,
      )).toThrow('inicio fuera');
    });

    it('stays inside bounds and slides along an AABB obstacle', () => {
      const obstacle = wall('trunk', 5, 5, 0.5, 1.5);
      const index = new SpatialHash<{ id: string; position: { x: number; z: number }; halfWidth: number; halfDepth: number }>(1);
      index.upsert({ id: obstacle.id, position: obstacle.position, halfWidth: 0.5, halfDepth: 1.5 });
      const position = moveCircle(
        { x: 3, z: 3 },
        { x: 3, z: 3 },
        0.5,
        bounds,
        [obstacle],
        index,
        0.25,
      );
      expect(position.x).toBeLessThan(4.6);
      expect(position.z).toBeGreaterThan(3);
      expect(position.x - 0.5).toBeGreaterThanOrEqual(bounds.minX);
      expect(position.x + 0.5).toBeLessThanOrEqual(bounds.maxX);
      const wallHalfWidth = obstacle.shape.kind === 'aabb' ? obstacle.shape.halfWidth : obstacle.shape.radius;
      expect(position.x).toBeLessThanOrEqual(obstacle.position.x - wallHalfWidth - 0.5 + 0.25);
    });

    it('normalizes diagonal input and ignores repeated sequences', () => {
      const state = createWorldState([{ id: 'local', position: { x: 5, z: 5 }, radius: 0.5 }]);
      const first = simulateTick(state, emptyMap, [{ playerId: 'local', direction: { x: 1, z: 1 }, sequence: 1 }], 0.1);
      const repeated = simulateTick(first, emptyMap, [{ playerId: 'local', direction: { x: 1, z: 1 }, sequence: 1 }], 0.1);
      const position = first.players.local.position;
      expect(first.lastInputSequence.local).toBe(1);
      expect(Math.hypot(position.x - 5, position.z - 5)).toBeCloseTo(0.4, 8);
      expect(repeated.players.local.position).toEqual(position);
      expect(repeated.players.local.velocity).toEqual({ x: 0, z: 0 });
    });

    it('caps a large delta to the configured simulation step', () => {
      const state = createWorldState([{ id: 'local', position: { x: 5, z: 5 }, radius: 0.5 }]);
      const next = simulateTick(state, emptyMap, [{ playerId: 'local', direction: { x: 1, z: 0 }, sequence: 1 }], 5);
      expect(next.players.local.position).toEqual({ x: 5.4, z: 5 });
    });
  });

  describe('snapshots', () => {
    it('interpolates shared entities and keeps new entities at the next snapshot', () => {
      const previous = {
        tick: 4,
        entities: [
          { id: 'local', position: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'forest-scout' },
        ],
      } as const;
      const next = {
        tick: 5,
        entities: [
          { id: 'local', position: { x: 2, z: 4 }, velocity: { x: 2, z: 4 }, radius: 0.5, characterId: 'forest-scout' },
          { id: 'remote', position: { x: 8, z: 8 }, velocity: { x: 0, z: 0 }, radius: 0.5, characterId: 'middle' },
        ],
      } as const;
      const result = interpolateSnapshots(previous, next, 0.5);
      expect(result.entities[0].position).toEqual({ x: 1, z: 2 });
      expect(result.entities[0].velocity).toEqual({ x: 1, z: 2 });
      expect(result.entities[1].position).toEqual({ x: 8, z: 8 });
    });

    it('carries the character through simulation into snapshots', () => {
      const state = createWorldState([{
        id: 'local',
        position: { x: 5, z: 5 },
        radius: 0.5,
        characterId: 'forest-runner',
      }]);
      const ticked = simulateTick(
        state,
        emptyMap,
        [{ playerId: 'local', direction: { x: 1, z: 0 }, sequence: 1 }],
        0.1,
      );
      expect(snapshotFromState(ticked).entities[0]?.characterId).toBe('forest-runner');
    });

    it('serializes state in stable entity order', () => {
      const state = createWorldState([
        { id: 'z', position: { x: 1, z: 1 }, radius: 0.5 },
        { id: 'a', position: { x: 2, z: 2 }, radius: 0.5 },
      ]);
      expect(snapshotFromState(state).entities.map(entity => entity.id)).toEqual(['a', 'z']);
    });
  });

  describe('R7 — índice espacial cacheado por mapa y granularidad', () => {
    it('un mapa con colliders da el mismo resultado con caché (hit) y sin ella (rebuild)', () => {
      const wallMap: WorldMap = { schemaVersion: 1, bounds, colliders: [wall('trunk', 5, 5, 0.5, 1.5)] };
      const clonedMap: WorldMap = { schemaVersion: 1, bounds, colliders: [...wallMap.colliders] };
      const input = [{ playerId: 'local', direction: { x: 1, z: 0 }, sequence: 1 }];
      const state = createWorldState([{ id: 'local', position: { x: 3, z: 5 }, radius: 0.5 }]);
      const first = simulateTick(state, wallMap, input, 0.1);
      /* Segundo tick con la misma referencia: rama de caché; mapa clonado: rebuild. */
      const nextInput = [{ playerId: 'local', direction: { x: 1, z: 0 }, sequence: 2 }];
      const cached = simulateTick(first, wallMap, nextInput, 0.1);
      const rebuilt = simulateTick(first, clonedMap, nextInput, 0.1);
      expect(cached).toEqual(rebuilt);
      expect(cached.players.local.position.x).toBeLessThanOrEqual(4.25);
    });

    it('reconstruye el índice al cruzar el umbral de granularidad (cellSize)', () => {
      const state = createWorldState([{ id: 'local', position: { x: 5, z: 5 }, radius: 0.5 }]);
      const input = [{ playerId: 'local', direction: { x: 1, z: 0 }, sequence: 1 }];
      /* cellSize = max(maxSubstepDistance, 1): 0.5 → 1 y 2.0 → 2 cruzan el
       * umbral, forzando la rama de reconstrucción de la caché (R7). */
      const fine = {
        speedUnitsPerSecond: 4,
        maxDeltaSeconds: 0.1,
        maxSubstepDistance: 0.5,
      } as const;
      const coarse = {
        speedUnitsPerSecond: 4,
        maxDeltaSeconds: 0.1,
        maxSubstepDistance: 2,
      } as const;
      const ticked = simulateTick(state, emptyMap, input, 0.1, fine);
      const switched = simulateTick(
        ticked,
        emptyMap,
        [{ playerId: 'local', direction: { x: 1, z: 0 }, sequence: 2 }],
        0.1,
        coarse,
      );
      expect(switched.players.local.position.x).toBeCloseTo(5.8, 8);
      expect(switched.players.local.position.z).toBeCloseTo(5, 8);
    });
  });
});
