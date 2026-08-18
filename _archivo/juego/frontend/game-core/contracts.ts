/* GAME-01 — Contratos puros del mundo lógico.
 * Este módulo no conoce DOM, Three.js, red ni persistencia. El plano lógico usa
 * X/Z para que el mismo contrato pueda validarse en frontend y backend. */

export interface Vector2 {
  readonly x: number;
  readonly z: number;
}

export interface MapBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface CircleShape {
  readonly kind: 'circle';
  readonly radius: number;
}

export interface AabbShape {
  readonly kind: 'aabb';
  readonly halfWidth: number;
  readonly halfDepth: number;
}

export type ColliderShape = CircleShape | AabbShape;

/** Obstáculos estáticos del mapa. La colisión jugador-jugador queda fuera
 * de este contrato inicial y se definirá junto con realtime/presencia. */
export interface StaticCollider {
  readonly id: string;
  readonly position: Vector2;
  readonly shape: ColliderShape;
}

export interface WorldMap {
  readonly schemaVersion: 1;
  readonly bounds: MapBounds;
  readonly colliders: readonly StaticCollider[];
}

export interface PlayerState {
  readonly id: string;
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly radius: number;
  readonly characterId: string;
}

export interface WorldState {
  readonly tick: number;
  readonly players: Readonly<Record<string, PlayerState>>;
  readonly lastInputSequence: Readonly<Record<string, number>>;
}

export interface MoveInput {
  readonly playerId: string;
  readonly direction: Vector2;
  readonly sequence: number;
}

export interface SimulationConfig {
  readonly speedUnitsPerSecond: number;
  readonly maxDeltaSeconds: number;
  readonly maxSubstepDistance: number;
}

export interface SnapshotEntity {
  readonly id: string;
  readonly position: Vector2;
  readonly velocity: Vector2;
  readonly radius: number;
  /** ID del personaje del catálogo; el presentador lo mapea a su tono. */
  readonly characterId: string;
}

export interface WorldSnapshot {
  readonly tick: number;
  readonly entities: readonly SnapshotEntity[];
}
