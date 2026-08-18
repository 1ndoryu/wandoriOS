/* GAME-01 — Isla del Bosque por bloques (Minecraft), override visual temporal.
 * Adaptador Three delgado sobre los módulos puros (heightmap + mesher): monta
 * la geometría de bloques, delega el agua (plano toon estático) y la lluvia a
 * sus adaptadores extraídos en 138A-3, y expone controles (lluvia, props,
 * regenerar) para el panel temporal. No alimenta colisión ni simulación:
 * solo presentación. */

import * as THREE from 'three';
import { type WorldBend } from './game-world-bend';
import { mountCurvedRain } from './game-curved-rain';
import { mountCurvedWater, WATER_MESH_SCALE } from './game-curved-water';
import { toGeometry } from './game-procedural-geometry';
import {
  cellAt,
  cellCenterX,
  cellCenterZ,
  generateBlockHeightmap,
  levelAt,
  type BlockHeightmap,
} from './game-block-heightmap';
import {
  buildBlockPropsMeshData,
  buildBlockTerrainMeshData,
  placeBlockProps,
} from './game-block-mesher';

/* 1 bloque = 1 unidad de mundo. La rejilla es 2:1 para seguir el rect jugable
 * (32×16) y dejar océano visible como límite alrededor de la isla. */
const WIDTH = 48;
const DEPTH = 32;
const MAX_LEVEL = 4;
const WATER_Y = -0.12;
const PROP_COUNT = 60;
const RAIN_MAX = 1100;
const RAIN_AREA = 26;

export interface BlockPick {
  readonly i: number;
  readonly j: number;
  readonly level: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly blockCenterY: number;
}

export interface CurvedIsland {
  readonly update: (timeSeconds: number, anchorX: number, anchorY: number, anchorZ: number) => void;
  /** Altura de piso (bloques) en un punto del mundo; agua → WATER_Y. */
  readonly groundHeightAt: (x: number, z: number) => number;
  /** Terreno raycastable (los props toon no se seleccionan por bloques). */
  readonly raycastGroup: THREE.Object3D;
  readonly pickBlock: (x: number, y: number, z: number) => BlockPick | null;
  /** [138A-1] Oculta/muestra toda la isla (terreno, agua, lluvia, highlight). */
  readonly setVisible: (visible: boolean) => void;
  readonly setHighlight: (pick: BlockPick | null) => void;
  readonly setRain: (amount: number) => void;
  readonly setPropsVisible: (visible: boolean) => void;
  readonly regenerate: (seed: number) => void;
  readonly dispose: () => void;
}

