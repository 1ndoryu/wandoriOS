import { describe, expect, it } from 'vitest';
import {
  ADD_INSTANCE_DEFAULT_SCALE,
  assetInstanceCounts,
  categoryInstanceCounts,
  editMapVersionObjects,
  instancesByCategory,
  removeInstancesIfPresent,
} from './map-edits';
import { buildMapVersionFromOptions, parseSerializedWorld, serializeWorld } from './map-builder';
import { validateMapVersion } from './map-version';
import { terrainOptionsPreset } from './procedural/terrain-options';

function buildFixtureMap() {
  return buildMapVersionFromOptions({ ...terrainOptionsPreset('isla'), style: 'bloques', seed: 7 });
}

describe('edición pura de objetos del mundo (138A-8)', () => {
  it('mueve una instancia existente y mantiene el documento válido', () => {
    const map = buildFixtureMap();
    const before = map.instances[0];
    const next = editMapVersionObjects(map, [{ kind: 'move', id: before.id, position: { x: 2.5, z: -1.25 } }]);
    const moved = next.instances.find(instance => instance.id === before.id);
    expect(moved?.position).toEqual({ x: 2.5, z: -1.25 });
    expect(next.instances.length).toBe(map.instances.length);
    expect(map.instances[0].position).toEqual(before.position);
    expect(validateMapVersion(next)).toEqual([]);
  });

  it('recorta posiciones a bounds con el margen del collider (paridad builder)', () => {
    const map = buildFixtureMap();
    const target = map.instances[0];
    const next = editMapVersionObjects(map, [{ kind: 'move', id: target.id, position: { x: 999, z: -999 } }]);
    const moved = next.instances.find(instance => instance.id === target.id);
    const bounds = map.terrain.bounds;
    expect(moved!.position.x).toBeLessThanOrEqual(bounds.maxX);
    expect(moved!.position.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(moved!.position.z).toBeLessThanOrEqual(bounds.maxZ);
    expect(moved!.position.z).toBeGreaterThanOrEqual(bounds.minZ);
    expect(validateMapVersion(next)).toEqual([]);
  });

  it('añade una instancia nueva con id único y escala por defecto', () => {
    const map = buildFixtureMap();
    const assetId = 'asset-rock';
    const next = editMapVersionObjects(map, [{
      kind: 'add',
      assetVersionId: assetId,
      position: { x: 0, z: 0 },
    }]);
    expect(next.instances.length).toBe(map.instances.length + 1);
    const added = next.instances[next.instances.length - 1];
    expect(added.assetVersionId).toBe(assetId);
    expect(added.scale).toBe(ADD_INSTANCE_DEFAULT_SCALE);
    expect(added.id).toMatch(/^inst-\d+$/);
    expect(next.instances.filter(instance => instance.id === added.id)).toHaveLength(1);
    expect(validateMapVersion(next)).toEqual([]);
  });

  it('cambia la escala con cuotas y quita instancias por id', () => {
    const map = buildFixtureMap();
    const target = map.instances[0];
    const scaled = editMapVersionObjects(map, [{ kind: 'setScale', id: target.id, scale: 2.25 }]);
    expect(scaled.instances.find(instance => instance.id === target.id)?.scale).toBe(2.25);

    const removed = editMapVersionObjects(scaled, [{ kind: 'remove', id: target.id }]);
    expect(removed.instances.find(instance => instance.id === target.id)).toBeUndefined();
    expect(removed.instances.length).toBe(map.instances.length - 1);
    expect(validateMapVersion(removed)).toEqual([]);
  });

  it('falla cerrado ante ids desconocidos, assets inexistentes y escala fuera de límites', () => {
    const map = buildFixtureMap();
    expect(() => editMapVersionObjects(map, [{ kind: 'move', id: 'inst-999', position: { x: 0, z: 0 } }]))
      .toThrow(/instancia desconocida/);
    expect(() => editMapVersionObjects(map, [{ kind: 'remove', id: 'nope' }]))
      .toThrow(/instancia desconocida/);
    expect(() => editMapVersionObjects(map, [{ kind: 'add', assetVersionId: 'asset-missing', position: { x: 0, z: 0 } }]))
      .toThrow(/asset desconocido/);
    expect(() => editMapVersionObjects(map, [{ kind: 'setScale', id: map.instances[0].id, scale: 99 }]))
      .toThrow(/escala fuera/);
  });

  it('respeta la cuota máxima de instancias (fail-closed)', () => {
    const map = buildFixtureMap();
    const target = map.instances[0];
    const ops = Array.from({ length: 20_000 }, () => ({
      kind: 'add' as const,
      assetVersionId: 'asset-rock',
      position: { x: 0, z: 0 },
    }));
    expect(() => editMapVersionObjects(map, ops)).toThrow(/cuota de instancias/);
    expect(target.id).toBeTruthy();
  });

  it('quita solo las instancias presentes e ignora ids desconocidos (138A-14)', () => {
    const map = buildFixtureMap();
    const target = map.instances[0];
    const next = removeInstancesIfPresent(map, [target.id, 'inst-9999', 'nope']);
    expect(next.instances.find(instance => instance.id === target.id)).toBeUndefined();
    expect(next.instances.length).toBe(map.instances.length - 1);
    expect(validateMapVersion(next)).toEqual([]);
    /* Sin ids pendientes devuelve el mismo documento sin copias. */
    expect(removeInstancesIfPresent(map, [])).toBe(map);
  });

  it('una instancia quitada no reaparece al exportar/importar el mundo (138A-14)', () => {
    const map = buildFixtureMap();
    const target = map.instances[0];
    const edited = editMapVersionObjects(map, [{ kind: 'remove', id: target.id }]);
    const text = serializeWorld(terrainOptionsPreset('isla'), edited);
    const parsed = parseSerializedWorld(text);
    expect(parsed.map.instances.find(instance => instance.id === target.id)).toBeUndefined();
    expect(parsed.map.instances.length).toBe(edited.instances.length);
  });

  it('cuenta instancias por asset y por categoría', () => {
    const map = buildFixtureMap();
    const byAsset = assetInstanceCounts(map);
    expect(Object.values(byAsset).reduce((sum, count) => sum + count, 0)).toBe(map.instances.length);
    const byCategory = categoryInstanceCounts(map);
    expect(byCategory.tree + byCategory.rock).toBe(map.instances.length);
    expect(instancesByCategory(map, 'tree').length).toBe(byCategory.tree);
    expect(instancesByCategory(map, 'water')).toEqual([]);
  });
});
