/* GAME-01 — Colisiones simples del plano lógico X/Z. */

import type { MapBounds, StaticCollider, Vector2 } from './contracts';
import type { SpatialEntry, SpatialHash } from './spatial-hash';
import { GAME_CORE_LIMITS } from './limits';

const EPSILON = 1e-9;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function circleIntersectsCollider(position: Vector2, radius: number, collider: StaticCollider): boolean {
  if (collider.shape.kind === 'circle') {
    const dx = position.x - collider.position.x;
    const dz = position.z - collider.position.z;
    const combined = radius + collider.shape.radius;
    return dx * dx + dz * dz < combined * combined - EPSILON;
  }
  const minX = collider.position.x - collider.shape.halfWidth;
  const maxX = collider.position.x + collider.shape.halfWidth;
  const minZ = collider.position.z - collider.shape.halfDepth;
  const maxZ = collider.position.z + collider.shape.halfDepth;
  const nearestX = clamp(position.x, minX, maxX);
  const nearestZ = clamp(position.z, minZ, maxZ);
  const dx = position.x - nearestX;
  const dz = position.z - nearestZ;
  return dx * dx + dz * dz < radius * radius - EPSILON;
}

function collides(
  position: Vector2,
  radius: number,
  collidersById: ReadonlyMap<string, StaticCollider>,
  index: SpatialHash<SpatialEntry>,
): boolean {
  const nearby = index.queryAabb(position.x - radius, position.x + radius, position.z - radius, position.z + radius);
  return nearby.some(entry => {
    const collider = collidersById.get(entry.id);
    if (!collider) return false;
    /* El query ya acota por hash; la prueba exacta conserva la forma original. */
    return circleIntersectsCollider(position, radius, collider);
  });
}

function insideBounds(position: Vector2, radius: number, bounds: MapBounds): boolean {
  return position.x - radius >= bounds.minX
    && position.x + radius <= bounds.maxX
    && position.z - radius >= bounds.minZ
    && position.z + radius <= bounds.maxZ;
}

export function moveCircle(
  start: Vector2,
  delta: Vector2,
  radius: number,
  bounds: MapBounds,
  colliders: readonly StaticCollider[],
  index: SpatialHash<SpatialEntry>,
  maxSubstepDistance: number,
): Vector2 {
  if (!Number.isFinite(maxSubstepDistance) || maxSubstepDistance <= 0) throw new Error('maxSubstepDistance inválido');
  if (!Number.isFinite(start.x) || !Number.isFinite(start.z)
    || !Number.isFinite(delta.x) || !Number.isFinite(delta.z)
    || !Number.isFinite(radius) || radius <= 0) {
    throw new Error('movimiento inválido');
  }
  if (!insideBounds(start, radius, bounds)) throw new Error('inicio fuera de bounds');
  const collidersById = new Map(colliders.map(collider => [collider.id, collider]));
  const distance = Math.hypot(delta.x, delta.z);
  const steps = Math.max(1, Math.ceil(distance / maxSubstepDistance));
  if (steps > GAME_CORE_LIMITS.maxSubstepsPerMove) {
    throw new Error(`movimiento demasiado grande: ${steps} subpasos`);
  }
  const step = { x: delta.x / steps, z: delta.z / steps };
  let position = start;
  for (let i = 0; i < steps; i += 1) {
    const candidateX = { x: position.x + step.x, z: position.z };
    if (insideBounds(candidateX, radius, bounds) && !collides(candidateX, radius, collidersById, index)) {
      position = candidateX;
    }
    const candidateZ = { x: position.x, z: position.z + step.z };
    if (insideBounds(candidateZ, radius, bounds) && !collides(candidateZ, radius, collidersById, index)) {
      position = candidateZ;
    }
  }
  return position;
}
