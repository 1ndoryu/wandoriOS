/* 138A-15 — Efectos de escena del estilo Sakura Crossing: uniform de tinte
 * violeta compartido, luces fill/bounce del clon (main.js), sombras PCF 2048
 * que siguen al jugador, rampa 4 bandas y pipeline ink→grade→fxaa.
 *
 * Este módulo encapsula TODO el look sakura para que
 * `game-playable-scene.ts` no crezca sin límite: la escena solo delega
 * aplicar/restaurar, render y teardown. El Bosque (default) no se toca:
 * pipeline apagado, luces ocultas y sin shadow map (render directo igual al
 * histórico). Al entrar en sakura se fotografían paleta y cielo del Bosque
 * para poder revertir; la persistencia guarda solo el estilo elegido. */

import * as THREE from 'three';
import {
  sunDirectionFromOptions,
  WORLD_PALETTE_SAKURA,
  type SkyOptions,
  type WorldPalette,
} from '../../../game-core';
import {
  type CurvedFigureMaterials,
  type ForestMaterials,
} from '../game-shared/forest-models';
import { type SkyDomeHandle } from './game-sky';
import {
  DEFAULT_VISUAL_STYLE,
  normalizeVisualStyle,
  SAKURA_SKY,
  SAKURA_STYLE,
  type VisualStyleSettings,
} from './game-sakura-preset';
import {
  createShadowTintUniform,
  gradientMap,
  tintToonMaterials,
} from './game-sakura-toon';
import { createToonRamp } from './game-scene-utils';
import {
  createSakuraPipeline,
  type SakuraPipelineHandle,
} from './game-sakura-pipeline';

/** Referencia del Bosque capturada al entrar en sakura (o defaults al
 * restaurar un mundo guardado con estilo sakura). */
export interface BosqueReference {
  readonly palette: WorldPalette;
  readonly sky: SkyOptions;
}

export interface SakuraSceneEffectsDeps {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly backgroundColor: THREE.Color;
  readonly fog: THREE.Fog;
  readonly skyDome: SkyDomeHandle;
  /** Subconjunto del handle del comparador que el look necesita. */
  readonly proceduralComparator: {
    readonly setPalette: (palette: WorldPalette) => void;
    readonly setShadowCasting: (enabled: boolean) => void;
  };
  /** Sustituye la rampa toon en todos los materiales (escena). */
  readonly applyToonRamp: (next: THREE.Texture) => void;
  readonly materials: ForestMaterials;
  readonly figureMaterials: CurvedFigureMaterials;
  readonly readPalette: () => WorldPalette;
  readonly writePalette: (next: WorldPalette) => void;
  readonly readSky: () => SkyOptions;
  readonly writeSky: (next: SkyOptions) => void;
  /** Subpanel del constructor (solo restaura paleta/cielo sin emitir). */
  readonly panel: {
    readonly setConstructorPalette: (palette: WorldPalette) => void;
    readonly setConstructorSky: (sky: SkyOptions) => void;
  };
}

export interface SakuraSceneEffectsHandle {
  /** Estilo actual normalizado (fail-closed a bosque). */
  readonly getStyle: () => VisualStyleSettings;
  readonly isSakura: () => boolean;
  /** Aplica (o revierte) el look completo sobre la escena actual. */
  readonly apply: (
    style: VisualStyleSettings,
    bosqueRef?: BosqueReference | null,
  ) => void;
  /** Reaplica sol/hemisférica del clon tras un `skyDome.update()`. */
  readonly reapplyLightingOverrides: () => void;
  /** El pipeline está activo (grade encendido; usa su propio DPR/size). */
  readonly active: () => boolean;
  /** En sakura el shadow map sigue al jugador. */
  readonly updateSunFollow: (playerX: number, playerY: number, playerZ: number) => void;
  readonly resize: (width: number, height: number, devicePixelRatio: number) => void;
  readonly render: () => void;
  readonly dispose: () => void;
}

/** [138A-15] Las figuras proyectan sombra en sakura (receive off para no
 * ensuciar el cel look); los flags se respetan aunque el shadow map esté
 * apagado en Bosque. */
