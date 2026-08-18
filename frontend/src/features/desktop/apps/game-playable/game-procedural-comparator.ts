/* GAME-01 — Comparador visual del toolkit procedural (138A-1/138A-2, 138A-4).
 * Monta la misma base de altura en dos estilos ('bloques' reutiliza el mesher
 * 128A-1 vía adaptador; 'suave' usa heightfield-mesh + vegetación low-poly).
 * Desde 138A-4 acepta `TerrainOptions` completas para comparar estilos sobre
 * el MISMO mundo; sin opciones mantiene la isla clásica 48×32. Solo
 * presentación y métricas: el agua es un plano toon simple. */

import * as THREE from 'three';
import {
  affectedChunksForCells,
  applyTerrainLayerStack,
  buildGrassClumpMeshData,
  buildGrassField,
  buildHeightfieldMeshData,
  buildLowPolyVegetationMeshData,
  generateTerrainHeightfield,
  grassChunkKey,
  GRASS_FIELD_DEFAULTS,
  GRASS_FIELD_LIMITS,
  normalizeGrassFieldOptions,
  normalizeTerrainOptions,
  normalizeTerrainLayerStack,
  normalizeWorldPalette,
  placeVegetation,
  TERRAIN_SURFACE_IDS,
  terrainOptionsPreset,
  VEGETATION_MESH_DEFAULTS,
  WORLD_PALETTE_DEFAULTS,
  worldPaletteToHeightfieldRamp,
  worldPaletteToSurfaceColors,
  worldPaletteToVegetationPalette,
  type IslandHeightfield,
  type MapVersion,
  type RenderStyle,
  type TerrainLayer,
  type TerrainOptions,
  type VegetationPlacement,
  type WorldPalette,
  type GrassChunkField,
  type GrassFieldOptions,
  type GrassFieldResult,
} from '../../../game-core';
import {
  type BlockPropPlacement,
  buildBlockPropsMeshData,
  buildBlockTerrainMeshData,
  placeBlockProps,
} from './game-block-mesher';
import { buildBlockHeightmapFromIsland } from './game-procedural-blocks';
import { toGeometry, toIndexedGeometry } from './game-procedural-geometry';
import { buildToonWaterPlane, buildToonWaterPlaneGeometry } from './game-toon-water';
import { type WorldBend } from './game-world-bend';

const WATER_Y = -0.12;
const PROP_COUNT = 60;
/* [138A-11] Resultado vacío reutilizable cuando la cuota global de briznas
 * ya está consumida (evita llamar a buildGrassField con maxInstances 0,
 * que es fail-closed y lanzaría). */
const EMPTY_GRASS_FIELD: GrassFieldResult = {
  chunks: [],
  bladeCount: 0,
  chunkCount: 0,
  overriddenCells: 0,
};

export interface ProceduralTerrainStats {
  readonly mode: RenderStyle;
  readonly vertices: number;
  readonly triangles: number;
  readonly propCount: number;
  /** [138A-10] Pasto instanciado (solo estilo suave). */
  readonly grassChunks?: number;
  readonly grassBlades?: number;
}

export interface TerrainPick {
  readonly i: number;
  readonly j: number;
  /** Nivel de bloque; null en modo suave (no hay bloques que mostrar). */
  readonly level: number | null;
  readonly worldX: number;
  readonly worldZ: number;
  readonly height: number;
}

