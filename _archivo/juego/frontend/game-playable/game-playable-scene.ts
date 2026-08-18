/* GAME-01 — Renderer del fixture jugable.
 * Three.js vive detrás de este adaptador: recibe snapshots puros de game-core
 * y no decide movimiento, colisiones ni identidad. El contenido estático se
 * limita a la ventana visible mediante el cache lógico de chunks.
 */

import * as THREE from 'three';
import {
  buildMapVersionFromOptions,
  editMapVersionObjects,
  MapChunkCache,
  mapBuilderStats,
  mergePaintedCells,
  normalizeWorldPalette,
  normalizeTerrainOptions,
  normalizeTerrainLayerStack,
  normalizeGrassFieldOptions,
  normalizeSkyOptions,
  SKY_DEFAULTS,
  GRASS_FIELD_DEFAULTS,
  parseSerializedWorld,
  TERRAIN_LAYER_LIMITS,
  terrainOptionsPreset,
  WORLD_PALETTE_DEFAULTS,
  type MapEditOp,
  type MapVersion,
  type RenderStyle,
  type TerrainLayer,
  type TerrainOptions,
  type WorldPalette,
  type GrassFieldOptions,
  type SkyOptions,
  type WorldMap,
  type WorldSnapshot,
} from '../../../game-core';
import {
  createCurvedFigure,
  createCurvedFigureMaterials,
  type ForestMaterials,
} from '../game-shared/forest-models';
import { createWorldBend } from './game-world-bend';
import { mountCurvedIsland } from './game-curved-island';
import { mountCurvedIslandPanel } from './game-curved-island-panel';
import {
  CONSTRUCTOR_PANEL_DEFAULT_WIDTH,
  createRemovedInstancesStore,
  loadConstructorState,
  saveConstructorState,
  type ConstructorPanelState,
} from './game-constructor-persistence';
import {
  attachCameraModeShortcut,
  DEFAULT_CAMERA_MODE,
  type CameraMode,
} from './game-camera-modes';
import {
  applyFreeFlyKeyDown,
  applyFreeFlyKeyUp,
  cameraDirection,
  clampCameraTarget,
  createFreeFlyKeys,
  isEditableTarget,
  positionFirstPersonCamera,
  resetFreeFlyKeys,
  resolveThirdPersonCollision,
  rotateCameraLook,
  updateFreeFlyCamera,
  type CameraBounds,
  type CameraLook,
  type FreeFlyKeys,
} from './game-camera-controls';
import {
  DEFAULT_BRUSH_STATE,
  normalizeBrushState,
  type ConstructorBrushState,
} from './game-layer-brush';
import { createPaintedLayer, terrainLayerKindOfBrush } from './game-layer-editor';
import { attachLayerPainter } from './game-layer-painter';
import { mountProceduralComparator } from './game-procedural-comparator';
import { downloadSerializedWorld } from './game-world-io';
import { estimateSceneGpuMemory } from './game-scene-gpu-estimate';
import {
  createToonRamp,
  disposeObjectGeometries,
  disposeScene,
} from './game-scene-utils';
import { createDebouncedRegenerator } from './game-realtime-debounce';
import { mountSkyDome, type SkyDomeHandle } from './game-sky';
import {
  normalizeVisualStyle,
} from './game-sakura-preset';
import {
  isCachedRamp,
} from './game-sakura-toon';
import {
  applyFigureShadowFlags,
  createSakuraSceneEffects,
} from './game-sakura-scene-effects';
import { createConstructorPicker } from './game-constructor-picking';
import { formatConstructorStats } from './game-constructor-stats';
import { loadToonRampFromDataUrl } from './game-toon-ramp-loader';
import { FIXTURE_PROPS } from './game-fixture-map';
import { ASSET_DRAG_MIME } from './game-constructor-assets';
import { createGamePlayableVisualCache } from './game-playable-visual-cache';
import {
  readAvailableHeapMemory,
  readRendererMetrics,
  type GameRendererMetrics,
} from './game-renderer-metrics';
import {
  createGpuFrameProbe,
  readGpuIdentity,
  type GpuFrameProbe,
  type GpuIdentity,
  type GpuMemoryEstimate,
} from './game-gpu-probe';

export interface GamePlayableStreamingStats {
  readonly cacheSize: number;
  readonly visibleChunks: number;
  readonly visibleInstances: number;
  readonly visibleAssets: number;
}

export interface GamePlayableBatchStats {
  readonly drawCalls: number;
  readonly sourceMeshes: number;
}

export interface GamePlayableSceneHandle {
  readonly canvas: HTMLCanvasElement;
  readonly update: (snapshot: WorldSnapshot, localEntityId?: string) => void;
  readonly resize: () => void;
  readonly render: () => void;
  /* [GAME-01-VIS] Azimuth orbital actual para que el runtime convierta el
   * input relativo a cámara en dirección de mundo (teclas tipo Genshin). */
  readonly getCameraAzimuth: () => number;
  /* [128A-1] Follow de cámara conmutable desde el panel temporal. */
  readonly setCameraFollow: (follow: boolean) => void;
  readonly streamingStats: () => GamePlayableStreamingStats;
  readonly rendererMetrics: () => GameRendererMetrics;
  readonly batchStats: () => GamePlayableBatchStats;
  readonly gpuIdentity: () => GpuIdentity | null;
  readonly gpuFrameMs: () => number | null;
  readonly gpuMemoryEstimate: () => GpuMemoryEstimate;
  readonly destroy: () => void;
}

/* Cámara orbital (Genshin): distancia y ángulos controlables. */
const CAMERA_DISTANCE = 16;
const CAMERA_MIN_DISTANCE = 7;
const CAMERA_MAX_DISTANCE = 30;
const CAMERA_MIN_POLAR = 0.35;
const CAMERA_MAX_POLAR = 1.15;
/* [GAME-01-VIS] Firmeza del follow de cámara (1/s): la cámara se mantiene
 * pegada al personaje como en un mundo abierto, con suavizado exponencial
 * independiente del framerate (a 60 fps ≈ 18% por frame). */
const CAMERA_FOLLOW_RATE = 12;
const STREAM_HALF_WIDTH = 4;
const STREAM_HALF_DEPTH = 4;
/* Culling avanzado: radio circular de visibilidad (unidades de mundo) que
 * recorta chunks/instancias en las esquinas de la ventana rectangular. */
const STREAM_MAX_DISTANCE = 26;
/* [GAME-01-VIS] Con cámara orbital libre el borde lejano del frustum cae más
 * allá del jugador cuanto más zoom out; el radio de streaming crece con la
 * distancia de cámara (+18 cubre el extremo horizontal del frustum a FOV 50°)
 * para evitar pop-in al alejar. */