export function applyFigureShadowFlags(figure: THREE.Object3D): void {
  figure.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = true;
      child.receiveShadow = false;
    }
  });
}

export function createSakuraSceneEffects(
  deps: SakuraSceneEffectsDeps,
): SakuraSceneEffectsHandle {
  const {
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
    readPalette,
    writePalette,
    readSky,
    writeSky,
    panel,
  } = deps;

  let currentStyle: VisualStyleSettings = { ...DEFAULT_VISUAL_STYLE };
  let bosquePaletteSnapshot: WorldPalette | null = null;
  let bosqueSkySnapshot: SkyOptions | null = null;

  /* Uniform compartido de tinte (neutral = sin tinte; violeta = sakura):
   * un solo parche por material, el color se muta en runtime sin recompilar. */
  const shadowTintUniform = createShadowTintUniform(0xffffff);
  /* Pipeline ink→grade→fxaa: desactivado en Bosque (render directo igual al
   * actual); el grade+fxaa solo se encienden con el estilo sakura. */
  const pipeline: SakuraPipelineHandle = createSakuraPipeline(renderer, scene, camera);
  pipeline.setEnabled({ ink: false, fxaa: false });
  /* Sombras PCF del look sakura: el flag se enciende solo con el estilo
   * (Bosque conserva el render actual sin shadow map). */
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.enabled = false;

  /* Luces de relleno del look sakura (clon main.js): fill frío desde el
   * cuadrante opuesto al sol y bounce lavanda débil desde abajo. Invisibles
   * en Bosque: el render del Bosque no cambia. */
  const fill = new THREE.DirectionalLight(SAKURA_STYLE.fillColor, SAKURA_STYLE.fillIntensity);
  fill.position.set(48, 26, -44);
  fill.visible = false;
  scene.add(fill);
  const bounce = new THREE.DirectionalLight(SAKURA_STYLE.bounceColor, SAKURA_STYLE.bounceIntensity);
  bounce.position.set(10, -18, 40);
  bounce.visible = false;
  scene.add(bounce);

  /* Sol/hemisférica del clon sobre el skydome (update los resetea):
   * reaplicar tras cada update de cielo mientras sakura actúa. */
  const applySakuraLightingOverrides = (): void => {
    skyDome.sun.color.setHex(SAKURA_STYLE.sunColor);
    skyDome.sun.intensity = SAKURA_STYLE.sunIntensity;
    skyDome.hemi.color.setHex(SAKURA_STYLE.hemiColor);
    skyDome.hemi.groundColor.setHex(SAKURA_STYLE.hemiGround);
    skyDome.hemi.intensity = SAKURA_STYLE.hemiIntensity;
  };

  const apply = (
    style: VisualStyleSettings,
    bosqueRef: BosqueReference | null = null,
  ): void => {
    const next = normalizeVisualStyle(style);
    const sakura = next.key === 'sakura';
    const enteringSakura = sakura && currentStyle.key !== 'sakura';
    const leavingSakura = !sakura && currentStyle.key === 'sakura';
    /* Al ENTRAR a sakura se fotografían paleta/cielo actuales del Bosque
     * para poder revertir; en restore `bosqueRef` fija la referencia
     * explícita (defaults al recargar un mundo sakura). */
    if (enteringSakura || bosqueRef) {
      bosquePaletteSnapshot = bosqueRef ? { ...bosqueRef.palette } : { ...readPalette() };
      bosqueSkySnapshot = bosqueRef ? { ...bosqueRef.sky } : { ...readSky() };
    }
    currentStyle = next;

    if (sakura) {
      /* Rampa 4 bandas del clon (cacheadas: compartidas, nunca se disponen)
       * y tinte violeta en las bandas oscuras de todos los materiales toon. */
      applyToonRamp(gradientMap(SAKURA_STYLE.rampBands));
      shadowTintUniform.value.setHex(SAKURA_STYLE.tint);
      tintToonMaterials(scene, shadowTintUniform, [
        ...Object.values(materials),
        ...Object.values(figureMaterials),
      ]);
      writePalette({ ...WORLD_PALETTE_SAKURA });
      writeSky({ ...SAKURA_SKY });
    } else {
      applyToonRamp(createToonRamp());
      shadowTintUniform.value.setHex(0xffffff);
      if (bosquePaletteSnapshot) writePalette(bosquePaletteSnapshot);
      if (bosqueSkySnapshot) writeSky(bosqueSkySnapshot);
      bosquePaletteSnapshot = null;
      bosqueSkySnapshot = null;
    }

    proceduralComparator.setPalette(readPalette());
    skyDome.update(readSky());
    if (sakura) applySakuraLightingOverrides();

    fill.visible = sakura;
    bounce.visible = sakura;
    renderer.shadowMap.enabled = sakura;
    skyDome.sun.castShadow = sakura;
    if (sakura) {
      /* Shadow map centrado y con los parámetros del clon (PCF 2048). */
      skyDome.sun.shadow.mapSize.set(2048, 2048);
      skyDome.sun.shadow.camera.left = -34;
      skyDome.sun.shadow.camera.right = 34;
      skyDome.sun.shadow.camera.top = 34;
      skyDome.sun.shadow.camera.bottom = -34;
      skyDome.sun.shadow.camera.near = 1;
      skyDome.sun.shadow.camera.far = 400;
      skyDome.sun.shadow.bias = -0.0004;
      skyDome.sun.shadow.normalBias = 0.035;
    }
    proceduralComparator.setShadowCasting(sakura);
    /* El pipeline renderiza la escena con grade+fxaa en sakura; en Bosque
     * queda inactivo y `render()` hace el render directo histórico. */
    pipeline.setEnabled({ ink: next.ink, fxaa: sakura });
    if (sakura) {
      /* Al entrar en sakura los RT del pipeline arrancan en 2×2; sin un
       * setSize aquí la escena se renderiza a un texel y el quad fullscreen
       * lo estira por toda la pantalla ("solo colores, sin mundo"). Se
       * dimensiona con el viewport actual igual que `resize()` en runtime. */
      pipeline.setSize(
        Math.max(renderer.domElement.parentElement?.clientWidth ?? 1, 1),
        Math.max(renderer.domElement.parentElement?.clientHeight ?? 1, 1),
        window.devicePixelRatio,
      );
    }
    if (leavingSakura) {
      /* El pipeline fija pixelRatio 1 y size con updateStyle; al salir se
       * restaura el renderer del Bosque tal como estaba. */
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(
        Math.max(renderer.domElement.parentElement?.clientWidth ?? 1, 1),
        Math.max(renderer.domElement.parentElement?.clientHeight ?? 1, 1),
        false,
      );
      /* El pipeline dimensionó el canvas con updateStyle (styles inline);
       * `setSize(..., false)` no los limpia y anularían la regla CSS que
       * hace que el canvas llene el host. Se quitan para que el Bosque
       * vuelva a ser responsivo sin recargar. */
      renderer.domElement.style.width = '';
      renderer.domElement.style.height = '';
    }

    /* Paleta y cielo sakura también actualizan fondo/niebla (mismo patrón
     * que paletteDebounced) y los subpaneles del constructor. */
    backgroundColor.setHex(readPalette().sky);
    fog.color.copy(backgroundColor);
    panel.setConstructorPalette(readPalette());
    panel.setConstructorSky(readSky());
  };

  return {
    getStyle: () => currentStyle,
    isSakura: () => currentStyle.key === 'sakura',
    apply,
    reapplyLightingOverrides: applySakuraLightingOverrides,
    active: () => pipeline.active(),
    updateSunFollow: (playerX, playerY, playerZ) => {
      const sunDir = sunDirectionFromOptions(SAKURA_SKY.sunEl, SAKURA_SKY.sunAz);
      skyDome.sun.position.set(
        playerX + sunDir[0] * 160,
        playerY + sunDir[1] * 160,
        playerZ + sunDir[2] * 160,
      );
      skyDome.sun.target.position.set(playerX, playerY, playerZ);
    },
    resize: (width, height, devicePixelRatio) => {
      pipeline.setSize(width, height, devicePixelRatio);
    },
    render: () => {
      pipeline.render();
    },
    dispose: () => {
      pipeline.dispose();
    },
  };
}