export interface ProceduralComparator {
  readonly setMode: (mode: RenderStyle) => void;
  readonly mode: () => RenderStyle;
  readonly setVisible: (visible: boolean) => void;
  readonly regenerate: (seed: number) => void;
  /** [138A-4] Regenera con opciones completas del constructor. */
  /* [138A-11] `grass` opcional evita dos rebuilds seguidos (setGrassOptions
   * + regenerateFromOptions) cuando el panel cambia terreno y pasto a la vez:
   * la regeneración completa ya reconstruye el campo con las opciones dadas. */
  readonly regenerateFromOptions: (options: TerrainOptions, grass?: GrassFieldOptions) => void;
  /** [138A-8] Aplica la paleta del mundo sin tocar opciones/terreno. */
  readonly setPalette: (palette: WorldPalette) => void;
  /** [138A-8] Cambia la rampa toon compartida (gradientMap del material). */
  readonly setToonRamp: (ramp: THREE.Texture) => void;
  /** [138A-15] Activa/desactiva sombras PCF en el comparador: terreno cast+
   *  receive, props cast, pasto/agua sin sombras. Reaplicado tras rebuilds. */
  readonly setShadowCasting: (enabled: boolean) => void;
  /** [138A-8] Muestra/oculta los props del documento MapVersion. */
  readonly setDocument: (map: MapVersion | null) => void;
  /** [138A-9] Aplica el stack de capas sobre la base generada (deltas). */
  readonly setLayers: (layers: readonly TerrainLayer[]) => void;
  /** [138A-10] Cambia opciones de pasto (densidad/tamaño/color) y regenera
   *  las matas sin tocar el terreno ni las superficies. */
  readonly setGrassOptions: (options: GrassFieldOptions) => void;
  readonly groundHeightAt: (x: number, z: number) => number;
  readonly raycastGroup: THREE.Object3D;
  readonly pickTerrain: (x: number, y: number, z: number) => TerrainPick | null;
  readonly setPropsVisible: (visible: boolean) => void;
  readonly terrainStats: () => ProceduralTerrainStats;
  readonly update: (timeSeconds: number, anchorX: number, anchorY: number, anchorZ: number) => void;
  readonly dispose: () => void;
}

interface BuiltMode {
  readonly group: THREE.Group;
  readonly stats: ProceduralTerrainStats;
}

