/* GAME-01 — Cache visual acotado del fixture.
 * El loader lógico decide qué está visible; este adaptador materializa chunks
 * visibles y agrupa sólidos repetidos con InstancedMesh. Los contornos siguen
 * siendo clones de LineSegments para conservar la gramática visual del bosque.
 * SRP: ciclo de vida de la escena; el batching por materiales vive en
 * game-playable-visual-cache-batching y los helpers geométricos en
 * game-playable-visual-cache-utils. */

import * as THREE from 'three';
import {
  buildTerrainMeshData,
  type AssetInstance,
  type MapVersion,
  type VisibleMapContent,
} from '../../../game-core';
import {
  createCurvedPond,
  createCurvedRock,
  createCurvedTree,
  type ForestMaterials,
} from '../game-shared/forest-models';
import type { FixtureProp } from './game-fixture-map';
import {
  groupMeshesByMaterial,
  type PrototypeMeshGroup,
} from './game-playable-visual-cache-batching';
import {
  applyOutlineTransform,
  disposeObjectGeometries,
  surfaceMaterialIndex,
} from './game-playable-visual-cache-utils';

export { groupMeshesByMaterial } from './game-playable-visual-cache-batching';

export const VISUAL_CACHE_LIMITS = {
  maxInstancesPerKind: 128,
  maxCachedTerrainChunks: 12,
} as const;

export interface GamePlayableVisualCacheOptions {
  readonly scene: THREE.Scene;
  readonly materials: ForestMaterials;
  readonly map: MapVersion;
  readonly props: ReadonlyMap<string, FixtureProp>;
  /* [CURVED-ISLAND] Override temporal: oculta los chunks del fixture para
   * dejar sitio a la isla de la referencia. Solo afecta a la presentación. */
  readonly hideTerrain?: boolean;
}

interface VisibleProp {
  readonly prop: FixtureProp;
  readonly instance: AssetInstance;
}

interface InstancedPropBatch {
  readonly kind: FixtureProp['kind'];
  readonly prototype: THREE.Group;
  readonly meshes: readonly THREE.InstancedMesh[];
  /** Matrices locales alineadas con `meshes`; cada entrada agrupa las matrices
   * de TODOS los meshes del prototipo fusionados en ese InstancedMesh por
   * compartir geometría+material. count = instancias × matrices locales. */
  readonly localMatrixGroups: readonly (readonly THREE.Matrix4[])[];
  readonly helper: THREE.Object3D;
}

export function createGamePlayableVisualCache(options: GamePlayableVisualCacheOptions): GamePlayableVisualCache {
  return new GamePlayableVisualCache(options);
}

export class GamePlayableVisualCache {
  private readonly terrainObjects = new Map<string, THREE.Mesh>();
  private readonly terrainRecency: string[] = [];
  private readonly outlineObjects = new Map<string, THREE.Group>();
  private readonly batches = new Map<FixtureProp['kind'], InstancedPropBatch>();
  private destroyed = false;

  public constructor(private readonly options: GamePlayableVisualCacheOptions) {
    for (const kind of ['conifer', 'broadleaf', 'rock', 'pond'] as const) {
      this.batches.set(kind, this.createBatch(kind));
    }
  }

