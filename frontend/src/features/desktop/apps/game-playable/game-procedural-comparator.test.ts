import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import * as gameCore from '../../../game-core';
import {
  buildMapVersionFromOptions,
  GRASS_FIELD_LIMITS,
  terrainOptionsPreset,
  WORLD_PALETTE_DEFAULTS,
  type GrassFieldResult,
} from '../../../game-core';

/* Spy sobre la fábrica real: el comparador debe crear el material del agua
 * UNA vez (al montar) y solo regenerar geometría después. Cada llamada extra
 * de `buildToonWaterPlane` filtra un MeshToonMaterial sin liberar (138A-4,
 * hallazgo IMPORTANTE del supervisor_reviewer). */
vi.mock('./game-toon-water', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./game-toon-water')>();
  return { ...actual, buildToonWaterPlane: vi.fn(actual.buildToonWaterPlane) };
});

/* [138A-6] Spy sobre el presupuesto de vegetación: el modo suave debe llamar
 * `placeVegetation` con maxTrees=0 conservando césped y rocas. */
/* [138A-11] También se espiá buildGrassField para verificar el presupuesto
 * global de briznas por pasada y que la regeneración no duplica el rebuild. */
vi.mock('../../../game-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../game-core')>();
  return {
    ...actual,
    placeVegetation: vi.fn(actual.placeVegetation),
    buildGrassField: vi.fn(actual.buildGrassField),
  };
});

import { createWorldBend } from './game-world-bend';
import { DEFAULT_BRUSH_STATE } from './game-layer-brush';
import { createPaintedLayer } from './game-layer-editor';
import { mountProceduralComparator, type ProceduralComparator } from './game-procedural-comparator';
import * as waterModule from './game-toon-water';

describe('comparador procedural — ciclo de vida del agua', () => {
  const scene = new THREE.Scene();
  const ramp = new THREE.Texture();
  const bend = createWorldBend();

  it('no crea materiales de agua nuevos al regenerar (sin fugas GPU)', () => {
    const comparator: ProceduralComparator = mountProceduralComparator(scene, bend, ramp);
    expect(waterModule.buildToonWaterPlane).toHaveBeenCalledTimes(1);

    comparator.regenerate(4242);
    comparator.regenerateFromOptions({ ...terrainOptionsPreset('continente'), seed: 7 });
    comparator.regenerateFromOptions({ ...terrainOptionsPreset('valle'), seed: 99 });
    expect(waterModule.buildToonWaterPlane).toHaveBeenCalledTimes(1);

    expect(() => comparator.dispose()).not.toThrow();
  });
});