export function mountProceduralComparator(
  scene: THREE.Scene,
  bend: WorldBend,
  toonRamp: THREE.Texture,
  seed = 1337,
  centerX = 0,
  centerZ = 0,
  options?: TerrainOptions,
): ProceduralComparator {
  let currentOptions = options === undefined
    ? { ...terrainOptionsPreset('isla'), seed }
    : normalizeTerrainOptions({ ...options, seed: options.seed });
  let currentWidth = currentOptions.width;
  let currentDepth = currentOptions.depth;
  let currentHeightfield: IslandHeightfield;
  let currentBlockLevels: Int8Array;
  let mode: RenderStyle = 'bloques';
  let propsVisible = true;
  /* [138A-8] Paleta del mundo activa y documento de instancias. */
  let currentPalette: WorldPalette = { ...WORLD_PALETTE_DEFAULTS };
  let currentMap: MapVersion | null = null;
  let currentLayers: readonly TerrainLayer[] = [];
  /* Superficies por celda tras aplicar el stack (solo suave; bloques usa el
   * mesher que cuantiza el heightfield ya editado). */
  let currentSurfaces: Uint8Array | undefined;
  /* [138A-10] Máscara de vegetación del stack (0/1/-1) para el césped. */
  let currentVegetationMask: Int8Array | undefined;
  /* [138A-10] Opciones de pasto del panel (densidad/tamaño/color). */
  let currentGrassOptions: GrassFieldOptions = { ...GRASS_FIELD_DEFAULTS };
  let lastTerrainLayerSignature = '';
  /* [138A-10] Capas del setLayers anterior: al eliminar/apagar una capa de
   * vegetación su chunk desaparece de las capas ACTUALES y sin este rastro
   * conservaría los meshes (pasto fantasma). */
  let lastLayers: readonly TerrainLayer[] = [];
  let documentGroup: THREE.Group | null = null;

  const world = new THREE.Group();
  const material = bend.apply(new THREE.MeshToonMaterial({ gradientMap: toonRamp, vertexColors: true }));
  /* El material del agua se crea UNA vez aquí (geometría placeholder) y cada
   * rebuild solo regenera la geometría; crear un material por montaje o por
   * regeneración filtraría recursos GPU sin liberar. */
  const initialWater = buildToonWaterPlane(bend, 1, 1, toonRamp);
  let waterGeometry = initialWater.geometry;
  const waterMaterial = initialWater.material;
  waterMaterial.color.setHex(currentPalette.waterShallow);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.position.y = WATER_Y;
  /* [138A-15] El agua toon no participa en el shadow map (tapa el fondo
   * marino y su normal plana no debe recibir sombras). */
  water.userData.noShadow = true;
  /* El agua queda por encima del fondo marino sin pelear en z en el borde. */
  water.renderOrder = 1;
  world.add(water);

  let blocks: BuiltMode | null = null;
  let smooth: BuiltMode | null = null;
  let raycastGroup: THREE.Object3D = water;

  /* [138A-10] Pasto instanciado: una sola geometría de mata compartida y un
   * InstancedMesh por chunk. La geometría/material se crean UNA vez al
   * montar; los rebuilds solo recrean los meshes (mesh.dispose(), nunca
   * geometry.dispose() de un InstancedMesh) y `dispose()` libera el resto. */
  const grassGroup = new THREE.Group();
  const GRASS_GEOMETRY_SEED = 1337;
  let grassGeometry: THREE.BufferGeometry | null = null;
  let grassMaterial: THREE.MeshToonMaterial | null = null;
  let grassMeshes: THREE.InstancedMesh[] = [];
  let grassBladeTotal = 0;
  const grassDummy = new THREE.Object3D();
  const grassColor = new THREE.Color();

  const ensureGrassResources = (): void => {
    if (grassGeometry && grassMaterial) return;
    const data = buildGrassClumpMeshData(GRASS_GEOMETRY_SEED, {
      /* Geometría blanca: el color real llega por instanceColor (opción del
       * panel de Pasto, independiente de la paleta del mundo). */
      palette: { ...VEGETATION_MESH_DEFAULTS, grass: 0xffffff },
    });
    grassGeometry = toIndexedGeometry(data);
    grassMaterial = bend.apply(new THREE.MeshToonMaterial({
      gradientMap: toonRamp,
      vertexColors: true,
    }));
  };

  const clearGrassMeshes = (): void => {
    for (const mesh of grassMeshes) {
      grassGroup.remove(mesh);
      mesh.dispose();
    }
    grassMeshes = [];
    grassBladeTotal = 0;
  };

  const createGrassMesh = (chunk: GrassChunkField): THREE.InstancedMesh => {
    ensureGrassResources();
    const mesh = new THREE.InstancedMesh(grassGeometry!, grassMaterial!, chunk.blades.length);
    mesh.userData.grassChunkKey = grassChunkKey(chunk.cx, chunk.cz);
    const cellSize = currentOptions.cellSize;
    grassColor.setHex(currentGrassOptions.color ?? GRASS_FIELD_DEFAULTS.color);
    for (let k = 0; k < chunk.blades.length; k += 1) {
      const blade = chunk.blades[k];
      grassDummy.position.set(blade.x * cellSize, blade.y, blade.z * cellSize);
      grassDummy.scale.setScalar(blade.scale * cellSize);
      grassDummy.rotation.set(0, 0, 0);
      grassDummy.updateMatrix();
      mesh.setMatrixAt(k, grassDummy.matrix);
      mesh.setColorAt(k, grassColor);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    grassBladeTotal += chunk.blades.length;
    return mesh;
  };

  /* [138A-10] Regenera el pasto; con `filter` solo se recrean los chunks
   * afectados (pinceladas) y el resto conserva sus meshes. */
  const rebuildGrass = (filter?: ReadonlySet<string>): void => {
    grassBladeTotal = 0;
    const kept: THREE.InstancedMesh[] = [];
    for (const mesh of grassMeshes) {
      const key = mesh.userData.grassChunkKey as string | undefined;
      if (filter !== undefined && key !== undefined && !filter.has(key)) {
        kept.push(mesh);
        grassBladeTotal += mesh.count;
        continue;
      }
      grassGroup.remove(mesh);
      mesh.dispose();
    }
    grassMeshes = kept;
    /* [138A-11] Presupuesto global: la cuota (10000) se reparte entre lo
     * conservado (chunks fuera del filtro de la pincelada) y lo nuevo de
     * esta pasada, en vez de conceder 10000 a cada rebuild filtrado. Si ya
     * no queda cupo no se generan briznas nuevas; la retirada de pasto ya
     * liberó sus meshes y queda aplicada. */
    const remaining = Math.max(0, GRASS_FIELD_LIMITS.maxInstances - grassBladeTotal);
    const field = remaining <= 0
      ? EMPTY_GRASS_FIELD
      : buildGrassField(
        currentHeightfield,
        currentSurfaces,
        currentVegetationMask,
        currentOptions.seed,
        currentGrassOptions,
        {
          maxChunks: GRASS_FIELD_LIMITS.maxChunks,
          maxInstances: remaining,
          chunkSize: GRASS_FIELD_LIMITS.chunkSize,
        },
        filter,
      );
    for (const chunk of field.chunks) {
      const mesh = createGrassMesh(chunk);
      grassMeshes.push(mesh);
      grassGroup.add(mesh);
    }
    applyShadowFlags();
  };

  /* [138A-15] Sombras del comparador: se reaplican tras cada rebuild para
   * que los meshes nuevos (terreno/props/pasto) respeten el flag actual. */
  let shadowsEnabled = false;
  const applyShadowFlags = (): void => {
    const setFlags = (object: THREE.Object3D | null, cast: boolean, receive: boolean): void => {
      if (!object) return;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = cast;
          child.receiveShadow = receive;
        }
      });
    };
    for (const built of [blocks, smooth]) {
      if (!built) continue;
      const children = built.group.children;
      /* children[0] = terreno (cast+receive), children[1] = props (cast). */
      setFlags(children[0] ?? null, shadowsEnabled, shadowsEnabled);
      setFlags(children[1] ?? null, shadowsEnabled, false);
    }
    setFlags(documentGroup, shadowsEnabled, false);
    for (const mesh of grassMeshes) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
    water.castShadow = false;
    water.receiveShadow = false;
  };

  const rebuildWater = (): void => {
    waterGeometry?.dispose();
    /* [138A-6] El agua cubre el rect del mundo escalado por cellSize. */
    const cellSize = currentOptions.cellSize;
    waterGeometry = buildToonWaterPlaneGeometry(currentWidth * cellSize * 2.4, currentDepth * cellSize * 2.4);
    water.geometry = waterGeometry;
  };

  const blockMaxLevel = (): number =>
    Math.min(16, Math.max(1, Math.round(currentOptions.maxHeight)));

  const buildBlocks = (heightfield: IslandHeightfield): BuiltMode => {
    const blockH = buildBlockHeightmapFromIsland(heightfield, blockMaxLevel());
    currentBlockLevels = blockH.levels;
    const terrainData = buildBlockTerrainMeshData(blockH, currentOptions.seed, currentPalette);
    const placements = placeBlockProps(blockH, currentOptions.seed, PROP_COUNT);
    const propsData = buildBlockPropsMeshData(placements, currentPalette);
    const group = new THREE.Group();
    const terrain = new THREE.Mesh(toGeometry(terrainData), material);
    const props = new THREE.Mesh(toGeometry(propsData), material);
    props.visible = propsVisible;
    /* [138A-6] El tamaño de bloque real: el mesher emite celdas de 1 unidad y
     * el grupo escala la huella x/z por cellSize (la altura no se escala:
     * maxHeight es un control independiente en el contrato). */
    group.scale.set(currentOptions.cellSize, 1, currentOptions.cellSize);
    group.add(terrain, props);
    return {
      group,
      stats: {
        mode: 'bloques',
        vertices: terrainData.positions.length / 3,
        triangles: terrainData.positions.length / 9,
        propCount: placements.length,
      },
    };
  };

  const buildSmooth = (heightfield: IslandHeightfield): BuiltMode => {
    const cellSize = currentOptions.cellSize;
    const meshData = buildHeightfieldMeshData(heightfield, {
      cellSize,
      colorRamp: worldPaletteToHeightfieldRamp(currentPalette),
      /* [138A-9] Si el stack pintó superficies (camino/arena/agua), el color
       * del vértice viene de la superficie, no de la banda de altura. */
      surfaces: currentSurfaces,
      surfaceColors: worldPaletteToSurfaceColors(currentPalette),
    });
    const density = currentOptions.vegetationDensity;
    const veg = placeVegetation(heightfield, currentOptions.seed, {
      /* [138A-10] El césped ya no viene de placeVegetation: lo genera
       * grass-field por chunks (instancing + presupuesto) en rebuildGrass. */
      maxGrass: 0,
      /* [138A-6] Sin árboles en suave: conserva rocas (y el pasto nuevo). */
      maxTrees: 0,
      maxRocks: Math.round(26 * density),
    });
    /* [138A-6] Las posiciones del toolkit están en celdas; el preview suave
     * las traduce al mundo escalado por cellSize igual que el documento. */
    /* [138A-9] La vegetación generada no pisa superficies pintadas (paridad
     * con map-builder: solo crece sobre hierba). */
    const onGrass = currentSurfaces === undefined
      ? veg.placements
      : veg.placements.filter((placement) => {
        const i = Math.floor(placement.x);
        const j = Math.floor(placement.z);
        if (i < 0 || j < 0 || i >= currentWidth || j >= currentDepth) return false;
        return currentSurfaces![j * currentWidth + i] === TERRAIN_SURFACE_IDS.grass;
      });
    const scaledPlacements = onGrass.map(placement => ({
      ...placement,
      x: placement.x * cellSize,
      z: placement.z * cellSize,
    }));
    const propData = buildLowPolyVegetationMeshData(
      scaledPlacements,
      worldPaletteToVegetationPalette(currentPalette),
    );
    const group = new THREE.Group();
    const terrain = new THREE.Mesh(toIndexedGeometry(meshData), material);
    const props = new THREE.Mesh(toIndexedGeometry(propData), material);
    props.visible = propsVisible;
    grassGroup.visible = propsVisible;
    group.add(terrain, props, grassGroup);
    return {
      group,
      stats: {
        mode: 'suave',
        vertices: meshData.vertexCount,
        triangles: meshData.triangleCount,
        propCount: onGrass.length,
      },
    };
  };

  const disposeDocumentProps = (): void => {
    if (!documentGroup) return;
    world.remove(documentGroup);
    documentGroup.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    documentGroup.clear();
    documentGroup = null;
  };

  /* [138A-8/9] Los props del documento viven en su propio grupo y se
   * renderizan SEGÚN EL ESTILO activo: en 'bloques' se convierten a
   * BlockPropPlacement del mesher (árboles/rocas de bloque, sin overlay
   * low-poly); en 'suave' se pintan como props low-poly. Sin documento se
   * conserva la vegetación generada del comparador. Los assets de categorías
   * sin mesher (agua/personajes/genéricos) se omiten hoy: deuda documentada. */
  const rebuildDocumentProps = (): void => {
    disposeDocumentProps();
    if (currentMap && blocks && smooth) {
      const blockPlacements: BlockPropPlacement[] = [];
      const placements: VegetationPlacement[] = [];
      for (const instance of currentMap.instances) {
        const asset = currentMap.assetManifest[instance.assetVersionId];
        const kind = asset?.category === 'tree' ? 'tree' : asset?.category === 'rock' ? 'rock' : null;
        if (!kind) continue;
        /* [138A-8] Las instancias del documento viven en el frame local del
         * terreno (bounds ±w/2·cellSize), pero el grupo `world` está en
         * (centerX, 0, centerZ): se traduce a coordenadas de escena para
         * posicionar el prop y para buscar su celda de anclaje. */
        const sceneX = instance.position.x + centerX;
        const sceneZ = instance.position.z + centerZ;
        const cell = cellAtWorld(sceneX, sceneZ);
        if (!cell) continue;
        const height = cellHeight(cell.i, cell.j);
        if (height < currentHeightfield.waterLevel) continue;
        if (mode === 'bloques') {
          const level = currentBlockLevels[cell.j * currentWidth + cell.i];
          if (level < 0) continue;
          /* Frame local del grupo de bloques (escala cellSize): el documento
           * está en mundo, el mesher de props espera celdas. */
          blockPlacements.push({
            kind,
            x: (sceneX - centerX) / currentOptions.cellSize,
            z: (sceneZ - centerZ) / currentOptions.cellSize,
            baseY: level,
            seed: Math.floor(instance.rotationY * 7) + Math.round(instance.position.x * 13 + instance.position.z * 29),
          });
          continue;
        }
        placements.push({
          kind,
          x: sceneX,
          z: sceneZ,
          y: height,
          /* Determinista: la rotación (0..360) y la posición siembran la forma. */
          seed: Math.floor(instance.rotationY * 7) + Math.round(instance.position.x * 13 + instance.position.z * 29),
          scale: instance.scale,
        });
      }
      if (mode === 'bloques' && blockPlacements.length > 0) {
        const data = buildBlockPropsMeshData(blockPlacements, currentPalette);
        const mesh = new THREE.Mesh(toGeometry(data), material);
        const group = new THREE.Group();
        group.scale.set(currentOptions.cellSize, 1, currentOptions.cellSize);
        group.add(mesh);
        world.add(group);
        documentGroup = group;
      } else if (mode === 'suave' && placements.length > 0) {
        const data = buildLowPolyVegetationMeshData(
          placements,
          worldPaletteToVegetationPalette(currentPalette),
        );
        const mesh = new THREE.Mesh(toIndexedGeometry(data), material);
        const group = new THREE.Group();
        group.add(mesh);
        world.add(group);
        documentGroup = group;
      }
    }
    syncDocumentVisibility();
    applyShadowFlags();
  };

  /* [138A-8] Con documento, la vegetación generada se oculta para no duplicar
   * árboles/rocas; sin documento se restaura la generada. */
  const syncDocumentVisibility = (): void => {
    const hasDocument = documentGroup !== null;
    if (blocks) blocks.group.children[1].visible = propsVisible && !hasDocument;
    if (smooth) smooth.group.children[1].visible = propsVisible && !hasDocument;
    grassGroup.visible = propsVisible;
    if (documentGroup) documentGroup.visible = propsVisible;
  };

  const rebuildMeshes = (): void => {
    /* [138A-10] El pasto comparte una geometría con todos los chunks: se
     * retiran los meshes ANTES de disposeBuiltMode para que el recorrido no
     * libere la geometría compartida (los rebuilds solo recrean meshes). */
    clearGrassMeshes();
    disposeBuiltMode(blocks);
    disposeBuiltMode(smooth);
    blocks = buildBlocks(currentHeightfield);
    smooth = buildSmooth(currentHeightfield);
    world.add(blocks.group, smooth.group);
    rebuildDocumentProps();
    applyMode();
    rebuildGrass();
    applyShadowFlags();
  };

  const rebuild = (): void => {
    /* Un único heightfield por rebuild: bloques y suave comparten la MISMA
     * base exacta y la generación no se ejecuta dos veces por clic. */
    currentHeightfield = generateTerrainHeightfield(currentOptions);
    /* [138A-9] El stack se reaplica SIEMPRE sobre la base generada para que
     * sobreviva a regeneraciones; currentHeightfield queda como la base ya
     * editada (pick/groundHeight reflejan las capas). */
    if (currentLayers.length > 0) {
      const layered = applyTerrainLayerStack(currentHeightfield, currentLayers, currentOptions.cellSize);
      currentHeightfield = { ...currentHeightfield, heights: layered.heights };
      currentSurfaces = layered.surfaces;
      currentVegetationMask = layered.vegetationMask;
    } else {
      currentSurfaces = undefined;
      currentVegetationMask = undefined;
    }
    rebuildMeshes();
  };

  /* [138A-10] Firma de las capas que tocan el terreno (todo excepto
   * vegetation): si no cambia, una pincelada de pasto solo regenera los
   * chunks afectados sin reconstruir mallas ni props. */
  const terrainLayerSignature = (layers: readonly TerrainLayer[]): string => {
    const affecting = layers
      .filter(layer => layer.kind !== 'vegetation')
      .map(layer => JSON.stringify(layer));
    return affecting.join('|');
  };

  const vegetationAffectedChunks = (layers: readonly TerrainLayer[]): ReadonlySet<string> | undefined => {
    const cells: (readonly [number, number])[] = [];
    for (const layer of layers) {
      if (layer.kind !== 'vegetation' || !layer.enabled) continue;
      if (layer.shape.kind !== 'painted') return undefined;
      cells.push(...layer.shape.cells);
    }
    if (cells.length === 0) return undefined;
    return new Set(affectedChunksForCells(cells, GRASS_FIELD_LIMITS.chunkSize));
  };

  const setOptions = (next: TerrainOptions): void => {
    currentOptions = normalizeTerrainOptions(next);
    currentWidth = currentOptions.width;
    currentDepth = currentOptions.depth;
    rebuildWater();
    rebuild();
  };

  const applyMode = (): void => {
    if (!blocks || !smooth) return;
    blocks.group.visible = mode === 'bloques';
    smooth.group.visible = mode === 'suave';
    raycastGroup = (mode === 'bloques' ? blocks : smooth).group.children[0];
  };

  const cellAtWorld = (x: number, z: number): { i: number; j: number } | null => {
    /* [138A-6] El mundo del comparador escala por cellSize (bloques via scale
     * del grupo, suave via posiciones del mesh); el pick divide por cellSize. */
    const i = Math.floor((x - centerX) / currentOptions.cellSize + currentWidth / 2);
    const j = Math.floor((z - centerZ) / currentOptions.cellSize + currentDepth / 2);
    if (i < 0 || j < 0 || i >= currentWidth || j >= currentDepth) return null;
    return { i, j };
  };

  const cellHeight = (i: number, j: number): number =>
    currentHeightfield.heights[j * currentWidth + i];

  const groundHeightAt = (x: number, z: number): number => {
    const cell = cellAtWorld(x, z);
    if (!cell) return WATER_Y;
    if (mode === 'suave') {
      const y = cellHeight(cell.i, cell.j);
      return y < currentHeightfield.waterLevel ? WATER_Y : y;
    }
    const level = currentBlockLevels[cell.j * currentWidth + cell.i];
    return level < 0 ? WATER_Y : level;
  };

  const pickTerrain = (x: number, y: number, z: number): TerrainPick | null => {
    const cell = cellAtWorld(x, z);
    if (!cell) return null;
    if (mode === 'suave') {
      const height = cellHeight(cell.i, cell.j);
      if (height < currentHeightfield.waterLevel) return null;
      return {
        i: cell.i,
        j: cell.j,
        level: null,
        worldX: (cell.i - currentWidth / 2 + 0.5) * currentOptions.cellSize + centerX,
        worldZ: (cell.j - currentDepth / 2 + 0.5) * currentOptions.cellSize + centerZ,
        height,
      };
    }
    const level = currentBlockLevels[cell.j * currentWidth + cell.i];
    if (level < 0) return null;
    let layer = Math.floor(y + 0.001);
    if (y >= level - 0.001) layer = level - 1;
    layer = Math.max(-1, Math.min(level - 1, layer));
    return {
      i: cell.i,
      j: cell.j,
      level,
      worldX: (cell.i - currentWidth / 2 + 0.5) * currentOptions.cellSize + centerX,
      worldZ: (cell.j - currentDepth / 2 + 0.5) * currentOptions.cellSize + centerZ,
      height: layer + 0.5,
    };
  };

  const setPropsVisible = (visible: boolean): void => {
    propsVisible = visible;
    syncDocumentVisibility();
  };

  setOptions(currentOptions);
  world.position.set(centerX, 0, centerZ);
  world.visible = false;
  scene.add(world);

  return {
    setMode: (nextMode) => {
      mode = nextMode;
      applyMode();
      /* El render del documento depende del estilo (bloques vs suave). */
      rebuildDocumentProps();
    },
    mode: () => mode,
    setVisible: (visible) => {
      world.visible = visible;
      if (visible) applyMode();
    },
    regenerate: (newSeed) => {
      setOptions({ ...currentOptions, seed: newSeed });
    },
    regenerateFromOptions: (next, grass) => {
      if (grass !== undefined) currentGrassOptions = normalizeGrassFieldOptions(grass);
      setOptions(next);
    },
    groundHeightAt,
    get raycastGroup() {
      return raycastGroup;
    },
    pickTerrain,
    setPropsVisible,
    terrainStats: () => {
      const base = mode === 'bloques'
        ? blocks!.stats
        : {
          ...smooth!.stats,
          grassChunks: grassMeshes.length,
          grassBlades: grassBladeTotal,
        };
      return currentMap ? { ...base, propCount: currentMap.instances.length } : base;
    },
    setPalette: (next) => {
      currentPalette = normalizeWorldPalette(next);
      waterMaterial.color.setHex(currentPalette.waterShallow);
      rebuildMeshes();
    },
    setToonRamp: (nextRamp) => {
      material.gradientMap = nextRamp;
      if (grassMaterial) grassMaterial.gradientMap = nextRamp;
    },
    setShadowCasting: (enabled) => {
      shadowsEnabled = enabled;
      applyShadowFlags();
    },
    setDocument: (map) => {
      currentMap = map;
      rebuildDocumentProps();
    },
    setLayers: (next) => {
      const previousLayers = lastLayers;
      currentLayers = normalizeTerrainLayerStack(next);
      /* [138A-10] Si solo cambian capas de vegetación (máscara de césped),
       * el terreno y los props no se tocan: se regenera el pasto solo en los
       * chunks afectados por las celdas pintadas. Cualquier otra capa
       * (elevación/superficie/orden) fuerza el rebuild completo. */
      const signature = terrainLayerSignature(currentLayers);
      const terrainChanged = signature !== lastTerrainLayerSignature;
      lastTerrainLayerSignature = signature;
      currentHeightfield = generateTerrainHeightfield(currentOptions);
      if (currentLayers.length > 0) {
        const layered = applyTerrainLayerStack(currentHeightfield, currentLayers, currentOptions.cellSize);
        currentHeightfield = { ...currentHeightfield, heights: layered.heights };
        currentSurfaces = layered.surfaces;
        currentVegetationMask = layered.vegetationMask;
      } else {
        currentSurfaces = undefined;
        currentVegetationMask = undefined;
      }
      if (terrainChanged) {
        rebuildMeshes();
      } else {
        /* [138A-10] Se regenera la UNIÓN de chunks previos y actuales: al
         * retirar/apagar una capa de pasto su chunk ya no está en las capas
         * actuales y, sin los previos, su mesh quedaría huérfano. Si cualquiera
         * de los dos lados no tiene chunks pintados (p. ej. pasto natural),
         * el rebuild completo es la única forma de no dejar residuos. */
        const previousChunks = vegetationAffectedChunks(previousLayers);
        const currentChunks = vegetationAffectedChunks(currentLayers);
        const filter = previousChunks === undefined || currentChunks === undefined
          ? undefined
          : new Set([...previousChunks, ...currentChunks]);
        rebuildGrass(filter);
      }
      lastLayers = currentLayers;
    },
    setGrassOptions: (next) => {
      currentGrassOptions = normalizeGrassFieldOptions(next);
      if (currentHeightfield) {
        clearGrassMeshes();
        rebuildGrass();
      }
    },
    /* Agua estática: el update existe solo por el contrato común con la isla. */
    update: () => {},
    dispose: () => {
      scene.remove(world);
      /* [138A-10] El pasto se libera ANTES de disposeBuiltMode: la geometría
       * compartida no debe caer bajo el recorrido de los meshes. */
      clearGrassMeshes();
      grassGeometry?.dispose();
      grassGeometry = null;
      grassMaterial?.dispose();
      grassMaterial = null;
      disposeBuiltMode(blocks);
      disposeBuiltMode(smooth);
      material.dispose();
      waterMaterial.dispose();
      waterGeometry.dispose();
      disposeDocumentProps();
      world.clear();
    },
  };
}

function disposeBuiltMode(built: BuiltMode | null): void {
  if (!built) return;
  built.group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  built.group.clear();
}
