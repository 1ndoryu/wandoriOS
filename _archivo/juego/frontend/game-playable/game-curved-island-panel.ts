/* GAME-01 — Panel temporal de configuración del terreno (como el #panel de la
 * referencia). Vive dentro de la ventana del Bosque, usa los tokens B&W del OS
 * y se destruye junto al runtime. Permite ajustar la curva del mundo, la
 * lluvia, los props, el follow de cámara y regenerar la isla. Cuando existe el
 * Constructor de mundo, el panel exterior es el rail de iconos y los grupos de
 * la isla son secciones suyas; sin constructor conserva el panel clásico. */

import { Boxes, Brush, Camera, Image, Layers, Leaf, Palette, Sparkles, Sun, Waves } from 'lucide';
import { createEl } from '../../../../utils/dom';
import type {
  MapVersion,
  RenderStyle,
  TerrainOptions,
  TerrainLayer,
  WorldPalette,
  GrassFieldOptions,
  SkyOptions,
} from '../../../game-core';
import { DEFAULT_CAMERA_MODE, type CameraMode } from './game-camera-modes';
import { type ConstructorBrushState } from './game-layer-brush';
import {
  mountWorldConstructor,
  type WorldConstructorSection,
  type WorldConstructorSubpanel,
} from './game-world-constructor';
import { buildAssetsPanel } from './game-constructor-assets';
import { disposeAssetThumbnails } from './game-asset-thumbnails';
import { buildColorPanel } from './game-constructor-color';
import type { ConstructorPanelState } from './game-constructor-persistence';
import { buildTexturePanel } from './game-constructor-texture';
import { buildLayerEditorPanel } from './game-layer-editor';
import { buildGrassPanel } from './game-constructor-grass';
import { buildSkyPanel } from './game-constructor-sky';
import { buildStylePanel } from './game-constructor-style';
import type { VisualStyleSettings } from './game-sakura-preset';
import {
  buildCamaraGroup,
  buildEstilosGroup,
  buildIslaGroup,
  type CurvedIslandPanelControls,
} from './game-curved-island-controls';

export interface CurvedIslandPanel {
  readonly setPick: (pick: { i: number; j: number; level: number | null } | null) => void;
  /** [138A-1] Línea de métricas del comparador (vacío la oculta). */
  readonly setTerrainMetrics: (text: string) => void;
  /** [138A-4] Línea de métricas del constructor (vacío la oculta). */
  readonly setConstructorStats: (text: string) => void;
  /** [138A-4] Sincroniza los controles del constructor con unas opciones. */
  readonly setConstructorOptions: (options: TerrainOptions) => void;
  /** [138A-4] Marca el segmento de estilo activo sin disparar el control. */
  readonly setTerrainMode: (mode: RenderStyle) => void;
  /** [138A-7] Marca el segmento de cámara activo sin disparar el control. */
  readonly setCameraMode: (mode: CameraMode) => void;
  /** [138A-8] Restaura la paleta del mundo en los pickers sin emitir. */
  readonly setConstructorPalette: (palette: WorldPalette) => void;
  /** [138A-8] Restaura el documento (assets) sin emitir. */
  readonly setConstructorMap: (map: MapVersion | null) => void;
  /** [138A-8] Restaura colapso/lado/ancho de la ventana sin emitir. */
  readonly setConstructorPanelState: (state: ConstructorPanelState) => void;
  /** [138A-9] Restaura el stack de capas en el visor sin emitir. */
  readonly setConstructorLayers: (layers: readonly TerrainLayer[]) => void;
  /** [138A-9] Restaura el estado del pincel (auto-creación de capa). */
  readonly setConstructorBrush: (brush: ConstructorBrushState) => void;
  /** [138A-10] Restaura las opciones del pasto sin emitir. */
  readonly setConstructorGrass: (grass: GrassFieldOptions) => void;
  /** [138A-12] Restaura las opciones del cielo sin emitir. */
  readonly setConstructorSky: (sky: SkyOptions) => void;
  /** [138A-15] Restaura el estilo visual sin emitir. */
  readonly setConstructorStyle: (style: VisualStyleSettings) => void;
  readonly destroy: () => void;
}