describe('comparador procedural — cellSize real y estilos (138A-6)', () => {
  it('el agua, el preview y el pick escalan con cellSize', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      1337,
      0,
      0,
      { ...terrainOptionsPreset('isla'), cellSize: 2 },
    );

    const world = scene.children[0] as THREE.Group;
    const water = world.children[0] as THREE.Mesh;
    const waterPlane = water.geometry as THREE.PlaneGeometry;
    expect(waterPlane.parameters.width).toBeCloseTo(48 * 2 * 2.4);
    expect(waterPlane.parameters.height).toBeCloseTo(32 * 2 * 2.4);

    /* Modo bloques: la huella x/z del grupo escala por cellSize (la altura
     * no: maxHeight es un control independiente del contrato). */
    comparator.setMode('bloques');
    const blocksGroup = comparator.raycastGroup.parent as THREE.Group;
    expect(blocksGroup.scale.x).toBe(2);
    expect(blocksGroup.scale.y).toBe(1);
    expect(blocksGroup.scale.z).toBe(2);

    /* Pick en el centro de la isla: la celda devuelta reporta coordenadas de
     * mundo escaladas por cellSize (paridad con el documento). */
    const pick = comparator.pickTerrain(1.5, 0, 0.5);
    expect(pick?.i).toBe(24);
    expect(pick?.j).toBe(16);
    expect(pick?.worldX).toBe(1);
    expect(pick?.worldZ).toBe(1);
    expect(pick?.level).not.toBeNull();

    comparator.setMode('suave');
    const smoothPick = comparator.pickTerrain(1.5, 0, 0.5);
    expect(smoothPick?.i).toBe(24);
    expect(smoothPick?.j).toBe(16);
    expect(smoothPick?.worldX).toBe(1);
    expect(smoothPick?.worldZ).toBe(1);
    expect(smoothPick?.level).toBeNull();

    /* Regenerar con otra celda actualiza el agua en tiempo real. */
    comparator.regenerateFromOptions({ ...terrainOptionsPreset('isla'), cellSize: 1 });
    const water1 = (scene.children[0] as THREE.Group).children[0] as THREE.Mesh;
    expect((water1.geometry as THREE.PlaneGeometry).parameters.width).toBeCloseTo(48 * 1 * 2.4);

    comparator.dispose();
  });

  it('suave no coloca árboles: placeVegetation recibe maxTrees=0 y conserva el resto', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      1337,
      0,
      0,
      terrainOptionsPreset('isla'),
    );

    comparator.setMode('suave');
    expect(gameCore.placeVegetation).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        maxTrees: 0,
        /* [138A-10] El césped ya no viene de placeVegetation: lo genera
         * grass-field por chunks instanciados (una draw call por chunk). */
        maxGrass: 0,
        maxRocks: expect.any(Number),
      }),
    );
    expect(comparator.terrainStats().propCount).toBeGreaterThan(0);

    comparator.dispose();
  });
});

