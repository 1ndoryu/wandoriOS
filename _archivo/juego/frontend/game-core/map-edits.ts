/* 138A-8 — Edición pura de objetos del mundo (transform, sin modelos).
 * Capa posterior a la generación: mover/colocar/quitar instancias del
 * MapVersion con cuotas fail-closed y validación del documento final.
 * Sin Three/DOM/red; las posiciones se recortan a bounds (mismo margen que
 * el builder) para que el documento siga siendo válido al exportar. */

import type { Vector2 } from './contracts';
import {
  MAP_VERSION_LIMITS,
  assertValidMapVersion,
  type AssetCategory,
  type AssetInstance,
  type GameAssetVersion,
  type MapVersion,
} from './map-version';

export type MapEditOp =
  | { readonly kind: 'move'; readonly id: string; readonly position: Vector2 }
  | {
    readonly kind: 'add';
    readonly assetVersionId: string;
    readonly position: Vector2;
    readonly scale?: number;
    readonly rotationY?: number;
  }
  | { readonly kind: 'remove'; readonly id: string }
  | { readonly kind: 'setScale'; readonly id: string; readonly scale: number };

/** Escala por defecto de instancias nuevas (paridad con el rango reducido). */
export const ADD_INSTANCE_DEFAULT_SCALE = 0.5;

/** Aplica una lista de operaciones sobre el MapVersion y devuelve uno nuevo. */
export function editMapVersionObjects(map: MapVersion, ops: readonly MapEditOp[]): MapVersion {
  let instances: AssetInstance[] = [...map.instances];
  const ids = new Set(instances.map(instance => instance.id));
  /* Contador de ids arranca por encima del máximo existente: genera ids
   * únicos sin re-escanear el Set completo en cada `add` (el escaneo por
   * operación era O(n²) con la cuota de 10.000 instancias). */
  let nextNumber = maxInstanceNumber(ids);
  for (const op of ops) {
    if (op.kind === 'move') {
      assertKnownId(ids, op.id);
      instances = instances.map(instance => instance.id === op.id
        ? { ...instance, position: clampPosition(map, instance, op.position) }
        : instance);
    } else if (op.kind === 'setScale') {
      assertKnownId(ids, op.id);
      assertScale(op.scale);
      instances = instances.map(instance => instance.id === op.id
        ? { ...instance, scale: round3(op.scale) }
        : instance);
    } else if (op.kind === 'remove') {
      assertKnownId(ids, op.id);
      instances = instances.filter(instance => instance.id !== op.id);
      ids.delete(op.id);
    } else {
      const asset = map.assetManifest[op.assetVersionId];
      if (!asset) throw new Error(`asset desconocido: ${op.assetVersionId}`);
      if (instances.length >= MAP_VERSION_LIMITS.maxInstances) {
        throw new Error('cuota de instancias agotada');
      }
      const scale = round3(op.scale ?? ADD_INSTANCE_DEFAULT_SCALE);
      assertScale(scale);
      nextNumber += 1;
      const id = `inst-${nextNumber}`;
      const position = clampPosition(map, {
        id,
        assetVersionId: op.assetVersionId,
        position: { x: 0, z: 0 },
        rotationY: 0,
        scale,
        terrainAnchor: 'surface',
      }, op.position);
      const instance: AssetInstance = {
        id,
        assetVersionId: op.assetVersionId,
        position,
        rotationY: round3(op.rotationY ?? 0),
        scale,
        terrainAnchor: 'surface',
      };
      instances.push(instance);
      ids.add(id);
    }
  }
  const next: MapVersion = { ...map, instances };
  /* Fail-closed: el documento editado debe seguir siendo un MapVersion válido
   * (bounds, cuotas, referencias de assets y transforms). */
  assertValidMapVersion(next);
  return next;
}

/** Cuenta instancias por asset del manifiesto (para el panel de Assets). */
export function assetInstanceCounts(
  map: MapVersion,
): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const instance of map.instances) {
    counts[instance.assetVersionId] = (counts[instance.assetVersionId] ?? 0) + 1;
  }
  return counts;
}

/** Cuenta instancias por categoría de asset (árboles, rocas, agua…). */
export function categoryInstanceCounts(
  map: MapVersion,
): Readonly<Record<AssetCategory, number>> {
  const counts: Record<AssetCategory, number> = {
    terrain: 0,
    tree: 0,
    rock: 0,
    water: 0,
    character: 0,
    generic: 0,
  };
  for (const instance of map.instances) {
    const asset = map.assetManifest[instance.assetVersionId];
    if (asset) counts[asset.category] += 1;
  }
  return counts;
}

/** Lista las instancias de una categoría (para quitar individualmente). */
export function instancesByCategory(
  map: MapVersion,
  category: AssetCategory,
): readonly AssetInstance[] {
  return map.instances.filter(instance => map.assetManifest[instance.assetVersionId]?.category === category);
}

/** [138A-14] Quita SOLO las instancias que existen en el documento actual.
 *  A diferencia de `editMapVersionObjects` (fail-closed), los ids que ya no
 *  están presentes se ignoran en silencio: tras regenerar el mundo desde las
 *  opciones, un id eliminado puede no reaparecer si cambió seed/densidad y no
 *  debe romper la restauración. Mantiene el documento válido. */
export function removeInstancesIfPresent(
  map: MapVersion,
  ids: readonly string[],
): MapVersion {
  if (ids.length === 0) return map;
  const removed = new Set(ids);
  const next: MapVersion = {
    ...map,
    instances: map.instances.filter(instance => !removed.has(instance.id)),
  };
  assertValidMapVersion(next);
  return next;
}

function assertKnownId(ids: ReadonlySet<string>, id: string): void {
  if (!ids.has(id)) throw new Error(`instancia desconocida: ${id}`);
}

function assertScale(scale: number): void {
  if (!Number.isFinite(scale)
    || scale < MAP_VERSION_LIMITS.minScale || scale > MAP_VERSION_LIMITS.maxScale) {
    throw new Error(`escala fuera de límites: ${scale}`);
  }
}

/** Recorta la posición al rect del collider con margen (paridad builder). */
function clampPosition(map: MapVersion, instance: AssetInstance, position: Vector2): Vector2 {
  const bounds = map.terrain.bounds;
  const asset: GameAssetVersion | undefined = map.assetManifest[instance.assetVersionId];
  const proxy = asset?.collisionProxy;
  const half = proxy
    ? (proxy.kind === 'circle'
      ? proxy.radius
      : Math.max(proxy.halfWidth, proxy.halfDepth)) * instance.scale
    : 0;
  const clamp = (v: number, bound: number): number => {
    const margin = Math.min(half, bound - 0.1) + 0.001;
    return Math.min(bound - margin, Math.max(-bound + margin, v));
  };
  return {
    x: round3(clamp(position.x, bounds.maxX)),
    z: round3(clamp(position.z, bounds.maxZ)),
  };
}

/** Máximo número de `inst-<n>` presente en el documento (o -1 si no hay). */
function maxInstanceNumber(existing: ReadonlySet<string>): number {
  let max = -1;
  for (const id of existing) {
    const match = /^inst-(\d+)$/.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