export function mountCurvedIslandPanel(
  host: HTMLElement,
  controls: CurvedIslandPanelControls,
): CurvedIslandPanel {
  const stats = createEl('p', { className: 'juegoPanelTerreno__stats', textContent: '' });
  let metricsEl: HTMLParagraphElement | null = null;
  let currentMode: RenderStyle = 'bloques';
  let currentCameraMode: CameraMode = DEFAULT_CAMERA_MODE;
  let estilosSetActive: ((mode: RenderStyle) => void) | null = null;
  let camaraSetActive: ((mode: CameraMode) => void) | null = null;
  let constructorSection: WorldConstructorSection | null = null;
  let legacyPanel: HTMLElement | null = null;

  const mountEstilos = (container: HTMLElement): void => {
    const grupo = buildEstilosGroup(container, controls, currentMode);
    metricsEl = grupo.metricsEl;
    estilosSetActive = grupo.setActive;
  };

  const mountCamara = (container: HTMLElement): void => {
    const grupo = buildCamaraGroup(container, controls, currentCameraMode);
    camaraSetActive = grupo.setActive;
  };

  if (controls.worldConstructor) {
    /* [138A-5] El rail de iconos es el panel exterior; "Isla" y "Estilos"
     * son secciones suyas, no al revés. */
    const extraPanels: WorldConstructorSubpanel[] = [
      { key: 'isla', label: 'Isla', icon: Waves, build: (c) => buildIslaGroup(c, controls) },
    ];
    if (controls.setTerrainMode) {
      extraPanels.push({ key: 'estilos', label: 'Estilos', icon: Layers, build: mountEstilos });
    }
    if (controls.setCameraMode) {
      extraPanels.push({ key: 'camara', label: 'Cámara', icon: Camera, build: mountCamara });
    }
    /* [138A-8] Paneles de Paleta, Textura y Assets: solo se registran cuando
     * la escena expone su callback (evita rail muerto en modo legacy/test). */
    if (controls.worldConstructor.onPaletteChange) {
      extraPanels.push({
        key: 'color',
        label: 'Color',
        icon: Palette,
        build: (container, ctx) => buildColorPanel(container, ctx),
      });
    }
    if (controls.worldConstructor.onToonRampChange) {
      extraPanels.push({
        key: 'textura',
        label: 'Textura',
        icon: Image,
        build: (container, ctx) => buildTexturePanel(container, ctx),
      });
    }
    if (controls.worldConstructor.onEditObjects) {
      extraPanels.push({
        key: 'assets',
        label: 'Assets',
        icon: Boxes,
        build: (container, ctx) => buildAssetsPanel(container, ctx),
      });
    }
    if (controls.worldConstructor.onLayersChange) {
      extraPanels.push({
        key: 'capas',
        label: 'Capas',
        icon: Brush,
        build: (container, ctx) => buildLayerEditorPanel(container, ctx),
      });
    }
    if (controls.worldConstructor.onGrassChange) {
      extraPanels.push({
        key: 'pasto',
        label: 'Pasto',
        icon: Leaf,
        build: (container, ctx) => buildGrassPanel(container, ctx),
      });
    }
    if (controls.worldConstructor.onSkyChange) {
      extraPanels.push({
        key: 'cielo',
        label: 'Cielo',
        icon: Sun,
        build: (container, ctx) => buildSkyPanel(container, ctx),
      });
    }
    /* [138A-15] Panel de Estilo (Bosque/Sakura): solo se registra cuando la
     * escena expone su callback (evita rail muerto en modo legacy/test). */
    if (controls.worldConstructor.onStyleChange) {
      extraPanels.push({
        key: 'estilo',
        label: 'Estilo',
        icon: Sparkles,
        build: (container, ctx) => buildStylePanel(container, ctx),
      });
    }
    constructorSection = mountWorldConstructor(host, controls.worldConstructor, {
      title: 'Constructor',
      extraPanels,
      initialPalette: controls.initialPalette,
      initialMap: controls.initialMap,
      initialStyle: controls.initialStyle,
      constructorPanelState: controls.constructorPanelState,
      onConstructorPanelStateChange: controls.onConstructorPanelStateChange,
    });
  } else {
    /* Legacy sin constructor: se conserva el panel clásico del terreno. */
    const panel = createEl('section', {
      className: 'juegoPanelTerreno',
      ariaLabel: 'Configuración temporal del terreno',
    });
    const header = createEl('header', { className: 'juegoPanelTerreno__cabecera' });
    header.appendChild(createEl('span', { className: 'juegoPanelTerreno__titulo', textContent: 'Terreno' }));
    const body = createEl('div', { className: 'juegoPanelTerreno__cuerpo' });
    panel.append(header, body);
    header.addEventListener('click', () => {
      panel.classList.toggle('juegoPanelTerreno--cerrado');
    });
    for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'] as const) {
      panel.addEventListener(type, (event) => event.stopPropagation());
    }
    buildIslaGroup(body, controls);
    if (controls.setTerrainMode) mountEstilos(body);
    host.appendChild(panel);
    legacyPanel = panel;
  }
  host.appendChild(stats);

  return {
    setPick: (pick) => {
      stats.textContent = pick
        ? pick.level === null
          ? `terreno suave · ${pick.i},${pick.j}`
          : `bloque ${pick.i},${pick.j} · nivel ${pick.level}`
        : '';
    },
    setTerrainMetrics: (text) => {
      if (metricsEl?.isConnected) metricsEl.textContent = text;
    },
    setConstructorStats: (text) => {
      constructorSection?.setStats(text);
    },
    setConstructorOptions: (options) => {
      constructorSection?.applyOptions(options);
    },
    setTerrainMode: (mode) => {
      currentMode = mode;
      estilosSetActive?.(mode);
    },
    setCameraMode: (mode) => {
      currentCameraMode = mode;
      camaraSetActive?.(mode);
    },
    setConstructorPalette: (palette) => {
      constructorSection?.applyPalette(palette);
    },
    setConstructorMap: (map) => {
      constructorSection?.applyMap(map);
    },
    setConstructorPanelState: (state) => {
      constructorSection?.applyPanelState(state);
    },
    setConstructorLayers: (layers) => {
      constructorSection?.applyLayers(layers);
    },
    setConstructorBrush: (brush) => {
      constructorSection?.applyBrush(brush);
    },
    setConstructorGrass: (grass) => {
      constructorSection?.applyGrass(grass);
    },
    setConstructorSky: (sky) => {
      constructorSection?.applySky(sky);
    },
    setConstructorStyle: (style) => {
      constructorSection?.applyStyle(style);
    },
    destroy: () => {
      legacyPanel?.remove();
      stats.remove();
      constructorSection?.destroy();
      /* [138A-14] El explorador de assets vive en este panel: libera el
       * renderer WebGL offscreen, la cola de miniaturas pendientes y la
       * caché al destruirse (los dueños lanzan el dispose, la escena no). */
      disposeAssetThumbnails();
      metricsEl = null;
      estilosSetActive = null;
      camaraSetActive = null;
      currentMode = 'bloques';
      currentCameraMode = DEFAULT_CAMERA_MODE;
    },
  };
}