describe('comparador procedural — capas de terreno y props del documento (138A-9)', () => {
  const options = { ...terrainOptionsPreset('isla'), seed: 42 };

  it('aplica el stack de capas a alturas, pick y groundHeight (deltas acotados)', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      options,
    );
    comparator.setMode('suave');
    const before = comparator.groundHeightAt(0, 0);
    comparator.setLayers([{
      id: 'colina', name: 'Colina', enabled: true, kind: 'elevation',
      shape: { kind: 'circle', cx: 0, cz: 0, radius: 3 },
      falloff: 'smooth', falloffRadius: 1, bias: 1, blend: 'set',
      height: 2, elevationMode: 'absolute',
    }]);
    const after = comparator.groundHeightAt(0, 0);
    expect(after).toBeGreaterThan(before + 0.5);
    expect(comparator.pickTerrain(0, 0, 0)?.height).toBeCloseTo(after, 3);
    comparator.dispose();
  });

  it('renderiza los props del documento según estilo sin duplicar vegetación', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      options,
    );
    const map = buildMapVersionFromOptions(options);
    comparator.setDocument(map);
    const world = scene.children[0] as THREE.Group;
    const blocksGroup = world.children[1] as THREE.Group;
    /* Documento activo → la vegetación generada del comparador se oculta
     * (una sola fuente de props; fix de recarga). */
    expect((blocksGroup.children[1] as THREE.Mesh).visible).toBe(false);
    /* Documento renderizado como props de bloque dentro del mundo. */
    const documentGroup = world.children.find((child, index) =>
      index > 2 && child instanceof THREE.Group && child.children.length === 1) as THREE.Group | undefined;
    expect(documentGroup).toBeDefined();
    const mesh = documentGroup!.children[0] as THREE.Mesh;
    expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
    expect(documentGroup!.scale.x).toBe(options.cellSize);

    /* Cambiar a suave reconstruye los props del documento como low-poly. */
    comparator.setMode('suave');
    const smoothGroup = world.children[2] as THREE.Group;
    expect((smoothGroup.children[1] as THREE.Mesh).visible).toBe(false);
    const smoothDocumentGroup = world.children.find((child, index) =>
      index > 2 && child instanceof THREE.Group && child.children.length === 1
      && child.scale.x === 1) as THREE.Group | undefined;
    expect(smoothDocumentGroup).toBeDefined();

    /* Sin documento se restaura la vegetación generada. */
    comparator.setDocument(null);
    expect((smoothGroup.children[1] as THREE.Mesh).visible).toBe(true);
    comparator.dispose();
  });

  it('las superficies pintadas colorean el mesh suave (paridad documento)', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      options,
    );
    comparator.setMode('suave');
    comparator.setLayers([{
      id: 'camino', name: 'Camino', enabled: true, kind: 'path',
      shape: { kind: 'circle', cx: 0, cz: 0, radius: 4 },
      falloff: 'hard', falloffRadius: 0.5, bias: 1, blend: 'set', hardness: 0.5,
    }]);
    const world = scene.children[0] as THREE.Group;
    /* Tras regenerar quedan grupos antiguos vaciados en el árbol; el grupo
     * actual es el último que conserva sus dos hijos (terreno + props). */
    /* [138A-10] El grupo suave tiene terreno + props + grupo de pasto. */
    const smoothGroup = [...world.children].reverse().find(child =>
      child instanceof THREE.Group && child.children.length === 3) as THREE.Group;
    const terrain = smoothGroup.children[0] as THREE.Mesh;
    const colors = terrain.geometry.getAttribute('color') as THREE.BufferAttribute;
    expect(colors).toBeDefined();
    expect(colors.count).toBe(terrain.geometry.getAttribute('position').count);
    comparator.dispose();
  });

  it('setGrassOptions regenera el pasto instanciado por chunks (138A-10)', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      options,
    );
    comparator.setMode('suave');
    /* Sin capas de vegetación el pasto nace sobre hierba natural. */
    const stats = comparator.terrainStats();
    expect(stats.grassBlades).toBeGreaterThan(0);
    expect(stats.grassChunks).toBeGreaterThan(0);

    const world = scene.children[0] as THREE.Group;
    const smoothGroup = [...world.children].reverse().find(child =>
      child instanceof THREE.Group && child.children.length === 3) as THREE.Group;
    const grassGroup = smoothGroup.children[2] as THREE.Group;
    expect(grassGroup.children.length).toBe(stats.grassChunks);
    const first = grassGroup.children[0] as THREE.InstancedMesh;
    expect(first.count).toBeGreaterThan(0);
    expect(first.instanceColor).toBeDefined();

    /* Cambiar tamaño/color regenera sin tocar el terreno (mismas stats). */
    comparator.setGrassOptions({ size: 0.5, color: 0xff0000 });
    const nextStats = comparator.terrainStats();
    expect(nextStats.grassBlades).toBeGreaterThan(0);
    expect(nextStats.grassChunks).toBe(stats.grassChunks);

    /* Apagar el pasto libera los meshes y las stats caen a cero. */
    comparator.setGrassOptions({ enabled: false });
    expect(comparator.terrainStats().grassBlades).toBe(0);
    expect(comparator.terrainStats().grassChunks).toBe(0);
    expect(grassGroup.children.length).toBe(0);
    comparator.dispose();
  });

  it('al eliminar una capa de pasto se retira el césped de su chunk (138A-10)', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      options,
    );
    comparator.setMode('suave');

    /* Arena pintada en TODO el chunk 2:1 (i 32..47, j 16..31): sin máscara de
     * vegetación ese chunk no tiene pasto, así que su césped solo puede venir
     * de una capa de pasto pintada (repro del pasto fantasma). */
    const sandCells: (readonly [number, number])[] = [];
    for (let j = 16; j < 32; j += 1) {
      for (let i = 32; i < 48; i += 1) sandCells.push([i, j]);
    }
    const sandLayer = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'sand' },
      [],
      sandCells,
    );
    const zoneA: readonly (readonly [number, number])[] = [[16, 16], [17, 16], [16, 17], [17, 17]];
    const zoneB: readonly (readonly [number, number])[] = [[40, 24], [41, 24], [40, 25], [41, 25]];
    const grassA = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'add' },
      [sandLayer],
      zoneA,
    );
    const grassB = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'add' },
      [sandLayer, grassA],
      zoneB,
    );

    const grassKeys = (): ReadonlySet<string> => {
      const world = scene.children[0] as THREE.Group;
      const smoothGroup = [...world.children].reverse().find(child =>
        child instanceof THREE.Group && child.children.length === 3) as THREE.Group;
      const grassGroup = smoothGroup.children[2] as THREE.Group;
      return new Set([...grassGroup.children]
        .map(mesh => (mesh as THREE.InstancedMesh).userData.grassChunkKey as string));
    };

    comparator.setLayers([sandLayer, grassA, grassB]);
    const both = comparator.terrainStats();
    expect(both.grassBlades).toBeGreaterThan(0);
    const keysWithBoth = grassKeys();
    expect(keysWithBoth.has('1:1')).toBe(true);
    expect(keysWithBoth.has('2:1')).toBe(true);

    /* Quitar la capa B: su chunk (2:1) deja de estar en las capas actuales y,
     * sin la unión de chunks previos/actuales, conservaría sus meshes. */
    comparator.setLayers([sandLayer, grassA]);
    const onlyA = comparator.terrainStats();
    /* both.grassBlades ya se verificó > 0 arriba; el ! solo reafirma el
     * contrato del comparador en modo suave. */
    expect(onlyA.grassBlades).toBeLessThan(both.grassBlades!);
    const keysWithOnlyA = grassKeys();
    expect(keysWithOnlyA.has('1:1')).toBe(true);
    expect(keysWithOnlyA.has('2:1')).toBe(false);
    comparator.dispose();
  });
});

