/* 138A-15 — Efectos de escena Sakura Crossing sin WebGL (fakes de renderer
 * y skydome): aplicar sakura enciende pipeline/luces/sombras/paleta y
 * revertir al Bosque restaura el snapshot capturado al entrar. */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  SKY_DEFAULTS,
  WORLD_PALETTE_DEFAULTS,
  WORLD_PALETTE_SAKURA,
} from '../../../game-core';
import { createCurvedFigureMaterials } from '../game-shared/forest-models';
import {
  applyFigureShadowFlags,
  createSakuraSceneEffects,
  type SakuraSceneEffectsDeps,
} from './game-sakura-scene-effects';
import {
  DEFAULT_VISUAL_STYLE,
  SAKURA_SKY,
  SAKURA_STYLE,
} from './game-sakura-preset';
import { gradientMap } from './game-sakura-toon';

function createFakeRenderer() {
  const shadowMap = { type: null as THREE.ShadowMapType | null, enabled: null as boolean | null };
  return {
    shadowMap,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    render: vi.fn(),
    domElement: {
      parentElement: { clientWidth: 800, clientHeight: 600 },
      style: { width: '', height: '' },
    },
  };
}

function createFakeSkyDome() {
  return {
    sun: {
      color: new THREE.Color(),
      intensity: 0,
      castShadow: false,
      position: new THREE.Vector3(),
      target: { position: new THREE.Vector3() },
      shadow: {
        mapSize: { set: vi.fn() },
        camera: { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 },
        bias: 0,
        normalBias: 0,
      },
    },
    hemi: {
      color: new THREE.Color(),
      groundColor: new THREE.Color(),
      intensity: 0,
    },
    update: vi.fn(),
    updateTime: vi.fn(),
    followCamera: vi.fn(),
  };
}

function createDeps(overrides: Partial<SakuraSceneEffectsDeps> = {}) {
  const renderer = createFakeRenderer();
  const skyDome = createFakeSkyDome();
  const scene = new THREE.Scene();
  const backgroundColor = new THREE.Color(0xaecfc4);
  const fog = new THREE.Fog(0xaecfc4, 1, 100);
  const materials = {
    ink: new THREE.MeshToonMaterial(),
    paper: new THREE.MeshToonMaterial(),
    pale: new THREE.MeshToonMaterial(),
    middle: new THREE.MeshToonMaterial(),
    water: new THREE.MeshToonMaterial(),
    lines: new THREE.LineBasicMaterial(),
  };
  let palette = { ...WORLD_PALETTE_DEFAULTS };
  let sky = { ...SKY_DEFAULTS };
  return {
    deps: {
      scene,
      renderer,
      camera: new THREE.PerspectiveCamera(60, 1, 0.1, 500),
      backgroundColor,
      fog,
      skyDome,
      proceduralComparator: { setPalette: vi.fn(), setShadowCasting: vi.fn() },
      applyToonRamp: vi.fn(),
      materials,
      figureMaterials: createCurvedFigureMaterials(),
      readPalette: () => palette,
      writePalette: (next: typeof palette) => { palette = next; },
      readSky: () => sky,
      writeSky: (next: typeof sky) => { sky = next; },
      panel: { setConstructorPalette: vi.fn(), setConstructorSky: vi.fn() },
      ...overrides,
    } as SakuraSceneEffectsDeps,
    renderer,
    skyDome,
    scene,
    backgroundColor,
    fog,
    palette: () => palette,
    sky: () => sky,
  };
}