const STREAM_MARGIN_BEYOND_CAMERA = 18;
const FOG_NEAR_MARGIN = 8;
const FOG_FAR_OFFSET = 34;

export function mountGamePlayableScene(
  host: HTMLElement,
  map: WorldMap,
  mapVersion: MapVersion,
): GamePlayableSceneHandle {
  /* [GAME-01-VIS] Dirección aprobada 05-ago: low poly verde stylized con
   * cielo despejado (referencia de estilo tipo Genshin). El contrato de mapa
   * no cambia; solo renderer, paleta y cámara. */
  const scene = new THREE.Scene();
  /* [138A-8] Fondo reutilizable: la paleta del mundo puede teñir cielo y
   * niebla en tiempo real sin recrear colores en cada cambio. */
  const backgroundColor = new THREE.Color(0xaecfc4);
  scene.background = backgroundColor;
  const fog = new THREE.Fog(0xaecfc4, CAMERA_DISTANCE + FOG_NEAR_MARGIN, CAMERA_DISTANCE + FOG_FAR_OFFSET);
  scene.fog = fog;

  /* [GAME-01-VIS] Cámara libre orbital tipo Genshin: el jugador arrastra
   * para orbitar y usa la rueda/pellizco para acercar; el punto focal sigue
   * al personaje. Sustituye la isométrica fija del boceto. */
  /* [138A-12] El far crece para contener la cúpula de cielo (radio 260): la
   * esfera sigue a la cámara con frustumCulled=false y su borde queda muy
   * por delante del límite del frustum sin recortes. */
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.setAttribute('aria-label', 'Bosque jugable offline');
  host.appendChild(renderer.domElement);

  /* Paleta "Curved Island" (referencia visual): arena, roca hueso, agua teal,
   * cielo overcast y toon ramp de 4 bandas. El bending se aplica a todos los
   * materiales para la curva de mundo. */
  const bend = createWorldBend();
  let toonRamp: THREE.Texture = createToonRamp();
  const curved = (color: number): THREE.MeshToonMaterial => bend.apply(
    new THREE.MeshToonMaterial({ color, gradientMap: toonRamp }),
  );
  const materials: ForestMaterials = {
    ink: curved(0xcb9a63),    /* troncos */
    paper: curved(0x93d268),  /* follaje */
    pale: curved(0xf7b845),   /* arena / suelo */
    middle: curved(0xdccfba), /* roca / camino */
    water: curved(0x36a79e),  /* agua profunda */
    lines: new THREE.LineBasicMaterial({ color: 0x2f5d43 }),
  };

  const figureMaterials = createCurvedFigureMaterials();
  for (const material of Object.values(figureMaterials)) {
    bend.apply(material);
    if (material instanceof THREE.MeshToonMaterial) material.gradientMap = toonRamp;
  }

  /* [138A-12] El skydome procedural reemplaza las luces estáticas: la luz
   * direccional y la hemisférica se sincronizan al vector solar del panel
   * de Ambiente (misma dirección que las nubes y el disco del shader). */
  const skyDome: SkyDomeHandle = mountSkyDome(scene, { ...SKY_DEFAULTS });
  const rim = new THREE.DirectionalLight(0xcfe6ff, 0.4);
  rim.position.set(-6, 4, -5);
  scene.add(rim);

  /* [CURVED-ISLAND] Override temporal del terreno: la isla de la referencia
   * sustituye visualmente los chunks del fixture (sin tocar colisión). Se
   * centra en el punto medio de los bounds del mapa para que la zona jugable
   * quede siempre sobre tierra y no sobre el agua. */
  const islandCenterX = (map.bounds.minX + map.bounds.maxX) / 2;
  const islandCenterZ = (map.bounds.minZ + map.bounds.maxZ) / 2;
  const curvedIsland = mountCurvedIsland(scene, bend, toonRamp, 1337, islandCenterX, islandCenterZ);

  /* [138A-1] Comparador visual del toolkit procedural: montado oculto; el
   * panel lo activa para probar el mismo seed en bloques vs suave. */
  const proceduralComparator = mountProceduralComparator(scene, bend, toonRamp, 1337, islandCenterX, islandCenterZ);
  proceduralComparator.setVisible(false);
  let comparatorVisible = false;
  let comparatorMode: RenderStyle = 'bloques';

  /* [138A-8] Rampa toon global conmutable: reemplaza la textura en todos los
   * materiales toon (isla curva, figura y comparador) sin regenerar mallas.
   * La textura anterior se libera salvo si es una rampa de la caché sakura
   * (compartida por módulo: teardown de escena NO debe disponerla). */
  const applyToonRamp = (next: THREE.Texture): void => {
    if (!isCachedRamp(toonRamp)) toonRamp.dispose();
    toonRamp = next;
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshToonMaterial) {
        object.material.gradientMap = next;
      }
    });
    for (const material of Object.values(materials)) {
      if (material instanceof THREE.MeshToonMaterial) material.gradientMap = next;
    }
    for (const material of Object.values(figureMaterials)) {
      if (material instanceof THREE.MeshToonMaterial) material.gradientMap = next;
    }
    proceduralComparator.setToonRamp(next);
  };

  /* [138A-15] Efectos de escena del estilo Sakura Crossing (tinte violeta,
   * luces fill/bounce, sombras PCF 2048, paleta/cielo pastel, pipeline
   * ink→grade→fxaa). Creado tras applyToonRamp (dependencia); el panel se
   * inyecta diferido: sus hooks solo se invocan post-init, nunca aquí. */
  const styleEffects = createSakuraSceneEffects({
    scene,
    renderer,
    camera,
    backgroundColor,
    fog,
    skyDome,
    proceduralComparator,
    applyToonRamp,
    materials,
    figureMaterials,
    readPalette: () => constructorPalette,
    writePalette: (next) => { constructorPalette = next; },
    readSky: () => constructorSky,
    writeSky: (next) => { constructorSky = next; },
    panel: {
      setConstructorPalette: (palette) => panel.setConstructorPalette(palette),
      setConstructorSky: (sky) => panel.setConstructorSky(sky),
    },
  });

  /* [128A-1] Follow de cámara conmutable desde el panel temporal. */
  let followPlayer = true;
  /* [138A-4] Estado del constructor: últimas opciones y documento generado. */
  let constructorOptions: TerrainOptions = terrainOptionsPreset('isla');
  /* [138A-8] Documento inicial con el mismo pipeline que el comparador, para
   * que el panel de Assets y el drop tengan instancias desde el primer frame
   * (el comparador lo consume oculto; su generación propia ya coincide). */
  let constructorMap: MapVersion | null = buildMapVersionFromOptions(constructorOptions);
  proceduralComparator.setDocument(constructorMap);
  /* [138A-14] Store de instancias removidas: al recargar se reaplican sobre
   * el mundo regenerado para que quitar un asset (p. ej. `inst-0 ·
   * asset-rock`) sea persistente y no reaparezca. */
  const removedInstancesStore = createRemovedInstancesStore();
  /* [138A-9] Stack de capas del editor de mapa: se aplica SIEMPRE sobre la
   * base generada en el comparador y en el documento, y se persiste/exporta
   * para que sobreviva a regeneraciones y recargas. */
  let constructorLayers: readonly TerrainLayer[] = [];
  /* [138A-9] Estado del pincel (compartido con el visor de capas). */
  let constructorBrush: ConstructorBrushState = { ...DEFAULT_BRUSH_STATE };
  /* [138A-10] Opciones del generador de pasto (densidad/tamaño/color);
   * el comparador regenera el campo instanciado por chunks al cambiarlas. */
  let constructorGrass: GrassFieldOptions = { ...GRASS_FIELD_DEFAULTS };
  /* [138A-8] Paleta del mundo y estado de ventana del Constructor (se
   * restauran desde storage en el bloque de restore, más abajo). */
  let constructorPalette: WorldPalette = { ...WORLD_PALETTE_DEFAULTS };
  /* [138A-12] Opciones del cielo (skydome): se restauran desde storage en
   * el bloque de restore y se aplican al shader/luces con debounce. */
  let constructorSky: SkyOptions = { ...SKY_DEFAULTS };
  let constructorPanelState: ConstructorPanelState = {
    collapsed: false,
    side: 'right',
    width: CONSTRUCTOR_PANEL_DEFAULT_WIDTH,
  };

  /* [138A-6] Solo quedan dos estilos (bloques/suave): seleccionar uno muestra
   * el comparador del constructor; la isla curva queda como referencia
   * histórica inicial, sin selector propio. */
  const applyTerrainMode = (terrainMode: RenderStyle): void => {
    comparatorMode = terrainMode;
    comparatorVisible = true;
    curvedIsland.setVisible(false);
    proceduralComparator.setVisible(true);
    proceduralComparator.setMode(comparatorMode);
    /* [138A-9] El visor de capas lee el estilo de las opciones para elegir
     * pinceles (suave pinta superficies; bloques coloca/quita bloques). Se
     * sincroniza sin emitir el cambio (applyOptions no dispara controles). */
    constructorOptions = { ...constructorOptions, style: terrainMode };
    panel.setConstructorOptions(constructorOptions);
    panel.setTerrainMode(terrainMode);
    constructorPicking.applyPick(null);
    /* [138A-5][138A-7] El estilo y la cámara se persisten con las opciones. */
    persistConstructorState(terrainMode);
  };

  /* [138A-4] Genera el documento con el pipeline puro y muestra el resultado
   * en el comparador (misma base de opciones para bloques/suave).
   * [138A-5] Al regenerar en tiempo real se conserva el modo visible del
   * comparador en vez de volver a 'bloques' en cada cambio de valor. */
  const showConstructorWorld = (options: TerrainOptions): void => {
    constructorOptions = normalizeTerrainOptions(options);
    /* [138A-9] El stack de capas se aplica al generar el documento y al
     * regenerar el comparador (paridad preview ↔ documento/export). */
    constructorMap = buildMapVersionFromOptions(
      constructorOptions,
      'constructor-bosque',
      constructorLayers,
    );
    /* [138A-14] Reaplica las instancias removidas sobre CADA mundo generado
     * (inicial, regeneración en vivo por seed/densidad e import), no solo en
     * el restore: así la vista y el estado persistido coinciden. El store
     * descarta los ids que ya no existen en el documento regenerado. */
    constructorMap = removedInstancesStore.reapply(constructorMap);
    /* [138A-8] El documento es la fuente del comparador: los assets pintados
     * sobreviven a la regeneración (rebuildDocumentProps usa el actual). */
    proceduralComparator.setDocument(constructorMap);
    proceduralComparator.setLayers(constructorLayers);
    /* [138A-11] El pasto viaja en la misma regeneración: antes se hacían dos
     * rebuilds seguidos (setGrassOptions + regenerateFromOptions) y el campo
     * se recalculaba dos veces por cambio de valor. */
    proceduralComparator.regenerateFromOptions(constructorOptions, constructorGrass);
    panel.setConstructorOptions(constructorOptions);
    panel.setConstructorStats(formatConstructorStats(mapBuilderStats(constructorMap)));
    applyTerrainMode(comparatorVisible ? comparatorMode : 'bloques');
  };

  /* [138A-9] Cambio del stack desde el visor de capas (añadir/orden/ojo/
   * eliminar): se reaplica sobre la base generada en el comparador y se
   * persiste. El documento conserva sus instancias (ediciones del usuario);
   * las alturas/superficies del preview siempre reflejan el stack. */
  const applyConstructorLayers = (layers: readonly TerrainLayer[]): void => {
    try {
      constructorLayers = normalizeTerrainLayerStack(layers);
      proceduralComparator.setLayers(constructorLayers);
      panel.setConstructorStats(
        `capas ${constructorLayers.length} · ${constructorLayers.filter(layer => layer.enabled).length} activas`,
      );
      persistConstructorState(comparatorMode);
    } catch (error) {
      panel.setConstructorStats(error instanceof Error ? `error: ${error.message}` : 'capas inválidas');
    }
  };

  /* [138A-9] Cambio del pincel desde el visor de capas. */
  const applyConstructorBrush = (brush: ConstructorBrushState): void => {
    constructorBrush = normalizeBrushState(brush);
    panel.setConstructorBrush(constructorBrush);
  };

  /* [138A-9] Pincelada del painter: acumula celdas en una capa pintada del
   * stack (nueva por sesión si el pincel no apunta a una existente). Los
   * círculos del panel nunca se convierten: solo reciben capas pintadas. */
  const applyBrushStroke = (
    cells: readonly (readonly [number, number])[],
    _ended: boolean,
  ): void => {
    if (cells.length === 0) return;
    try {
      let target = constructorBrush.targetLayerId
        ? constructorLayers.find(layer => layer.id === constructorBrush.targetLayerId)
        : undefined;
      if (!target || target.kind !== terrainLayerKindOfBrush(constructorBrush.kind)) {
        target = createPaintedLayer(constructorBrush, constructorLayers);
        constructorLayers = [...constructorLayers, target];
        constructorBrush = { ...constructorBrush, targetLayerId: target.id };
        panel.setConstructorBrush(constructorBrush);
      }
      /* Los círculos del panel nunca se convierten en pintados (fail-closed). */
      if (target.shape.kind !== 'painted') {
        throw new Error('la capa objetivo no es pintada');
      }
      if (target.shape.cells.length + cells.length > TERRAIN_LAYER_LIMITS.maxPaintedCells) {
        throw new Error('cuota de celdas pintadas alcanzada');
      }
      const merged = mergePaintedCells(target.shape.cells, cells);
      const updated: TerrainLayer = target.kind === 'elevation'
        ? {
          ...target,
          shape: { kind: 'painted', cells: merged },
          height: (constructorBrush.direction === 'lower' ? -1 : 1)
            * constructorBrush.height * constructorBrush.strength,
          falloff: constructorBrush.falloff,
          falloffRadius: Math.max(0.25, constructorBrush.radius * 2),
          bias: constructorBrush.strength,
        }
        : {
          ...target,
          shape: { kind: 'painted', cells: merged },
          falloff: constructorBrush.falloff,
          falloffRadius: Math.max(0.25, constructorBrush.radius * 2),
          bias: constructorBrush.strength,
          hardness: 0.5,
          /* [138A-10] El pincel de pasto lleva su modo add/remove a la capa
           * de vegetación (later wins en la máscara). */
          ...(target.kind === 'vegetation' ? { mode: constructorBrush.mode } : {}),
        };
      constructorLayers = constructorLayers.map(layer => layer.id === updated.id ? updated : layer);
      applyConstructorLayers(constructorLayers);
      panel.setConstructorStats(`pincel · ${merged.length} celdas en «${updated.name}»`);
    } catch (error) {
      panel.setConstructorStats(error instanceof Error ? `error: ${error.message}` : 'pincelada inválida');
    }
  };

  /* [138A-5] Regeneración en vivo: los cambios de controles se agrupan ~200 ms
   * y la última opción gana; se cancela en destroy. */
  const regenerateDebounced = createDebouncedRegenerator<TerrainOptions>(200, (options) => {
    showConstructorWorld(options);
  });
  /* [138A-8] La paleta se aplica con el mismo debounce de 200 ms para no
   * reconstruir mallas ni persistir en cada evento `input` del picker. */
  const paletteDebounced = createDebouncedRegenerator<WorldPalette>(200, (palette) => {
    const next = normalizeWorldPalette(palette);
    constructorPalette = next;
    proceduralComparator.setPalette(next);
    backgroundColor.setHex(next.sky);
    fog.color.copy(backgroundColor);
    persistConstructorState(comparatorMode);
  });
  /* [138A-10] Las opciones de pasto se aplican con el mismo debounce (no se
   * regeneran mallas ni se persiste en cada evento del slider/picker). */
  const grassDebounced = createDebouncedRegenerator<GrassFieldOptions>(200, (grass) => {
    const next = normalizeGrassFieldOptions(grass);
    constructorGrass = next;
    proceduralComparator.setGrassOptions(next);
    persistConstructorState(comparatorMode);
  });
  /* [138A-12] Las opciones de cielo se aplican con el mismo debounce (no se
   * persiste en cada evento del slider ni se recompila el shader). */
  const skyDebounced = createDebouncedRegenerator<SkyOptions>(200, (sky) => {
    const next = normalizeSkyOptions(sky);
    constructorSky = next;
    skyDome.update(next);
    /* [138A-15] En sakura el update resetea sol/hemisférica: se reaplican
     * los overrides del clon para que el look no se pierda al mover el
     * cielo (la dirección solar sí sigue al usuario). */
    if (styleEffects.isSakura()) styleEffects.reapplyLightingOverrides();
    persistConstructorState(comparatorMode);
  });

  /* [138A-7] Persiste opciones + estilo + cámara en una sola llamada. */
  const persistConstructorState = (mode: RenderStyle): void => {
    saveConstructorState({
      version: 1,
      options: constructorOptions,
      mode,
      camera: cameraMode,
      palette: constructorPalette,
      panel: constructorPanelState,
      layers: constructorLayers,
      grass: constructorGrass,
      sky: constructorSky,
      style: styleEffects.getStyle(),
      removedInstanceIds: removedInstancesStore.serialize(),
    });
  };

  /* [138A-7] Cambio de modo de cámara (panel, atajo C y restauración). Al
   * entrar en primera persona la mirada parte del azimuth orbital para evitar
   * saltos; el panel se sincroniza vía `syncCameraSegment` (asignado tras
   * montarlo, patrón 138A-5) y el modo se persiste con el constructor. */
  let syncCameraSegment: ((mode: CameraMode) => void) | null = null;
  const setCameraMode = (mode: CameraMode): void => {
    cameraMode = mode;
    if (mode === 'primera') {
      look.yaw = orbit.azimuth;
      look.pitch = 0;
    } else if (mode === 'libre') {
      /* El vuelo libre parte desde la órbita actual para no saltar: la
       * posición se copia del offset orbital y la mirada de su geometría. */
      const sinPolar = Math.sin(orbit.polar);
      camera.position.copy(cameraTarget).add(new THREE.Vector3(
        orbit.distance * sinPolar * Math.sin(orbit.azimuth),
        orbit.distance * Math.cos(orbit.polar),
        orbit.distance * sinPolar * Math.cos(orbit.azimuth),
      ));
      camera.position.copy(clampCameraTarget(camera.position, activeCameraBounds()));
      look.yaw = orbit.azimuth;
      look.pitch = orbit.polar - Math.PI / 2;
      cameraTarget.copy(camera.position).add(cameraDirection(look));
    } else {
      /* Al salir del vuelo libre se limpian las teclas para no arrastrar
       * movimiento fantasma al volver a entrar. */
      resetFreeFlyKeys(freeKeys);
    }
    updateLocalFigureVisibility();
    syncCameraSegment?.(mode);
    persistConstructorState(comparatorMode);
  };

  /* [138A-8] Ediciones de objetos (Quitar/Limpiar del panel Assets y drop de
   * instancias): fail-closed con las cuotas y bounds del MapVersion. El panel
   * sincroniza su inventario vía applyMap y el comparador repinta los props. */
  const applyConstructorObjectEdits = (ops: readonly MapEditOp[]): void => {
    try {
      constructorMap = editMapVersionObjects(
        constructorMap ?? buildMapVersionFromOptions(constructorOptions),
        ops,
      );
      /* [138A-14] Solo se acumulan los removidos si la edición fue válida
       * (fail-closed: una operación inválida no deja ids fantasma). */
      removedInstancesStore.track(ops);
      proceduralComparator.setDocument(constructorMap);
      panel.setConstructorMap(constructorMap);
      panel.setConstructorStats(formatConstructorStats(mapBuilderStats(constructorMap)));
      persistConstructorState(comparatorMode);
    } catch (error) {
      panel.setConstructorStats(error instanceof Error ? `error: ${error.message}` : 'edición inválida');
    }
  };

  const panel = mountCurvedIslandPanel(host, {
    setCurvature: (down, pull) => bend.setCurvature(down, pull),
    setRain: (amount) => curvedIsland.setRain(amount),
    setPropsVisible: (visible) => {
      curvedIsland.setPropsVisible(visible);
      proceduralComparator.setPropsVisible(visible);
    },
    setCameraFollow: (follow) => { followPlayer = follow; },
    regenerate: () => {
      const newSeed = Math.floor(Math.random() * 99999);
      curvedIsland.regenerate(newSeed);
      proceduralComparator.regenerate(newSeed);
    },
    setTerrainMode: applyTerrainMode,
    setCameraMode,
    worldConstructor: {
      onGenerate: (options) => {
        /* [138A-5] Generar de forma explícita cancela el debounce pendiente
         * para no regenerar dos veces seguidas. */
        regenerateDebounced.cancel();
        showConstructorWorld(options);
      },
      onChange: (options) => regenerateDebounced.schedule(options),
      onExport: () => downloadSerializedWorld(constructorOptions, constructorMap, constructorLayers),
      onImport: (text) => {
        try {
          const world = parseSerializedWorld(text);
          constructorOptions = world.options;
          constructorMap = world.map;
          /* [138A-14] Un mundo importado es un documento nuevo: se limpia el
           * historial de removidos de la sesión anterior para no reaplicar
           * ids que no corresponden a este mundo. */
          removedInstancesStore.restore(undefined);
          /* [138A-9] El import recupera el stack de capas del mundo. */
          constructorLayers = world.layers ? normalizeTerrainLayerStack(world.layers) : [];
          proceduralComparator.setDocument(constructorMap);
          proceduralComparator.setLayers(constructorLayers);
          proceduralComparator.regenerateFromOptions(world.options);
          panel.setConstructorOptions(world.options);
          panel.setConstructorLayers(constructorLayers);
          panel.setConstructorStats(formatConstructorStats(mapBuilderStats(world.map)));
          applyTerrainMode('bloques');
        } catch (error) {
          panel.setConstructorStats(error instanceof Error ? `error: ${error.message}` : 'mundo inválido');
        }
      },
      onPaletteChange: (palette) => {
        paletteDebounced.schedule(palette);
      },
      onEditObjects: applyConstructorObjectEdits,
      onLayersChange: applyConstructorLayers,
      onBrushStateChange: applyConstructorBrush,
      onGrassChange: (grass) => {
        grassDebounced.schedule(grass);
      },
      onSkyChange: (sky) => {
        skyDebounced.schedule(sky);
      },
      onStyleChange: (style) => {
        styleEffects.apply(style);
        persistConstructorState(comparatorMode);
        panel.setConstructorStats(styleEffects.getStyle().key === 'sakura'
          ? 'estilo Sakura Crossing aplicado'
          : 'estilo Bosque aplicado');
      },
      onToonRampChange: (dataUrl) => {
        if (dataUrl === null) {
          applyToonRamp(createToonRamp());
          panel.setConstructorStats('rampa restaurada');
          return;
        }
        loadToonRampFromDataUrl(dataUrl)
          .then((ramp) => {
            applyToonRamp(ramp);
            panel.setConstructorStats('rampa aplicada');
          })
          .catch((error) => {
            panel.setConstructorStats(error instanceof DOMException && error.name === 'SecurityError'
              ? 'error: imagen cross-origin sin CORS (usa data: o mismo origen)'
              : error instanceof Error ? `error: ${error.message}` : 'rampa inválida');
          });
      },
    },
    initialPalette: constructorPalette,
    initialMap: constructorMap,
    initialStyle: styleEffects.getStyle(),
    constructorPanelState,
    onConstructorPanelStateChange: (state) => {
      constructorPanelState = state;
      persistConstructorState(comparatorMode);
    },
  });
  syncCameraSegment = (mode) => panel.setCameraMode(mode);

  const chunkCache = new MapChunkCache(mapVersion);
  const visualCache = createGamePlayableVisualCache({
    scene,
    materials,
    map: mapVersion,
    props: new Map(FIXTURE_PROPS.map(prop => [prop.id, prop])),
    hideTerrain: true,
  });

  /* Probe físico de GPU: identidad, tiempo de frame y memoria estimada. El
   * contexto WebGL real viene del renderer; el probe es opcional y nunca
   * rompe el fixture si la extensión no existe. */
  const gl = renderer.getContext() as unknown as Parameters<typeof createGpuFrameProbe>[0] | null;
  const gpuFrameProbe: GpuFrameProbe = gl
    ? createGpuFrameProbe(gl as Parameters<typeof createGpuFrameProbe>[0])
    : { available: false, beginFrame() {}, endFrame() {}, readFrameMs: () => null, dispose() {} };
  const gpuIdentity: GpuIdentity | null = gl ? readGpuIdentity(gl as Parameters<typeof readGpuIdentity>[0]) : null;
  let lastGpuFrameMs: number | null = null;
  let currentStreamingStats: GamePlayableStreamingStats = {
    cacheSize: 0,
    visibleChunks: 0,
    visibleInstances: 0,
    visibleAssets: 0,
  };
  let currentRendererMetrics: GameRendererMetrics = readRendererMetrics({});

  const streamProps = (center: { x: number; z: number }): void => {
    /* [GAME-01-VIS] Radio adaptativo: nunca por debajo del mínimo y crece con
     * el zoom de la cámara orbital para cubrir el borde lejano del frustum. */
    const maxDistance = Math.max(STREAM_MAX_DISTANCE, orbit.distance + STREAM_MARGIN_BEYOND_CAMERA);
    const visible = chunkCache.select({
      center,
      halfWidth: STREAM_HALF_WIDTH,
      halfDepth: STREAM_HALF_DEPTH,
      marginCells: 0,
      maxDistance,
    });
    visualCache.sync(visible);
    currentStreamingStats = {
      cacheSize: visible.cacheSize,
      visibleChunks: visible.chunks.length,
      visibleInstances: visible.instances.length,
      visibleAssets: visible.assets.length,
    };
  };

  const entities = new Map<string, THREE.Group>();
  /* [138A-9] En primera persona no se renderiza el cuerpo del personaje
   * local (la cámara está en sus ojos); se reaplica al crear entidades y al
   * cambiar de modo. */
  const updateLocalFigureVisibility = (): void => {
    const local = entities.get('local');
    if (local) local.visible = cameraMode !== 'primera';
  };
  let currentPlayer = { x: 0, z: -0.5 };
  let currentPlayerY = 0;
  let cameraTarget = new THREE.Vector3(currentPlayer.x, 0, currentPlayer.z);
  let lastCameraTime = performance.now();
  let lastRenderTime = performance.now();
  let waterTimeSeconds = 0;
  /* [GAME-01-VIS] Estado orbital: distancia y ángulos que el jugador controla
   * con arrastre (azimuth/polar) y rueda o pellizco (distancia). */
  let orbit = { distance: CAMERA_DISTANCE, azimuth: Math.PI / 4, polar: 0.85 };
  /* [138A-7] Modo de cámara activo y mirada de primera persona (yaw/pitch).
   * `look.yaw` comparte la convención de `rotateInputToWorld`: la cámara
   * mira hacia (-sin(yaw), -cos(yaw)) en X/Z para que W aleje de la cámara. */
  let cameraMode: CameraMode = DEFAULT_CAMERA_MODE;
  let look: CameraLook = { yaw: Math.PI / 4, pitch: 0 };
  /* [138A-9] Teclas del vuelo libre; se limpian al salir del modo. */
  const freeKeys: FreeFlyKeys = createFreeFlyKeys();
  let dragging = false;
  let lastPointer: { x: number; y: number } | null = null;
  let destroyed = false;

  /* [138A-9] Límites del mundo visible: el comparador del constructor genera
   * su propio bounds (centrado en la isla), así la cámara no queda encerrada
   * en el chunk del fixture cuando el mapa procedural es más grande. */
  const activeCameraBounds = (): CameraBounds =>
    comparatorVisible && constructorMap
      ? {
        minX: constructorMap.terrain.bounds.minX + islandCenterX,
        maxX: constructorMap.terrain.bounds.maxX + islandCenterX,
        minZ: constructorMap.terrain.bounds.minZ + islandCenterZ,
        maxZ: constructorMap.terrain.bounds.maxZ + islandCenterZ,
      }
      : map.bounds;

  const updateCamera = (): void => {
    /* [GAME-01-VIS] Suavizado exponencial con delta real: el follow de cámara
     * se siente igual a 30, 60 o 120 fps y nunca se despega del personaje. */
    const now = performance.now();
    const dt = Math.min(Math.max((now - lastCameraTime) / 1000, 0), 0.1);
    lastCameraTime = now;
    if (followPlayer && cameraMode !== 'libre') {
      const desired = clampCameraTarget(
        new THREE.Vector3(currentPlayer.x, currentPlayerY + 0.8, currentPlayer.z),
        activeCameraBounds(),
      );
      cameraTarget.lerp(desired, 1 - Math.exp(-CAMERA_FOLLOW_RATE * dt));
    }
    /* [138A-7] Primera persona: la cámara está en los ojos del personaje y
     * el arrastre mueve la mirada (look.yaw/pitch). Sin zoom: niebla fija en
     * la distancia orbital por defecto. */
    if (cameraMode === 'primera') {
      positionFirstPersonCamera(look, camera, {
        x: currentPlayer.x,
        y: currentPlayerY,
        z: currentPlayer.z,
      });
      fog.near = CAMERA_DISTANCE + FOG_NEAR_MARGIN;
      fog.far = CAMERA_DISTANCE + FOG_FAR_OFFSET;
      return;
    }
    if (cameraMode === 'libre') {
      /* Vuelo libre: WASD/arrows mueven la cámara en el plano horizontal de
       * la mirada, Space/Shift suben/bajan, y el foco es la propia cámara
       * (no el jugador). El movimiento se acota a los bounds del mundo. */
      updateFreeFlyCamera(freeKeys, look, camera, cameraTarget, dt, activeCameraBounds());
      fog.near = orbit.distance + FOG_NEAR_MARGIN;
      fog.far = orbit.distance + FOG_FAR_OFFSET;
      return;
    }
    const sinPolar = Math.sin(orbit.polar);
    const offset = new THREE.Vector3(
      orbit.distance * sinPolar * Math.sin(orbit.azimuth),
      orbit.distance * Math.cos(orbit.polar),
      orbit.distance * sinPolar * Math.cos(orbit.azimuth),
    );
    camera.position.copy(cameraTarget).add(offset);
    /* [138A-7][138A-11] 3ª persona: la órbita sigue al personaje y no se
     * hunde en el terreno. La colisión muestrea el segmento jugador→cámara
     * (un solo punto se clavaba en colinas intermedias) y eleva la cámara al
     * máximo suelo+despeje del tramo. */
    if (cameraMode === 'tercera') {
      resolveThirdPersonCollision(camera, cameraTarget, constructorPicking.groundHeightAt);
    }
    camera.lookAt(cameraTarget);
    /* Niebla adaptativa: cerca y lejos escalan con el zoom para que la escena
     * nunca se lave a distancia máxima ni se pierda el horizonte a mínimo. */
    fog.near = orbit.distance + FOG_NEAR_MARGIN;
    fog.far = orbit.distance + FOG_FAR_OFFSET;
  };

  /* [138A-1][138A-9] Pick/raycast compartido del constructor (hover, drop y
   * pincel) sobre el grupo visible: comparador del constructor o isla curva. */
  const constructorPicking = createConstructorPicker({
    host,
    camera,
    island: curvedIsland,
    comparator: proceduralComparator,
    panel,
    isComparatorVisible: () => comparatorVisible,
  });

  /* [138A-5] Restaura las últimas opciones y modo al recargar (fail-closed).
   * Debe correr después de `constructorPicking.applyPick` (la generación lo
   * invoca al aplicar el modo) y antes de conectar el input de órbita. */
  const restored = loadConstructorState();
  if (restored) {
    cameraMode = restored.camera;
    if (restored.palette) constructorPalette = normalizeWorldPalette(restored.palette);
    if (restored.panel) constructorPanelState = { ...restored.panel };
    /* [138A-9] El stack de capas se restaura antes de generar para que la
     * primera vista ya muestre caminos/arena/agua/elevación guardados. */
    if (restored.layers) constructorLayers = normalizeTerrainLayerStack(restored.layers);
    /* [138A-10] El pasto se restaura antes de generar la primera vista. */
    if (restored.grass) constructorGrass = normalizeGrassFieldOptions(restored.grass);
    /* [138A-12] El cielo se restaura antes de la primera vista y se aplica
     * al shader/luces tras montar el panel (mismo patrón que pasto). */
    if (restored.sky) constructorSky = normalizeSkyOptions(restored.sky);
    /* [138A-15] El estilo visual se restaura antes de generar; si el mundo
     * guardado era sakura, el Bosque de referencia para salir del override
     * son los defaults (el snapshot en memoria se perdió al recargar). */
    if (restored.style) {
      const restoredStyle = normalizeVisualStyle(restored.style);
      styleEffects.apply(
        restoredStyle,
        restoredStyle.key === 'sakura'
          ? { palette: { ...WORLD_PALETTE_DEFAULTS }, sky: { ...SKY_DEFAULTS } }
          : null,
      );
    }
    /* [138A-14] El store se restaura ANTES de generar para que el primer
     * persist del pipeline ya conserve los ids removidos; la reaplicación
     * concreta sobre el mapa regenerado ocurre tras `showConstructorWorld`. */
    if (restored.removedInstanceIds) {
      removedInstancesStore.restore(restored.removedInstanceIds);
    }
    /* [138A-14] El reapply de los removidos ya ocurre dentro de
     * `showConstructorWorld` (sobre el mundo regenerado); no se reaplica de
     * nuevo aquí porque un segundo reapply descartaría como "muertos" los
     * ids recién quitados y el persist los perdería. */
    showConstructorWorld(restored.options);
    if (restored.mode !== 'bloques') applyTerrainMode(restored.mode);
    /* [138A-8] Restaura documento, paleta y ventana en los subpaneles del
     * Constructor y reaplica los colores de escena (cielo/niebla). */
    panel.setConstructorMap(constructorMap);
    panel.setConstructorPalette(constructorPalette);
    panel.setConstructorPanelState(constructorPanelState);
    panel.setConstructorLayers(constructorLayers);
    panel.setConstructorBrush(constructorBrush);
    panel.setConstructorGrass(constructorGrass);
    panel.setConstructorSky(constructorSky);
    panel.setConstructorStyle(styleEffects.getStyle());
    proceduralComparator.setPalette(constructorPalette);
    skyDome.update(constructorSky);
    backgroundColor.setHex(constructorPalette.sky);
    fog.color.copy(backgroundColor);
  }
  /* [138A-7] Sincroniza el segmento de cámara del panel y la mirada de
   * primera persona con el modo restaurado (o el default `libre`). */
  setCameraMode(cameraMode);

  const onOrbitStart = (event: PointerEvent): void => {
    /* [138A-9] Con el pincel activo el arrastre pinta; no orbita ni sigue. */
    if (constructorBrush.active) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    host.setPointerCapture?.(event.pointerId);
  };
  const onOrbitMove = (event: PointerEvent): void => {
    if (constructorBrush.active) return;
    if (dragging && lastPointer) {
      const dx = event.clientX - lastPointer.x;
      const dy = event.clientY - lastPointer.y;
      lastPointer = { x: event.clientX, y: event.clientY };
      /* [138A-7] En primera persona el arrastre gira la mirada; en libre y
       * 3ª persona orbita la cámara alrededor del personaje. */
      /* [138A-9] En vuelo libre el arrastre también gira la mirada (yaw/pitch)
       * en lugar de orbitar; el movimiento va con WASD/arrows. */
      if (cameraMode === 'primera' || cameraMode === 'libre') {
        rotateCameraLook(look, dx, dy);
        return;
      }
      orbit.azimuth -= dx * 0.008;
      orbit.polar = THREE.MathUtils.clamp(orbit.polar + dy * 0.008, CAMERA_MIN_POLAR, CAMERA_MAX_POLAR);
      return;
    }
    constructorPicking.updatePick(event.clientX, event.clientY);
  };
  const onOrbitEnd = (): void => {
    dragging = false;
    lastPointer = null;
  };
  const onPointerLeave = (): void => {
    constructorPicking.applyPick(null);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    /* [138A-9] Con el pincel activo la rueda no cambia el zoom (pintar); en
     * primera persona y vuelo libre tampoco hay zoom orbital. */
    if (constructorBrush.active) return;
    /* [138A-7] En primera persona no hay zoom orbital; la rueda no cambia
     * distancia (solo se consume para no hacer scroll de la página). */
    if (cameraMode === 'primera' || cameraMode === 'libre') return;
    orbit.distance = THREE.MathUtils.clamp(
      orbit.distance * (event.deltaY > 0 ? 1.08 : 0.92),
      CAMERA_MIN_DISTANCE,
      CAMERA_MAX_DISTANCE,
    );
  };
  /* [138A-7] Atajo C para alternar libre → primera → 3ª persona; se
   * desmonta en destroy junto con el resto de listeners. */
  const stopCameraShortcut = attachCameraModeShortcut(() => cameraMode, setCameraMode);
  host.addEventListener('pointerdown', onOrbitStart);
  host.addEventListener('pointermove', onOrbitMove);
  host.addEventListener('pointerup', onOrbitEnd);
  host.addEventListener('pointercancel', onOrbitEnd);
  host.addEventListener('pointerleave', onPointerLeave);
  host.addEventListener('wheel', onWheel, { passive: false });

  /* [138A-9] Vuelo libre por teclado: WASD/arrows + Space/Shift con teardown.
   * El foco en controles editables del panel no mueve la cámara. */
  const onKeyDown = (event: KeyboardEvent): void => {
    if (cameraMode !== 'libre' || isEditableTarget(event)) return;
    if (applyFreeFlyKeyDown(freeKeys, event)) event.preventDefault();
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    applyFreeFlyKeyUp(freeKeys, event);
  };
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  /* [138A-8] Drop de assets del panel Assets al mundo: el drag viaja con el
   * asset id y el drop resuelve la celda por raycast sobre el terreno visible
   * (comparador o isla curva) antes de colocar la instancia en el documento. */
  const onDragOver = (event: DragEvent): void => {
    if (event.dataTransfer?.types.includes(ASSET_DRAG_MIME)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  };
  const onDropAsset = (event: DragEvent): void => {
    const assetVersionId = event.dataTransfer?.getData(ASSET_DRAG_MIME);
    if (!assetVersionId) return;
    event.preventDefault();
    const pick = constructorPicking.raycastPickAt(event.clientX, event.clientY);
    if (!pick) return;
    /* El documento vive en el frame local (bounds ±w/2·cellSize); el pick
     * entrega coordenadas de escena, así que se restan los centros. */
    applyConstructorObjectEdits([{
      kind: 'add',
      assetVersionId,
      position: { x: pick.worldX - islandCenterX, z: pick.worldZ - islandCenterZ },
    }]);
  };
  host.addEventListener('dragover', onDragOver);
  host.addEventListener('drop', onDropAsset);

  /* [138A-9] Pincel del editor de mapa: cuando está activo consume el puntero
   * (los handlers de órbita ya ignoran su estado) y delega las celdas en
   * `applyBrushStroke` con commits intermedios y final. */
  const stopLayerPainter = attachLayerPainter(host, {
    isActive: () => constructorBrush.active,
    pickAt: constructorPicking.pickCellAt,
    cellSize: () => constructorOptions.cellSize,
    radius: () => constructorBrush.radius,
    onStroke: applyBrushStroke,
  });

  const createEntity = (id: string, characterId: string, localEntityId = 'local'): THREE.Group => {
    const remote = id !== localEntityId;
    /* [297A-77] Cada entidad lleva su personaje del catálogo: el tono se
     * aplica en la figura (material compartido) para que los remotos se vean
     * distintos y el local refleje su elección. */
    const figure = createCurvedFigure(figureMaterials, remote, characterId);
    figure.userData.entityId = id;
    figure.userData.characterId = characterId;
    applyFigureShadowFlags(figure);
    scene.add(figure);
    entities.set(id, figure);
    return figure;
  };

  const update = (snapshot: WorldSnapshot, localEntityId = 'local'): void => {
    if (destroyed) return;
    const activeIds = new Set<string>();
    for (const entity of snapshot.entities) {
      const existing = entities.get(entity.id);
      /* Si el personaje cambió (reconexión con otro perfil), recrear la
       * figura para aplicar el tono nuevo. */
      const object = existing && existing.userData.characterId === entity.characterId
        ? existing
        : recreateEntity(entity.id, entity.characterId, existing, localEntityId);
      const groundY = constructorPicking.groundHeightAt(entity.position.x, entity.position.z);
      object.position.set(entity.position.x, groundY + 0.2, entity.position.z);
      /* [CURVED-ISLAND] El personaje mira hacia su dirección de movimiento
       * (el runtime ya la expresa en espacio mundo, relativa a cámara). */
      if (Math.hypot(entity.velocity.x, entity.velocity.z) > 0.001) {
        const target = Math.atan2(entity.velocity.x, entity.velocity.z);
        const current = typeof object.userData.yaw === 'number' ? object.userData.yaw : target;
        let diff = target - current;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        object.userData.yaw = current + diff * 0.6;
        object.rotation.y = object.userData.yaw;
      }
      activeIds.add(entity.id);
      if (entity.id === localEntityId) {
        currentPlayer = entity.position;
        currentPlayerY = groundY;
      }
    }
    for (const [id, object] of entities) {
      if (activeIds.has(id)) continue;
      scene.remove(object);
      disposeObjectGeometries(object);
      entities.delete(id);
    }
    updateLocalFigureVisibility();
    /* [138A-9] En vuelo libre el streaming sigue a la cámara, no al jugador,
     * para que el terreno lejano aparezca mientras se recorre el mundo. */
    streamProps(cameraMode === 'libre'
      ? { x: camera.position.x, z: camera.position.z }
      : currentPlayer);
    bend.setOrigin(currentPlayer.x, currentPlayerY, currentPlayer.z);
    updateCamera();
  };

  const recreateEntity = (
    id: string,
    characterId: string,
    previous: THREE.Group | undefined,
    localEntityId: string,
  ): THREE.Group => {
    if (previous) {
      scene.remove(previous);
      disposeObjectGeometries(previous);
      entities.delete(id);
    }
    return createEntity(id, characterId, localEntityId);
  };

  const resize = (): void => {
    if (destroyed) return;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    /* El pipeline gestiona su propio DPR/reescalado interno. */
    if (styleEffects.active()) styleEffects.resize(width, height, window.devicePixelRatio);
    else renderer.setSize(width, height, false);
    updateCamera();
  };

  const render = (): void => {
    if (destroyed) return;
    const now = performance.now();
    const frameDt = Math.min((now - lastRenderTime) / 1000, 0.1);
    lastRenderTime = now;
    waterTimeSeconds += frameDt;
    skyDome.updateTime(waterTimeSeconds);
    skyDome.followCamera(camera.position);
    curvedIsland.update(waterTimeSeconds, currentPlayer.x, currentPlayerY, currentPlayer.z);
    proceduralComparator.update(waterTimeSeconds, currentPlayer.x, currentPlayerY, currentPlayer.z);
    bend.setOrigin(currentPlayer.x, currentPlayerY, currentPlayer.z);
    /* [138A-15] En sakura el shadow map sigue al jugador (centrado en cámara). */
    if (styleEffects.isSakura()) styleEffects.updateSunFollow(currentPlayer.x, currentPlayerY, currentPlayer.z);
    gpuFrameProbe.beginFrame();
    if (styleEffects.active()) {
      styleEffects.render();
    } else {
      renderer.render(scene, camera);
    }
    gpuFrameProbe.endFrame();
    const frameMs = gpuFrameProbe.readFrameMs();
    if (frameMs !== null) lastGpuFrameMs = frameMs;
    currentRendererMetrics = readRendererMetrics(renderer.info, readAvailableHeapMemory());
    if (comparatorVisible) {
      const stats = proceduralComparator.terrainStats();
      const frameText = lastGpuFrameMs !== null ? `${lastGpuFrameMs.toFixed(1)}ms` : '—';
      panel.setTerrainMetrics(
        `${stats.mode} · tris ${stats.triangles} · vértices ${stats.vertices} · props ${stats.propCount}`
        + ` · draw calls ${currentRendererMetrics.drawCalls} · frame ${frameText}`,
      );
    }
  };

  resize();

  return {
    canvas: renderer.domElement,
    update,
    resize,
    render,
    getCameraAzimuth: () => cameraMode === 'primera' ? look.yaw : orbit.azimuth,
    setCameraFollow: (follow: boolean): void => { followPlayer = follow; },
    streamingStats: () => currentStreamingStats,
    rendererMetrics: () => currentRendererMetrics,
    batchStats: () => ({
      drawCalls: visualCache.batchDrawCallCount(),
      sourceMeshes: visualCache.batchSourceMeshCount(),
    }),
    gpuIdentity: () => gpuIdentity,
    gpuFrameMs: () => lastGpuFrameMs,
    gpuMemoryEstimate: () => estimateSceneGpuMemory(scene),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      host.removeEventListener('pointerdown', onOrbitStart);
      host.removeEventListener('pointermove', onOrbitMove);
      host.removeEventListener('pointerup', onOrbitEnd);
      host.removeEventListener('pointercancel', onOrbitEnd);
      host.removeEventListener('pointerleave', onPointerLeave);
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('dragover', onDragOver);
      host.removeEventListener('drop', onDropAsset);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      stopCameraShortcut();
      stopLayerPainter();
      regenerateDebounced.dispose();
      paletteDebounced.dispose();
      grassDebounced.dispose();
      skyDebounced.dispose();
      panel.destroy();
      gpuFrameProbe.dispose();
      visualCache.destroy();
      proceduralComparator.dispose();
      curvedIsland.dispose();
      skyDome.dispose();
      disposeScene(scene, materials, Object.values(figureMaterials));
      /* [138A-15] Las rampas cacheadas son compartidas por módulo: solo se
       * disponen las creadas por esta escena (bosque/dataURL). */
      if (!isCachedRamp(toonRamp)) toonRamp.dispose();
      styleEffects.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
      entities.clear();
    },
  };
}