describe('comparador procedural — paleta, rampa y documento (138A-8)', () => {
  it('setPalette recolorea agua, bloques y suave sin tocar opciones', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      1337,
      0,
      0,
      terrainOptionsPreset('isla'),
    );
    const world = scene.children[0] as THREE.Group;
    const water = world.children[0] as THREE.Mesh;
    const waterMaterial = water.material as THREE.MeshToonMaterial;
    const blocksTerrain = comparator.raycastGroup as THREE.Mesh;
    const blocksColors = () => Array.from(
      (blocksTerrain.geometry.getAttribute('color') as THREE.BufferAttribute).array,
    );
    const before = blocksColors();

    const custom = { ...WORLD_PALETTE_DEFAULTS, grass: 0x112233, waterShallow: 0xabcdef };
    comparator.setPalette(custom);

    expect(waterMaterial.color.getHex()).toBe(0xabcdef);
    /* setPalette reconstruye los meshes: el raycastGroup apunta al nuevo. */
    const afterTerrain = comparator.raycastGroup as THREE.Mesh;
    const after = Array.from(
      (afterTerrain.geometry.getAttribute('color') as THREE.BufferAttribute).array,
    );
    expect(after).not.toEqual(before);
    /* La cara superior de hierba se tiñe con jitter ±0.05: tolerancia amplia. */
    expect(after.some(value => Math.abs(value - 0x11 / 255) < 0.05)).toBe(true);

    comparator.setMode('suave');
    const smoothTerrain = comparator.raycastGroup as THREE.Mesh;
    const smoothColors = Array.from(
      (smoothTerrain.geometry.getAttribute('color') as THREE.BufferAttribute).array,
    );
    expect(smoothColors.some(value => Math.abs(value - 0x11 / 255) < 0.05)).toBe(true);

    comparator.dispose();
  });

  it('setToonRamp actualiza el gradientMap del material compartido', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
    );
    const nextRamp = new THREE.Texture();
    comparator.setToonRamp(nextRamp);
    const world = scene.children[0] as THREE.Group;
    const blocksTerrain = (world.children[1] as THREE.Group).children[0] as THREE.Mesh;
    expect((blocksTerrain.material as THREE.MeshToonMaterial).gradientMap).toBe(nextRamp);
    comparator.dispose();
  });

  it('setDocument muestra los props del documento y setDocument(null) los restaura', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      1337,
      0,
      0,
      { ...terrainOptionsPreset('isla'), style: 'bloques', seed: 7 },
    );
    const map = buildMapVersionFromOptions({ ...terrainOptionsPreset('isla'), style: 'bloques', seed: 7 });

    const world = scene.children[0] as THREE.Group;
    const blocksGroup = world.children[1] as THREE.Group;
    const generatedProps = blocksGroup.children[1] as THREE.Mesh;
    expect(generatedProps.visible).toBe(true);
    expect(comparator.terrainStats().propCount).toBeGreaterThan(0);

    comparator.setDocument(map);
    expect(comparator.terrainStats().propCount).toBe(map.instances.length);
    expect(generatedProps.visible).toBe(false);
    /* El grupo de documento se añade tras los dos modos (índice 3). */
    const docGroup = world.children[3] as THREE.Group;
    expect(docGroup.children.length).toBe(1);
    expect(docGroup.visible).toBe(true);

    comparator.setDocument(null);
    expect(generatedProps.visible).toBe(true);
    expect(comparator.terrainStats().propCount).toBeGreaterThan(0);
    expect(world.children).not.toContain(docGroup);

    comparator.dispose();
  });
});