  public sync(content: VisibleMapContent): void {
    if (this.destroyed) return;
    const activeChunks = new Set(content.chunkKeys);
    for (const chunk of content.chunks) {
      const key = `${chunk.x}:${chunk.z}`;
      const terrain = this.terrainObjects.get(key) ?? this.createTerrain(key, chunk);
      this.touchTerrain(key);
      if (!terrain.parent) this.options.scene.add(terrain);
    }
    for (const [key, terrain] of this.terrainObjects) {
      if (activeChunks.has(key)) continue;
      this.options.scene.remove(terrain);
    }
    this.evictTerrain(activeChunks);

    const instancesByKind = new Map<FixtureProp['kind'], VisibleProp[]>();
    for (const kind of this.batches.keys()) instancesByKind.set(kind, []);
    for (const instance of content.instances) {
      const prop = this.options.props.get(instance.id);
      if (!prop) continue;
      const props = instancesByKind.get(prop.kind);
      if (props && props.length < VISUAL_CACHE_LIMITS.maxInstancesPerKind) {
        props.push({ prop, instance });
      }
    }

    for (const [kind, batch] of this.batches) {
      this.syncBatch(batch, instancesByKind.get(kind) ?? []);
    }
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const outline of this.outlineObjects.values()) this.options.scene.remove(outline);
    for (const terrain of this.terrainObjects.values()) {
      this.options.scene.remove(terrain);
      terrain.geometry.dispose();
    }
    for (const batch of this.batches.values()) {
      for (const mesh of batch.meshes) this.options.scene.remove(mesh);
      disposeObjectGeometries(batch.prototype);
    }
    this.terrainObjects.clear();
    this.terrainRecency.length = 0;
    this.outlineObjects.clear();
    this.batches.clear();
  }

  /** Número de InstancedMesh activos por material agrupado. Evidencia el
   * ahorro del batching por materiales (meshes del prototipo que comparten
   * geometría+material se fusionan en un solo draw call instanciado). */
  public batchDrawCallCount(): number {
    return Array.from(this.batches.values())
      .reduce((total, batch) => total + batch.meshes.length, 0);
  }

  /** Número total de meshes fuente del prototipo (sin fusión) para comparar
   * contra `batchDrawCallCount()` y medir el ahorro real del batching. */
  public batchSourceMeshCount(): number {
    return Array.from(this.batches.values())
      .reduce((total, batch) => total + batch.localMatrixGroups.reduce(
        (sum, group) => sum + group.length,
        0,
      ), 0);
  }

  private createTerrain(key: string, chunk: MapVersion['terrain']['chunks'][number]): THREE.Mesh {
    const data = buildTerrainMeshData(
      chunk,
      this.options.map.terrain.cellSize,
      this.options.map.terrain.bounds.minX,
      this.options.map.terrain.bounds.minZ,
    );
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    geometry.clearGroups();
    for (let cell = 0; cell < data.surfaces.length; cell += 1) {
      geometry.addGroup(cell * 6, 6, surfaceMaterialIndex(data.surfaces[cell]));
    }
    geometry.computeVertexNormals();
    const material = [this.options.materials.pale, this.options.materials.water, this.options.materials.middle];
    const terrain = new THREE.Mesh(geometry, material);
    terrain.visible = !this.options.hideTerrain;
    terrain.receiveShadow = true;
    terrain.userData.chunkKey = key;
    this.terrainObjects.set(key, terrain);
    return terrain;
  }

  private createBatch(kind: FixtureProp['kind']): InstancedPropBatch {
    const prototype = this.createPrototype(kind);
    prototype.updateMatrixWorld(true);
    const groups = this.groupPrototypeMeshes(prototype);
    const meshes: THREE.InstancedMesh[] = [];
    const localMatrixGroups: (readonly THREE.Matrix4[])[] = [];
    for (const group of groups) {
      /* Batching por materiales: todos los meshes del prototipo que comparten
       * la misma geometría+material se dibujan con UN solo InstancedMesh.
       * count = instancias visibles × meshes fusionados; cada bloque de
       * matrices usa la matriz local del mesh correspondiente. */
      const capacity = VISUAL_CACHE_LIMITS.maxInstancesPerKind * group.localMatrices.length;
      const mesh = new THREE.InstancedMesh(group.geometry, group.material, capacity);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;
      this.options.scene.add(mesh);
      meshes.push(mesh);
      localMatrixGroups.push(group.localMatrices);
    }
    return { kind, prototype, meshes, localMatrixGroups, helper: new THREE.Object3D() };
  }

  private groupPrototypeMeshes(prototype: THREE.Group): PrototypeMeshGroup[] {
    return groupMeshesByMaterial(prototype);
  }

  private syncBatch(batch: InstancedPropBatch, visibleProps: readonly VisibleProp[]): void {
    const activeIds = new Set(visibleProps.map(({ prop }) => prop.id));
    for (const [id, outline] of this.outlineObjects) {
      const prop = this.options.props.get(id);
      if (prop && prop.kind === batch.kind && !activeIds.has(id)) {
        this.options.scene.remove(outline);
        this.outlineObjects.delete(id);
      }
    }

    for (const [index, { prop, instance }] of visibleProps.entries()) {
      const helper = batch.helper;
      helper.position.set(
        instance.position.x,
        prop.kind === 'pond' ? 0 : 0.15,
        instance.position.z,
      );
      /* createRock() aporta una rotación base 0.8 al prototipo; la matriz de
       * instancia añade el giro editorial y el delta artístico de escala. */
      helper.rotation.set(
        0,
        instance.rotationY + (prop.kind === 'rock' ? (instance.scale - 1) * 0.8 : 0),
        0,
      );
      const scale = instance.scale;
      helper.scale.set(
        prop.kind === 'pond' ? (prop.width ?? 1) * scale : scale,
        prop.kind === 'pond' ? (prop.depth ?? 1) * scale : scale,
        prop.kind === 'pond' ? 1 : scale,
      );
      helper.updateMatrix();
      for (const [meshIndex, mesh] of batch.meshes.entries()) {
        const localMatrices = batch.localMatrixGroups[meshIndex];
        for (let local = 0; local < localMatrices.length; local += 1) {
          const matrix = helper.matrix.clone().multiply(localMatrices[local]);
          mesh.setMatrixAt(index * localMatrices.length + local, matrix);
        }
      }
      const outline = this.outlineObjects.get(prop.id);
      if (outline) {
        applyOutlineTransform(outline, prop, instance);
      } else {
        this.createOutline(prop, instance, batch.prototype);
      }
    }
    for (const [meshIndex, mesh] of batch.meshes.entries()) {
      mesh.count = visibleProps.length * batch.localMatrixGroups[meshIndex].length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.count > 0) mesh.computeBoundingSphere();
    }
  }

  private createOutline(
    prop: FixtureProp,
    instance: AssetInstance,
    prototype: THREE.Group,
  ): void {
    const content = prototype.clone(true);
    const meshes: THREE.Object3D[] = [];
    content.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    meshes.forEach(mesh => mesh.removeFromParent());
    const outline = new THREE.Group();
    outline.add(content);
    applyOutlineTransform(outline, prop, instance);
    outline.userData.instanceId = prop.id;
    outline.userData.assetVersionId = prop.assetVersionId;
    this.options.scene.add(outline);
    this.outlineObjects.set(prop.id, outline);
  }

  private touchTerrain(key: string): void {
    const index = this.terrainRecency.indexOf(key);
    if (index >= 0) this.terrainRecency.splice(index, 1);
    this.terrainRecency.push(key);
  }

  private evictTerrain(activeChunks: ReadonlySet<string>): void {
    while (this.terrainObjects.size > VISUAL_CACHE_LIMITS.maxCachedTerrainChunks) {
      const oldest = this.terrainRecency.find(key => !activeChunks.has(key));
      if (oldest === undefined) return;
      const index = this.terrainRecency.indexOf(oldest);
      if (index >= 0) this.terrainRecency.splice(index, 1);
      const terrain = this.terrainObjects.get(oldest);
      if (!terrain) continue;
      terrain.geometry.dispose();
      this.terrainObjects.delete(oldest);
    }
  }

  private createPrototype(kind: FixtureProp['kind']): THREE.Group {
    const { materials } = this.options;
    return kind === 'conifer' || kind === 'broadleaf'
      ? createCurvedTree(materials)
      : kind === 'rock'
        ? createCurvedRock(materials)
        : createCurvedPond(materials);
  }

}
