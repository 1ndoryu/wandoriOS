/* GAME-01 — Validación pura y fail-closed del documento lógico de mapa. */

import type { MapBounds, WorldMap } from './contracts';

export const WORLD_LIMITS = {
  maxWidth: 4096,
  maxDepth: 4096,
  maxColliders: 10_000,
  maxColliderSize: 256,
} as const;

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function readBounds(value: unknown): { readonly bounds?: MapBounds; readonly issues: ValidationIssue[] } {
  if (!isRecord(value)) {
    return { issues: [{ path: 'bounds', message: 'debe ser un objeto' }] };
  }
  const minX = value.minX;
  const maxX = value.maxX;
  const minZ = value.minZ;
  const maxZ = value.maxZ;
  if (!isFiniteNumber(minX) || !isFiniteNumber(maxX)
    || !isFiniteNumber(minZ) || !isFiniteNumber(maxZ)) {
    return { issues: [{ path: 'bounds', message: 'los límites deben ser números finitos' }] };
  }
  return { bounds: { minX, maxX, minZ, maxZ }, issues: [] };
}

function validateBounds(bounds: MapBounds): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (bounds.minX >= bounds.maxX || bounds.minZ >= bounds.maxZ) {
    issues.push({ path: 'bounds', message: 'cada mínimo debe ser menor que su máximo' });
  }
  if (bounds.maxX - bounds.minX > WORLD_LIMITS.maxWidth) {
    issues.push({ path: 'bounds.width', message: `supera ${WORLD_LIMITS.maxWidth} unidades` });
  }
  if (bounds.maxZ - bounds.minZ > WORLD_LIMITS.maxDepth) {
    issues.push({ path: 'bounds.depth', message: `supera ${WORLD_LIMITS.maxDepth} unidades` });
  }
  return issues;
}

function validateShape(value: unknown, index: number, bounds: MapBounds): ValidationIssue[] {
  const path = `colliders[${index}]`;
  if (!isRecord(value)) return [{ path, message: 'debe ser un objeto' }];
  const issues: ValidationIssue[] = [];
  if (typeof value.id !== 'string' || !value.id.trim()) {
    issues.push({ path: `${path}.id`, message: 'requiere un id' });
  }
  const position = value.position;
  if (!isRecord(position) || !isFiniteNumber(position.x) || !isFiniteNumber(position.z)) {
    issues.push({ path: `${path}.position`, message: 'requiere coordenadas finitas' });
  }

  const shape = value.shape;
  let halfWidth: number | undefined;
  let halfDepth: number | undefined;
  if (!isRecord(shape) || typeof shape.kind !== 'string') {
    issues.push({ path: `${path}.shape`, message: 'requiere una forma permitida' });
  } else if (shape.kind === 'circle') {
    if (!isFiniteNumber(shape.radius) || shape.radius <= 0 || shape.radius > WORLD_LIMITS.maxColliderSize) {
      issues.push({ path: `${path}.shape.radius`, message: 'radio fuera de límites' });
    } else {
      halfWidth = shape.radius;
      halfDepth = shape.radius;
    }
  } else if (shape.kind === 'aabb') {
    const shapeHalfWidth = shape.halfWidth;
    const shapeHalfDepth = shape.halfDepth;
    if (!isFiniteNumber(shapeHalfWidth) || !isFiniteNumber(shapeHalfDepth)
      || shapeHalfWidth <= 0 || shapeHalfDepth <= 0
      || shapeHalfWidth > WORLD_LIMITS.maxColliderSize
      || shapeHalfDepth > WORLD_LIMITS.maxColliderSize) {
      issues.push({ path: `${path}.shape`, message: 'dimensiones AABB fuera de límites' });
    } else {
      halfWidth = shapeHalfWidth;
      halfDepth = shapeHalfDepth;
    }
  } else {
    issues.push({ path: `${path}.shape.kind`, message: 'forma no permitida' });
  }

  if (isRecord(position) && isFiniteNumber(position.x) && isFiniteNumber(position.z)
    && halfWidth !== undefined && halfDepth !== undefined
    && (position.x - halfWidth < bounds.minX
      || position.x + halfWidth > bounds.maxX
      || position.z - halfDepth < bounds.minZ
      || position.z + halfDepth > bounds.maxZ)) {
    issues.push({ path: `${path}.position`, message: 'el collider debe quedar dentro de bounds' });
  }
  return issues;
}

export function validateWorldMap(map: unknown): readonly ValidationIssue[] {
  if (!isRecord(map)) return [{ path: 'map', message: 'debe ser un objeto' }];
  const issues: ValidationIssue[] = [];
  if (map.schemaVersion !== 1) {
    issues.push({ path: 'schemaVersion', message: 'versión de esquema no soportada' });
  }
  const result = readBounds(map.bounds);
  issues.push(...result.issues);
  if (!result.bounds) return issues;
  issues.push(...validateBounds(result.bounds));

  if (!Array.isArray(map.colliders)) {
    issues.push({ path: 'colliders', message: 'debe ser una lista' });
    return issues;
  }
  if (map.colliders.length > WORLD_LIMITS.maxColliders) {
    issues.push({ path: 'colliders', message: `supera ${WORLD_LIMITS.maxColliders} elementos` });
    return issues;
  }
  const ids = new Set<string>();
  map.colliders.forEach((collider, index) => {
    if (isRecord(collider) && typeof collider.id === 'string') {
      if (ids.has(collider.id)) issues.push({ path: `colliders[${index}].id`, message: 'id duplicado' });
      ids.add(collider.id);
    }
    issues.push(...validateShape(collider, index, result.bounds!));
  });
  return issues;
}

export function assertValidWorldMap(map: unknown): asserts map is WorldMap {
  const issues = validateWorldMap(map);
  if (issues.length > 0) {
    throw new Error(`Mapa inválido: ${issues.map(issue => `${issue.path} ${issue.message}`).join('; ')}`);
  }
}