describe('comparador procedural — auditoría SOLID/rendimiento (138A-11)', () => {
  it('regenerateFromOptions con pasto hace UN solo rebuild del campo', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      { ...terrainOptionsPreset('isla'), seed: 42 },
    );
    comparator.setMode('suave');

    /* La escena antes llamaba setGrassOptions + regenerateFromOptions y el
     * campo se recalculaba dos veces; el contrato nuevo acepta el pasto en
     * la misma regeneración. */
    vi.mocked(gameCore.buildGrassField).mockClear();
    comparator.regenerateFromOptions(
      { ...terrainOptionsPreset('valle'), seed: 31 },
      { size: 2, color: 0x123456 },
    );
    expect(gameCore.buildGrassField).toHaveBeenCalledTimes(1);
    const call = vi.mocked(gameCore.buildGrassField).mock.calls.at(-1)!;
    expect(call[4]).toMatchObject({ size: 2, color: 0x123456 });
    expect(comparator.terrainStats().grassBlades).toBeGreaterThan(0);
    comparator.dispose();
  });

  it('la cuota global de briznas se reparte entre pasadas filtradas', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      { ...terrainOptionsPreset('isla'), seed: 42 },
    );
    comparator.setMode('suave');

    const sandCells: (readonly [number, number])[] = [];
    for (let j = 16; j < 32; j += 1) {
      for (let i = 32; i < 48; i += 1) sandCells.push([i, j]);
    }
    const sandLayer = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'sand' },
      [],
      sandCells,
    );
    const zoneA: readonly (readonly [number, number])[] = [[16, 16], [17, 16], [16, 17], [17, 17]];
    const zoneB: readonly (readonly [number, number])[] = [[40, 24], [41, 24], [40, 25], [41, 25]];
    const grassA = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'add' },
      [sandLayer],
      zoneA,
    );
    const grassB = createPaintedLayer(
      { ...DEFAULT_BRUSH_STATE, kind: 'grass', mode: 'add' },
      [sandLayer, grassA],
      zoneB,
    );

    /* Primera pasada: sin capas previas el filtro es completo (presupuesto
     * entero). La segunda pasada conserva los chunks fuera de A∪B y debe
     * recibir SOLO el cupo restante (10000 − conservadas). */
    comparator.setLayers([sandLayer, grassA]);
    vi.mocked(gameCore.buildGrassField).mockClear();
    comparator.setLayers([sandLayer, grassA, grassB]);

    const call = vi.mocked(gameCore.buildGrassField).mock.calls.at(-1)!;
    const result = vi.mocked(gameCore.buildGrassField).mock.results.at(-1)!.value as GrassFieldResult;
    const keptBlades = comparator.terrainStats().grassBlades! - result.bladeCount;
    expect(call[5]!.maxInstances).toBe(GRASS_FIELD_LIMITS.maxInstances - keptBlades);
    expect(call[5]!.maxInstances).toBeLessThan(GRASS_FIELD_LIMITS.maxInstances);
    expect(call[5]!.maxInstances).toBeGreaterThan(0);
    expect(comparator.terrainStats().grassBlades!).toBeLessThanOrEqual(GRASS_FIELD_LIMITS.maxInstances);
    comparator.dispose();
  });

  it('el ciclo de vida no acumula geometrías ni materiales al regenerar y libera en dispose', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      42,
      0,
      0,
      { ...terrainOptionsPreset('isla'), seed: 42 },
    );
    comparator.setMode('suave');

    const countLiving = (): { geometries: number; materials: number; meshes: number } => {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      let meshes = 0;
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          meshes += 1;
          geometries.add(object.geometry);
          const material = object.material;
          if (Array.isArray(material)) {
            material.forEach(entry => materials.add(entry));
          } else {
            materials.add(material);
          }
        }
      });
      return { geometries: geometries.size, materials: materials.size, meshes };
    };

    const before = countLiving();
    expect(before.meshes).toBeGreaterThan(0);
    for (let seed = 1; seed <= 8; seed += 1) {
      comparator.regenerate(seed * 1000);
    }
    const after = countLiving();
    expect(after.geometries).toBe(before.geometries);
    expect(after.materials).toBe(before.materials);

    /* La geometría de un mesh anterior queda liberada al regenerar. */
    const world = scene.children[0] as THREE.Group;
    const smoothGroup = [...world.children].reverse().find(child =>
      child instanceof THREE.Group && child.children.length === 3) as THREE.Group;
    const terrainMesh = smoothGroup.children[0] as THREE.Mesh;
    const disposeSpy = vi.spyOn(terrainMesh.geometry, 'dispose');
    comparator.regenerate(999);
    expect(disposeSpy).toHaveBeenCalled();

    comparator.dispose();
    expect(scene.children).toHaveLength(0);
  });
});