export function mountCurvedIsland(
  scene: THREE.Scene,
  bend: WorldBend,
  toonRamp: THREE.Texture,
  seed = 1337,
  centerX = 0,
  centerZ = 0,
): CurvedIsland {
  let heightmap: BlockHeightmap = generateBlockHeightmap(seed, WIDTH, DEPTH, MAX_LEVEL);
  const island = new THREE.Group();

  const blockMat = bend.apply(new THREE.MeshToonMaterial({ gradientMap: toonRamp, vertexColors: true }));
  const terrainMesh = new THREE.Mesh(toGeometry(buildBlockTerrainMeshData(heightmap, seed)), blockMat);
  const propsMesh = new THREE.Mesh(toGeometry(buildBlockPropsMeshData(placeBlockProps(heightmap, seed, PROP_COUNT))), blockMat);
  island.add(terrainMesh, propsMesh);
  island.position.set(centerX, 0, centerZ);
  scene.add(island);

  /* Agua: plano toon estático igual al del comparador (feedback 13-ago: el
   * shader de costa con olas se veía como capa de triángulos sobre el agua). */
  const water = mountCurvedWater(scene, bend, {
    width: WIDTH,
    depth: DEPTH,
    meshScale: WATER_MESH_SCALE,
    waterY: WATER_Y,
    centerX,
    centerZ,
    toonRamp,
  });

  /* Lluvia: streaks deterministas del toolkit (138A-3), misma cantidad/área. */
  const rain = mountCurvedRain(scene, bend, {
    count: RAIN_MAX,
    area: RAIN_AREA,
    span: 21,
    top: 15,
    seed,
  });
  rain.setAmount(0.6);

  /* Highlight del bloque apuntado: relleno translúcido + contorno 1×1×1. */
  const highlightBox = new THREE.BoxGeometry(1.03, 1.03, 1.03);
  const highlight = new THREE.Group();
  highlight.add(
    new THREE.Mesh(highlightBox, new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    })),
    new THREE.LineSegments(
      new THREE.EdgesGeometry(highlightBox),
      new THREE.LineBasicMaterial({ color: 0x14332a }),
    ),
  );
  highlight.visible = false;
  scene.add(highlight);
  let islandVisible = true;
  let highlightShown = false;

  const groundHeightAt = (x: number, z: number): number => {
    const lvl = levelAt(heightmap, Math.floor(x - centerX + WIDTH / 2), Math.floor(z - centerZ + DEPTH / 2));
    return lvl < 0 ? WATER_Y : lvl;
  };

  const pickBlock = (x: number, y: number, z: number): BlockPick | null => {
    const cell = cellAt(heightmap, x - centerX, z - centerZ);
    if (!cell || cell.level < 0) return null;
    /* Bloque real bajo el cursor: la cara superior cae en [level-1, level];
     * una cara lateral en [floor(y), floor(y)+1]. Nunca un bloque vacío. */
    let layer = Math.floor(y + 0.001);
    if (y >= cell.level - 0.001) layer = cell.level - 1;
    layer = Math.max(-1, Math.min(cell.level - 1, layer));
    return {
      i: cell.i,
      j: cell.j,
      level: cell.level,
      worldX: cellCenterX(heightmap, cell.i) + centerX,
      worldZ: cellCenterZ(heightmap, cell.j) + centerZ,
      blockCenterY: layer + 0.5,
    };
  };

  const setHighlight = (pick: BlockPick | null): void => {
    highlightShown = pick !== null;
    if (!pick) {
      highlight.visible = islandVisible && highlightShown;
      return;
    }
    highlight.visible = islandVisible && highlightShown;
    highlight.position.set(pick.worldX, pick.blockCenterY, pick.worldZ);
  };

  /* [138A-1] El comparador alterna entre esta isla y su vista suave: ocultar
   * TODO el conjunto (incluida agua/lluvia) en vez de solo el grupo de tierra. */
  const setVisible = (visible: boolean): void => {
    islandVisible = visible;
    island.visible = visible;
    water.setVisible(visible);
    rain.setVisible(visible);
    highlight.visible = visible && highlightShown;
  };

  const setRain = (amount: number): void => {
    rain.setAmount(Math.max(0, Math.min(1, amount)));
  };

  const setPropsVisible = (visible: boolean): void => {
    propsMesh.visible = visible;
  };

  const regenerate = (newSeed: number): void => {
    heightmap = generateBlockHeightmap(newSeed, WIDTH, DEPTH, MAX_LEVEL);
    terrainMesh.geometry.dispose();
    terrainMesh.geometry = toGeometry(buildBlockTerrainMeshData(heightmap, newSeed));
    propsMesh.geometry.dispose();
    propsMesh.geometry = toGeometry(buildBlockPropsMeshData(placeBlockProps(heightmap, newSeed, PROP_COUNT)));
    setHighlight(null);
  };

  return {
    update: (timeSeconds, anchorX, anchorY, anchorZ) => {
      water.update(timeSeconds);
      rain.setTime(timeSeconds);
      rain.setAnchor(anchorX, anchorY, anchorZ);
    },
    groundHeightAt,
    raycastGroup: terrainMesh,
    pickBlock,
    setVisible,
    setHighlight,
    setRain,
    setPropsVisible,
    regenerate,
    dispose: () => {
      scene.remove(island, highlight);
      water.dispose();
      rain.dispose();
      terrainMesh.geometry.dispose();
      propsMesh.geometry.dispose();
      blockMat.dispose();
      highlightBox.dispose();
      highlight.traverse((child) => {
        if (child instanceof THREE.LineSegments) child.geometry.dispose();
      });
      island.clear();
    },
  };
}