describe('efectos de escena Sakura Crossing (138A-15)', () => {
  it('arranca en Bosque: pipeline apagado, sin sombras y look neutral', () => {
    const { deps, renderer, scene } = createDeps();
    const effects = createSakuraSceneEffects(deps);
    expect(effects.getStyle()).toEqual({ ...DEFAULT_VISUAL_STYLE });
    expect(effects.isSakura()).toBe(false);
    expect(effects.active()).toBe(false);
    expect(renderer.shadowMap.type).toBe(THREE.PCFShadowMap);
    expect(renderer.shadowMap.enabled).toBe(false);
    const visibleLights = scene.children.filter(
      (child) => child instanceof THREE.DirectionalLight && child.visible,
    );
    expect(visibleLights).toHaveLength(0);
  });

  it('aplicar sakura enciende pipeline, luces, sombras y paleta/cielo pastel', () => {
    const { deps, renderer, skyDome, scene, backgroundColor, fog, palette, sky } = createDeps();
    const effects = createSakuraSceneEffects(deps);
    effects.apply({ ...SAKURA_STYLE, key: 'sakura', ink: false });

    expect(effects.isSakura()).toBe(true);
    expect(effects.active()).toBe(true);
    /* Al entrar en sakura el pipeline se dimensiona con el viewport actual
     * (si no, sus RT de 2×2 estiran un texel por toda la pantalla). */
    expect(renderer.setPixelRatio).toHaveBeenCalledWith(1);
    expect(renderer.setSize).toHaveBeenCalledWith(800, 600, true);
    expect(deps.applyToonRamp).toHaveBeenCalledWith(gradientMap(SAKURA_STYLE.rampBands));
    expect(deps.proceduralComparator.setPalette).toHaveBeenCalledWith(WORLD_PALETTE_SAKURA);
    expect(deps.proceduralComparator.setShadowCasting).toHaveBeenCalledWith(true);
    expect(palette()).toEqual(WORLD_PALETTE_SAKURA);
    expect(sky()).toEqual(SAKURA_SKY);
    expect(renderer.shadowMap.enabled).toBe(true);
    expect(skyDome.sun.castShadow).toBe(true);
    expect(skyDome.sun.shadow.mapSize.set).toHaveBeenCalledWith(2048, 2048);
    expect(skyDome.sun.shadow.bias).toBe(-0.0004);
    expect(skyDome.sun.shadow.normalBias).toBe(0.035);
    expect(backgroundColor.getHex()).toBe(WORLD_PALETTE_SAKURA.sky);
    expect(fog.color.getHex()).toBe(WORLD_PALETTE_SAKURA.sky);
    const visibleLights = scene.children.filter(
      (child) => child instanceof THREE.DirectionalLight && child.visible,
    );
    expect(visibleLights).toHaveLength(2);
    expect(deps.panel.setConstructorPalette).toHaveBeenCalledWith(WORLD_PALETTE_SAKURA);
    expect(deps.panel.setConstructorSky).toHaveBeenCalledWith(SAKURA_SKY);
  });

  it('revertir al Bosque restaura el snapshot capturado y apaga el look', () => {
    const { deps, renderer, scene, backgroundColor, palette, sky } = createDeps();
    const bosquePalette = palette();
    const bosqueSky = sky();
    const effects = createSakuraSceneEffects(deps);
    effects.apply({ ...SAKURA_STYLE, key: 'sakura', ink: false });
    /* El pipeline dimensiona el canvas con updateStyle (styles inline). */
    renderer.domElement.style.width = '800px';
    renderer.domElement.style.height = '600px';
    effects.apply({ ...DEFAULT_VISUAL_STYLE });

    expect(effects.isSakura()).toBe(false);
    expect(effects.active()).toBe(false);
    /* Al salir de sakura se limpian los inline styles: el CSS vuelve a
     * gobernar el tamaño del canvas y el Bosque sigue llenando el host. */
    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
    expect(deps.applyToonRamp).toHaveBeenCalledTimes(2);
    expect(palette()).toEqual(bosquePalette);
    expect(sky()).toEqual(bosqueSky);
    expect(renderer.shadowMap.enabled).toBe(false);
    expect(backgroundColor.getHex()).toBe(bosquePalette.sky);
    const visibleLights = scene.children.filter(
      (child) => child instanceof THREE.DirectionalLight && child.visible,
    );
    expect(visibleLights).toHaveLength(0);
  });

  it('restore de un mundo sakura usa los defaults como referencia del Bosque', () => {
    const { deps, palette, sky } = createDeps();
    const effects = createSakuraSceneEffects(deps);
    effects.apply(
      { ...SAKURA_STYLE, key: 'sakura', ink: false },
      { palette: { ...WORLD_PALETTE_DEFAULTS }, sky: { ...SKY_DEFAULTS } },
    );
    effects.apply({ ...DEFAULT_VISUAL_STYLE });
    expect(palette()).toEqual(WORLD_PALETTE_DEFAULTS);
    expect(sky()).toEqual(SKY_DEFAULTS);
  });

  it('reapplyLightingOverrides reaplica sol/hemisférica del clon tras skyDome.update', () => {
    const { deps, skyDome } = createDeps();
    const effects = createSakuraSceneEffects(deps);
    effects.apply({ ...SAKURA_STYLE, key: 'sakura', ink: false });
    expect(skyDome.sun.color.getHex()).toBe(SAKURA_STYLE.sunColor);
    expect(skyDome.sun.intensity).toBe(SAKURA_STYLE.sunIntensity);
    expect(skyDome.hemi.color.getHex()).toBe(SAKURA_STYLE.hemiColor);
    expect(skyDome.hemi.groundColor.getHex()).toBe(SAKURA_STYLE.hemiGround);
    expect(skyDome.hemi.intensity).toBe(SAKURA_STYLE.hemiIntensity);
    skyDome.sun.intensity = 0;
    effects.reapplyLightingOverrides();
    expect(skyDome.sun.intensity).toBe(SAKURA_STYLE.sunIntensity);
  });

  it('updateSunFollow centra el sol en el jugador con la dirección del preset', () => {
    const { deps, skyDome } = createDeps();
    const effects = createSakuraSceneEffects(deps);
    effects.apply({ ...SAKURA_STYLE, key: 'sakura', ink: false });
    effects.updateSunFollow(10, 3, -20);
    expect(skyDome.sun.target.position.x).toBe(10);
    expect(skyDome.sun.target.position.y).toBe(3);
    expect(skyDome.sun.target.position.z).toBe(-20);
    expect(skyDome.sun.position.distanceTo(skyDome.sun.target.position)).toBeCloseTo(160, 4);
  });

  it('applyFigureShadowFlags activa castShadow en mallas y respeta el resto', () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh();
    const line = new THREE.Line();
    group.add(mesh);
    group.add(line);
    applyFigureShadowFlags(group);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(false);
    expect(line.castShadow).toBe(false);
  });
});