describe('comparador procedural — sombras PCF del estilo Sakura (138A-15)', () => {
  it('setShadowCasting marca terreno/props y conserva agua y pasto sin sombra', () => {
    const scene = new THREE.Scene();
    const comparator: ProceduralComparator = mountProceduralComparator(
      scene,
      createWorldBend(),
      new THREE.Texture(),
      1337,
      0,
      0,
      { ...terrainOptionsPreset('isla'), cellSize: 1 },
    );

    const world = scene.children[0] as THREE.Group;
    const water = world.children[0] as THREE.Mesh;
    expect(water.userData.noShadow).toBe(true);

    comparator.setShadowCasting(true);
    const blocksGroup = [...world.children].find(child =>
      child instanceof THREE.Group && child.children.length === 2) as THREE.Group;
    const blocksTerrain = blocksGroup.children[0] as THREE.Mesh;
    const blocksProps = blocksGroup.children[1] as THREE.Mesh;
    expect(blocksTerrain.castShadow).toBe(true);
    expect(blocksTerrain.receiveShadow).toBe(true);
    expect(blocksProps.castShadow).toBe(true);
    expect(blocksProps.receiveShadow).toBe(false);
    expect(water.castShadow).toBe(false);
    expect(water.receiveShadow).toBe(false);

    /* Tras regenerar, los meshes nuevos conservan los flags. */
    comparator.regenerate(4242);
    const regeneratedBlocks = [...world.children].find(child =>
      child instanceof THREE.Group && child.children.length === 2) as THREE.Group;
    expect((regeneratedBlocks.children[0] as THREE.Mesh).castShadow).toBe(true);
    expect((regeneratedBlocks.children[0] as THREE.Mesh).receiveShadow).toBe(true);

    comparator.setShadowCasting(false);
    expect((regeneratedBlocks.children[0] as THREE.Mesh).castShadow).toBe(false);
    comparator.dispose();
  });
});
