/* GAME-01 — Interpolación pura de snapshots server-authoritative. */

import type { SnapshotEntity, Vector2, WorldSnapshot } from './contracts';

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function lerp(a: number, b: number, alpha: number): number {
  return a + (b - a) * alpha;
}

function lerpVector(a: Vector2, b: Vector2, alpha: number): Vector2 {
  return { x: lerp(a.x, b.x, alpha), z: lerp(a.z, b.z, alpha) };
}

export function interpolateSnapshots(
  previous: WorldSnapshot,
  next: WorldSnapshot,
  alpha: number,
): WorldSnapshot {
  const t = clamp01(Number.isFinite(alpha) ? alpha : 0);
  const previousById = new Map(previous.entities.map(entity => [entity.id, entity]));
  const entities: SnapshotEntity[] = next.entities.map(entity => {
    const before = previousById.get(entity.id);
    if (!before) return entity;
    return {
      ...entity,
      position: lerpVector(before.position, entity.position, t),
      velocity: lerpVector(before.velocity, entity.velocity, t),
    };
  });
  return { tick: next.tick, entities };
}

export function snapshotFromState(state: { tick: number; players: Readonly<Record<string, SnapshotEntity>> }): WorldSnapshot {
  return {
    tick: state.tick,
    entities: Object.values(state.players)
      .map(entity => ({ ...entity }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  };
}
