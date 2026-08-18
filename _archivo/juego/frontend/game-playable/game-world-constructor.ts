/* GAME-01 / 138A-5 — Toolkit de edición del Constructor de mundo.
 * Sustituye la sección única "Constructor" por un rail lateral de iconos
 * (tipo Blender): cada icono abre un subpanel pequeño con opciones
 * agrupadas y un solo subpanel activo a la vez. El panel es exterior
 * (contenedor colapsable) y los controles del terreno son secciones del
 * rail; así el panel de terreno no envuelve al constructor. Cada mutación
 * emite `onChange` (tiempo real con debounce en la escena); Generar/
 * Exportar/Importar y las métricas quedan fijos bajo el rail. Solo DOM +
 * contrato puro de game-core: la generación y el 3D viven en la escena. */

import { createElement, Globe, Mountain, type IconNode } from 'lucide';
import { createEl } from '../../../../utils/dom';
import {
  SHAPE_PRESETS,
  TERRAIN_OPTIONS_DEFAULTS,
  TERRAIN_OPTIONS_LIMITS,
  WORLD_PALETTE_DEFAULTS,
  GRASS_FIELD_DEFAULTS,
  SKY_DEFAULTS,
  normalizeTerrainLayerStack,
  normalizeWorldPalette,
  normalizeTerrainOptions,
  normalizeGrassFieldOptions,
  normalizeSkyOptions,
  type MapEditOp,
  type MapVersion,
  type ShapePreset,
  type TerrainLayer,
  type TerrainOptions,
  type WorldPalette,
  type GrassFieldOptions,
  type SkyOptions,
} from '../../../game-core';
import {
  DEFAULT_BRUSH_STATE,
  normalizeBrushState,
  type ConstructorBrushState,
} from './game-layer-brush';
import {
  CONSTRUCTOR_PANEL_DEFAULT_WIDTH,
  CONSTRUCTOR_PANEL_MAX_WIDTH,
  CONSTRUCTOR_PANEL_MIN_WIDTH,
  normalizePanelState,
  type ConstructorPanelState,
} from './game-constructor-persistence';
import {
  createRangeControl,
  createSelectControl,
  createSeedRow,
  createSegmentControl,
} from './game-constructor-controls';
import {
  DEFAULT_VISUAL_STYLE,
  normalizeVisualStyle,
  type VisualStyleSettings,
} from './game-sakura-preset';

export interface WorldConstructorControls {
  readonly onGenerate: (options: TerrainOptions) => void;
  readonly onExport: () => void;
  readonly onImport: (text: string) => void;
  /** [138A-5] Tiempo real: cada cambio de valor emite las opciones válidas. */
  readonly onChange?: (options: TerrainOptions) => void;
  /** [138A-8] Cambio de paleta del mundo (tiempo real, debounce en escena). */
  readonly onPaletteChange?: (palette: WorldPalette) => void;
  /** [138A-8] Edición de objetos del documento (mover/colocar/quitar). */
  readonly onEditObjects?: (ops: readonly MapEditOp[]) => void;
  /** [138A-8] Cambio de rampa toon/textura global (null = reset). */
  readonly onToonRampChange?: (dataUrl: string | null) => void;
  /** [138A-9] Cambio del stack de capas del editor de mapa (pinceles). */
  readonly onLayersChange?: (layers: readonly TerrainLayer[]) => void;
  /** [138A-9] Cambio del estado del pincel (activo/tamaño/objetivo). */
  readonly onBrushStateChange?: (brush: ConstructorBrushState) => void;
  /** [138A-10] Cambio de opciones del pasto (tiempo real, debounce en escena). */
  readonly onGrassChange?: (grass: GrassFieldOptions) => void;
  /** [138A-12] Cambio de opciones del cielo/ambiente (debounce en escena). */
  readonly onSkyChange?: (sky: SkyOptions) => void;
  /** [138A-15] Cambio del estilo visual (bosque/sakura + tinta). */
  readonly onStyleChange?: (style: VisualStyleSettings) => void;
}

export interface WorldConstructorSection {
  readonly setStats: (text: string) => void;
  readonly applyOptions: (options: TerrainOptions) => void;
  /** [138A-8] Sincroniza la paleta desde fuera (restauración). */
  readonly applyPalette: (palette: WorldPalette) => void;
  /** [138A-8] Sincroniza el documento actual (restauración/import). */
  readonly applyMap: (map: MapVersion | null) => void;
  /** [138A-8] Aplica el estado de la ventana sin emitir el callback. */
  readonly applyPanelState: (state: ConstructorPanelState) => void;
  /** [138A-9] Sincroniza el stack de capas desde fuera (restauración). */
  readonly applyLayers: (layers: readonly TerrainLayer[]) => void;
  /** [138A-9] Sincroniza el estado del pincel (restauración/auto-creación). */
  readonly applyBrush: (brush: ConstructorBrushState) => void;
  /** [138A-10] Sincroniza las opciones del pasto desde fuera (restauración). */
  readonly applyGrass: (grass: GrassFieldOptions) => void;
  /** [138A-12] Sincroniza las opciones del cielo desde fuera (restauración). */
  readonly applySky: (sky: SkyOptions) => void;
  /** [138A-15] Sincroniza el estilo visual desde fuera (restauración). */
  readonly applyStyle: (style: VisualStyleSettings) => void;
  readonly destroy: () => void;
}

export interface WorldConstructorSubpanel {
  readonly key: string;
  readonly label: string;
  readonly icon: IconNode;
  /** Construye el subpanel dentro de `container` y registra su sincronizador. */
  readonly build: (container: HTMLElement, ctx: ConstructorPanelContext) => void;
}

export interface WorldConstructorOptions {
  /** [138A-5] Secciones extra del rail (Isla, Estilos, Cámara, Objetos…). */
  readonly extraPanels?: readonly WorldConstructorSubpanel[];
  /** Título de la cabecera colapsable. Por defecto "Constructor". */
  readonly title?: string;
  /** [138A-8] Paleta inicial (default = WORLD_PALETTE_DEFAULTS). */
  readonly initialPalette?: WorldPalette;
  /** [138A-8] Documento MapVersion inicial (restauración/import). */
  readonly initialMap?: MapVersion | null;
  /** [138A-8] Estado inicial de la ventana (colapso/lado/ancho). */
  readonly constructorPanelState?: ConstructorPanelState;
  /** [138A-15] Estado inicial del estilo visual (restauración). */
  readonly initialStyle?: VisualStyleSettings;
  /** [138A-8] Emite cambios de ventana para persistirlos con 138A-5. */
  readonly onConstructorPanelStateChange?: (state: ConstructorPanelState) => void;
}

const DIMENSION_OPTIONS: readonly number[] = [16, 32, 48, 64, 96, 128];
const CELL_SIZE_OPTIONS: readonly number[] = [0.5, 1, 1.5, 2];

export interface ConstructorPanelContext {
  /** Opciones actuales del constructor (mismo objeto hasta el próximo commit). */
  readonly state: TerrainOptions;
  /** Aplica una mutación sobre las opciones y emite tiempo real. */
  readonly commit: (next: TerrainOptions) => void;
  /** Registra un sincronizador que `applyOptions` ejecuta al restaurar. */
  readonly sync: (fn: () => void) => void;
  /** [138A-8] Paleta actual del mundo (mismo objeto hasta el próximo commit). */
  readonly palette: WorldPalette;
  /** [138A-8] Aplica una paleta y emite tiempo real. */
  readonly commitPalette: (next: WorldPalette) => void;
  /** [138A-8] Registra un sincronizador de paleta (applyPalette). */
  readonly syncPalette: (fn: () => void) => void;
  /** [138A-8] Documento del mundo actual (null antes de generar/importar). */
  readonly worldMap: MapVersion | null;
  /** [138A-8] Aplica operaciones de objetos sobre el documento. */
  readonly commitObjectEdits: (ops: readonly MapEditOp[]) => void;
  /** [138A-8] Cambia la rampa toon global (textura) o la resetea. */
  readonly commitToonRamp: (dataUrl: string | null) => void;
  /** [138A-8] Registra un sincronizador de documento (applyMap). */
  readonly syncMap: (fn: () => void) => void;
  /** [138A-9] Stack de capas de terreno actual (mismo array hasta commit). */
  readonly layers: readonly TerrainLayer[];
  /** [138A-9] Aplica un stack de capas y emite tiempo real. */
  readonly commitLayers: (next: readonly TerrainLayer[]) => void;
  /** [138A-9] Registra un sincronizador de capas (applyLayers). */
  readonly syncLayers: (fn: () => void) => void;
  /** [138A-9] Registra un sincronizador de pincel (applyBrush). */
  readonly syncBrush: (fn: () => void) => void;
  /** [138A-9] Estado del pincel del editor de mapa. */
  readonly brush: ConstructorBrushState;
  /** [138A-9] Cambia el pincel y lo emite a la escena. */
  readonly commitBrush: (next: ConstructorBrushState) => void;
  /** [138A-10] Opciones actuales del pasto (mismo objeto hasta el commit). */
  readonly grass: GrassFieldOptions;
  /** [138A-10] Aplica opciones de pasto y emite tiempo real. */
  readonly commitGrass: (next: GrassFieldOptions) => void;
  /** [138A-10] Registra un sincronizador de pasto (applyGrass). */
  readonly syncGrass: (fn: () => void) => void;
  /** [138A-12] Opciones actuales del cielo (mismo objeto hasta el commit). */
  readonly sky: SkyOptions;
  /** [138A-12] Aplica opciones de cielo y emite tiempo real. */
  readonly commitSky: (next: SkyOptions) => void;
  /** [138A-12] Registra un sincronizador de cielo (applySky). */
  readonly syncSky: (fn: () => void) => void;
  /** [138A-15] Estilo visual actual (mismo objeto hasta el próximo commit). */
  readonly style: VisualStyleSettings;
  /** [138A-15] Aplica un estilo visual y lo emite a la escena. */
  readonly commitStyle: (next: VisualStyleSettings) => void;
  /** [138A-15] Registra un sincronizador de estilo (applyStyle). */
  readonly syncStyle: (fn: () => void) => void;
}

export function mountWorldConstructor(
  host: HTMLElement,
  controls: WorldConstructorControls,
  options: WorldConstructorOptions = {},
): WorldConstructorSection {
  const {
    extraPanels = [],
    title = 'Constructor',
    initialPalette,
    initialMap = null,
    constructorPanelState,
    initialStyle,
    onConstructorPanelStateChange,
  } = options;
  const defaults = { ...TERRAIN_OPTIONS_DEFAULTS };
  let state: TerrainOptions = normalizeTerrainOptions(defaults);
  /* [138A-8] Paleta y documento del mundo: el ctx los comparte con los
   * subpaneles (Color/Assets) y `applyPalette`/`applyMap` los restauran. */
  let palette: WorldPalette = initialPalette
    ? normalizeWorldPalette(initialPalette)
    : { ...WORLD_PALETTE_DEFAULTS };
  let worldMap: MapVersion | null = initialMap;
  /* [138A-9] Stack de capas y pincel del editor de mapa: se comparten con el
   * subpanel Capas y la escena (painter) vía commit/apply. */
  let layers: readonly TerrainLayer[] = [];
  let brush: ConstructorBrushState = { ...DEFAULT_BRUSH_STATE };
  /* [138A-10] Opciones del pasto compartidas con el subpanel Pasto y la
   * escena vía commit/apply (mismo patrón que capas/pincel). */
  let grass: GrassFieldOptions = { ...GRASS_FIELD_DEFAULTS };
  /* [138A-12] Opciones del cielo compartidas con el subpanel Ambiente y la
   * escena vía commit/apply (mismo patrón que pasto/paleta). */
  let sky: SkyOptions = { ...SKY_DEFAULTS };
  /* [138A-15] Estilo visual compartido con el subpanel Estilo y la escena
   * vía commit/apply (mismo patrón que cielo/pasto). */
  let style: VisualStyleSettings = initialStyle
    ? normalizeVisualStyle(initialStyle)
    : { ...DEFAULT_VISUAL_STYLE };
  const syncers: Array<() => void> = [];
  const paletteSyncers: Array<() => void> = [];
  const mapSyncers: Array<() => void> = [];
  const layersSyncers: Array<() => void> = [];
  const brushSyncers: Array<() => void> = [];
  const grassSyncers: Array<() => void> = [];
  const skySyncers: Array<() => void> = [];
  const styleSyncers: Array<() => void> = [];
  const sync = (fn: () => void): void => { syncers.push(fn); };
  const syncPalette = (fn: () => void): void => { paletteSyncers.push(fn); };
  const syncMap = (fn: () => void): void => { mapSyncers.push(fn); };
  const syncLayers = (fn: () => void): void => { layersSyncers.push(fn); };
  const syncBrush = (fn: () => void): void => { brushSyncers.push(fn); };
  const syncGrass = (fn: () => void): void => { grassSyncers.push(fn); };
  const syncSky = (fn: () => void): void => { skySyncers.push(fn); };
  const syncStyle = (fn: () => void): void => { styleSyncers.push(fn); };
  const commit = (next: TerrainOptions): void => {
    state = next;
    emitChange();
  };
  const emitChange = (): void => {
    controls.onChange?.(normalizeTerrainOptions(state));
  };
  const commitPalette = (next: WorldPalette): void => {
    palette = normalizeWorldPalette(next);
    controls.onPaletteChange?.(palette);
  };
  const commitObjectEdits = (ops: readonly MapEditOp[]): void => {
    controls.onEditObjects?.(ops);
  };
  const commitToonRamp = (dataUrl: string | null): void => {
    controls.onToonRampChange?.(dataUrl);
  };
  const commitLayers = (next: readonly TerrainLayer[]): void => {
    layers = normalizeTerrainLayerStack(next);
    controls.onLayersChange?.(layers);
    /* [138A-9] El visor debe reflejar su propio commit (ojo/orden/duplicar/
     * eliminar/añadir) aunque la escena no esté montada: los syncers son
     * idempotentes y re-renderizan la lista y el selector del pincel. */
    for (const syncer of layersSyncers) syncer();
  };
  const commitBrush = (next: ConstructorBrushState): void => {
    brush = normalizeBrushState(next);
    controls.onBrushStateChange?.(brush);
    for (const syncer of brushSyncers) syncer();
  };
  const commitGrass = (next: GrassFieldOptions): void => {
    grass = normalizeGrassFieldOptions(next);
    controls.onGrassChange?.(grass);
    for (const syncer of grassSyncers) syncer();
  };
  const commitSky = (next: SkyOptions): void => {
    sky = normalizeSkyOptions(next);
    controls.onSkyChange?.(sky);
    for (const syncer of skySyncers) syncer();
  };
  const commitStyle = (next: VisualStyleSettings): void => {
    style = normalizeVisualStyle(next);
    controls.onStyleChange?.(style);
    for (const syncer of styleSyncers) syncer();
  };
  const ctx: ConstructorPanelContext = {
    get state() { return state; },
    commit,
    sync,
    get palette() { return palette; },
    commitPalette,
    syncPalette,
    get worldMap() { return worldMap; },
    commitObjectEdits,
    commitToonRamp,
    syncMap,
    get layers() { return layers; },
    commitLayers,
    syncLayers,
    syncBrush,
    get brush() { return brush; },
    commitBrush,
    get grass() { return grass; },
    commitGrass,
    syncGrass,
    get sky() { return sky; },
    commitSky,
    syncSky,
    get style() { return style; },
    commitStyle,
    syncStyle,
  };

  /* [138A-8] Estado de la ventana lateral: colapso, lado y ancho. El estado
   * inválido cae al default (fail-closed) y cada mutación se emite para que
   * la escena lo persista con 138A-5. */
  let panelState: ConstructorPanelState = normalizePanelState(constructorPanelState) ?? {
    collapsed: false,
    side: 'right',
    width: CONSTRUCTOR_PANEL_DEFAULT_WIDTH,
  };
  const applyPanelState = (next: ConstructorPanelState): void => {
    panelState = normalizePanelState(next) ?? panelState;
    root.classList.toggle('juegoConstructor--cerrado', panelState.collapsed);
    root.classList.toggle('juegoConstructor--izquierda', panelState.side === 'left');
    root.classList.toggle('juegoConstructor--derecha', panelState.side === 'right');
    root.style.width = `${panelState.width}px`;
    cabecera.setAttribute('aria-expanded', String(!panelState.collapsed));
  };
  const emitPanelState = (): void => {
    onConstructorPanelStateChange?.({ ...panelState });
  };

  const root = createEl('section', {
    className: 'juegoConstructor',
    ariaLabel: title,
  });
  /* El panel no debe orbitar la cámara ni disparar el picking del terreno:
   * sus eventos de puntero/rueda no burbujean al host de la escena. */
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'] as const) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }

  const cabecera = createEl('div', {
    className: 'juegoConstructor__cabecera',
    role: 'button',
    'aria-expanded': 'true',
    'aria-label': 'Plegar constructor',
  });
  cabecera.tabIndex = 0;
  cabecera.appendChild(createEl('span', {
    className: 'juegoConstructor__titulo',
    textContent: title,
  }));
  const dockButton = createEl('button', {
    className: 'juegoConstructor__lado',
    type: 'button',
    title: 'Cambiar de lado',
    'aria-label': 'Cambiar de lado',
    textContent: '↔',
  });
  dockButton.addEventListener('click', (event) => {
    event.stopPropagation();
    panelState = { ...panelState, side: panelState.side === 'left' ? 'right' : 'left' };
    applyPanelState(panelState);
    emitPanelState();
  });
  cabecera.append(createEl('span', {
    className: 'juegoConstructor__plegar',
    'aria-hidden': 'true',
    textContent: '▸',
  }), dockButton);
  const toggleCollapsed = (): void => {
    panelState = { ...panelState, collapsed: !panelState.collapsed };
    applyPanelState(panelState);
    emitPanelState();
  };
  cabecera.addEventListener('click', toggleCollapsed);
  cabecera.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCollapsed();
    }
  });

  /* [138A-8] Ancho redimensionable por arrastre del borde (pointer events
   * locales; el root ya frena la propagación hacia la órbita de cámara). */
  const resizeHandle = createEl('div', {
    className: 'juegoConstructor__resize',
    role: 'separator',
    'aria-label': 'Redimensionar panel',
  });
  resizeHandle.setAttribute('aria-orientation', 'vertical');
  let resizing = false;
  let resizeStartX = 0;
  let resizeStartWidth = CONSTRUCTOR_PANEL_DEFAULT_WIDTH;
  resizeHandle.addEventListener('pointerdown', (event) => {
    resizing = true;
    resizeStartX = event.clientX;
    resizeStartWidth = panelState.width;
    resizeHandle.setPointerCapture?.(event.pointerId);
  });
  resizeHandle.addEventListener('pointermove', (event) => {
    if (!resizing) return;
    const delta = panelState.side === 'right' ? -(event.clientX - resizeStartX) : (event.clientX - resizeStartX);
    panelState = {
      ...panelState,
      width: Math.round(Math.min(
        CONSTRUCTOR_PANEL_MAX_WIDTH,
        Math.max(CONSTRUCTOR_PANEL_MIN_WIDTH, resizeStartWidth + delta),
      )),
    };
    applyPanelState(panelState);
  });
  const finishResize = (): void => {
    if (!resizing) return;
    resizing = false;
    emitPanelState();
  };
  resizeHandle.addEventListener('pointerup', finishResize);
  resizeHandle.addEventListener('pointercancel', finishResize);

  const cuerpo = createEl('div', { className: 'juegoConstructor__cuerpo' });
  const rail = createEl('nav', {
    className: 'juegoConstructor__rail',
    ariaLabel: 'Herramientas del constructor',
  });
  const lienzo = createEl('div', { className: 'juegoConstructor__lienzo' });
  cuerpo.append(rail, lienzo);

  /* --- acciones fijas: generar / exportar / importar + métricas --- */
  const statsEl = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });
  const generateButton = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Generar mundo',
  });
  generateButton.addEventListener('click', () => {
    try {
      controls.onGenerate(normalizeTerrainOptions(state));
    } catch (error) {
      statsEl.textContent = error instanceof Error ? `error: ${error.message}` : 'opciones inválidas';
    }
  });

  const exportButton = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Exportar JSON',
  });
  exportButton.addEventListener('click', () => controls.onExport());

  const fileInput = createEl('input', {
    className: 'juegoPanelTerreno__entrada',
    type: 'file',
    accept: '.json,application/json',
  });
  fileInput.hidden = true;
  const importButton = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Importar JSON',
  });
  importButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file) {
      file.text().then(controls.onImport, () => {
        statsEl.textContent = 'error: no se pudo leer el archivo';
      });
    }
  });

  const acciones = createEl('div', { className: 'juegoConstructor__acciones' });
  acciones.append(fileInput, generateButton, exportButton, importButton, statsEl);

  /* --- registro de subpaneles (OCP: 138A-6/7/8 añaden Cámara, Objetos,
   * Color, Textura y Assets sin tocar el rail). --- */
  const panels: readonly WorldConstructorSubpanel[] = [
    { key: 'terreno', label: 'Terreno', icon: Mountain, build: buildTerrenoPanel },
    { key: 'mundo', label: 'Mundo/Estilo', icon: Globe, build: buildMundoPanel },
    ...extraPanels,
  ];

  const railButtons = new Map<string, HTMLButtonElement>();
  let activePanel: WorldConstructorSubpanel | null = null;
  let subpanelEl: HTMLElement | null = null;

  const openPanel = (panel: WorldConstructorSubpanel): void => {
    if (activePanel?.key === panel.key) {
      activePanel = null;
      subpanelEl?.remove();
      subpanelEl = null;
      syncers.length = 0;
      for (const button of railButtons.values()) button.setAttribute('aria-pressed', 'false');
      return;
    }
    activePanel = panel;
    subpanelEl?.remove();
    syncers.length = 0;
    subpanelEl = createEl('div', {
      className: 'juegoConstructor__subpanel',
      role: 'region',
      ariaLabel: panel.label,
    });
    subpanelEl.appendChild(createEl('p', {
      className: 'juegoPanelTerreno__tituloGrupo',
      textContent: panel.label,
    }));
    panel.build(subpanelEl, ctx);
    lienzo.appendChild(subpanelEl);
    for (const [key, button] of railButtons) {
      button.setAttribute('aria-pressed', String(key === panel.key));
    }
  };

  for (const panel of panels) {
    const button = createEl('button', {
      className: 'juegoConstructor__icono',
      type: 'button',
      title: panel.label,
      'aria-label': panel.label,
      'aria-pressed': 'false',
    });
    button.appendChild(createEl('span', { ariaHidden: 'true' }, createElement(panel.icon)));
    button.addEventListener('click', () => {
      /* [138A-8] Un clic en el rail plegado despliega la ventana. */
      if (panelState.collapsed) toggleCollapsed();
      openPanel(panel);
      button.classList.toggle('juegoConstructor__icono--activo', activePanel?.key === panel.key);
    });
    railButtons.set(panel.key, button);
    rail.appendChild(button);
  }

  root.append(cabecera, cuerpo, acciones, resizeHandle);
  host.appendChild(root);
  applyPanelState(panelState);
  openPanel(panels[0]);
  railButtons.get(panels[0].key)?.classList.add('juegoConstructor__icono--activo');

  return {
    setStats: (text) => { statsEl.textContent = text; },
    applyOptions: (options) => {
      state = normalizeTerrainOptions(options);
      for (const syncer of syncers) syncer();
    },
    applyPalette: (next) => {
      palette = normalizeWorldPalette(next);
      for (const syncer of paletteSyncers) syncer();
    },
    applyMap: (next) => {
      worldMap = next;
      for (const syncer of mapSyncers) syncer();
    },
    applyLayers: (next) => {
      layers = normalizeTerrainLayerStack(next);
      for (const syncer of layersSyncers) syncer();
    },
    applyBrush: (next) => {
      brush = normalizeBrushState(next);
      for (const syncer of brushSyncers) syncer();
    },
    applyGrass: (next) => {
      grass = normalizeGrassFieldOptions(next);
      for (const syncer of grassSyncers) syncer();
    },
    applySky: (next) => {
      sky = normalizeSkyOptions(next);
      for (const syncer of skySyncers) syncer();
    },
    applyStyle: (next) => {
      style = normalizeVisualStyle(next);
      for (const syncer of styleSyncers) syncer();
    },
    applyPanelState,
    destroy: () => { root.remove(); },
  };
}

/* --- subpanel Terreno: forma, seed y rangos del relieve --- */
function buildTerrenoPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const { commit, sync } = ctx;

  /* forma: segmentos de presets */
  const shapeSegments = createSegmentControl<ShapePreset>(
    SHAPE_PRESETS,
    ctx.state.shape,
    (shape) => commit({ ...ctx.state, shape }),
  );
  sync(() => shapeSegments.setActive(ctx.state.shape));
  container.appendChild(shapeSegments.container);

  const seed = createSeedRow(
    TERRAIN_OPTIONS_LIMITS.minSeed,
    TERRAIN_OPTIONS_LIMITS.maxSeed,
    ctx.state.seed,
    (seedValue) => commit({ ...ctx.state, seed: seedValue }),
  );
  sync(() => seed.setValue(ctx.state.seed));
  container.appendChild(seed.row);

  /* rangos continuos del relieve */
  const height = createRangeControl(
    'Altura máx', TERRAIN_OPTIONS_LIMITS.minMaxHeight, TERRAIN_OPTIONS_LIMITS.maxMaxHeight,
    0.5, ctx.state.maxHeight, v => v.toFixed(1),
    (maxHeight) => commit({ ...ctx.state, maxHeight }),
  );
  const water = createRangeControl(
    'Nivel agua', -2, 4, 0.1, ctx.state.waterLevel, v => v.toFixed(1),
    (waterLevel) => commit({ ...ctx.state, waterLevel }),
  );
  const coast = createRangeControl(
    'Costa', TERRAIN_OPTIONS_LIMITS.minCoast, TERRAIN_OPTIONS_LIMITS.maxCoast - 0.04,
    0.01, ctx.state.coast, v => v.toFixed(2),
    (coast) => commit({ ...ctx.state, coast }),
  );
  const warp = createRangeControl(
    'Warp', TERRAIN_OPTIONS_LIMITS.minWarp, TERRAIN_OPTIONS_LIMITS.maxWarp - 0.04,
    0.01, ctx.state.warp, v => v.toFixed(2),
    (warp) => commit({ ...ctx.state, warp }),
  );
  const octaves = createRangeControl(
    'Octaves', TERRAIN_OPTIONS_LIMITS.minOctaves, TERRAIN_OPTIONS_LIMITS.maxOctaves,
    1, ctx.state.octaves, v => String(v),
    (octaves) => commit({ ...ctx.state, octaves }),
  );
  for (const control of [height, water, coast, warp, octaves]) {
    sync(() => control.setValue(
      control === height ? ctx.state.maxHeight
        : control === water ? ctx.state.waterLevel
        : control === coast ? ctx.state.coast
        : control === warp ? ctx.state.warp
        : ctx.state.octaves,
    ));
    container.appendChild(control.row);
  }
}

/* --- subpanel Mundo/Estilo: dimensiones, celda y vegetación --- */
function buildMundoPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const { commit, sync } = ctx;

  const widthSel = createSelectControl('Ancho', DIMENSION_OPTIONS, ctx.state.width,
    (width) => commit({ ...ctx.state, width }));
  const depthSel = createSelectControl('Profundo', DIMENSION_OPTIONS, ctx.state.depth,
    (depth) => commit({ ...ctx.state, depth }));
  const dimsRow = createEl('div', { className: 'juegoPanelTerreno__doble' });
  dimsRow.append(widthSel.row, depthSel.row);
  container.appendChild(dimsRow);

  const cellSel = createSelectControl('Celda', CELL_SIZE_OPTIONS, ctx.state.cellSize,
    (cellSize) => commit({ ...ctx.state, cellSize }));
  container.appendChild(cellSel.row);

  const density = createRangeControl(
    'Vegetación', 0, 100, 1, ctx.state.vegetationDensity * 100, v => `${Math.round(v)}%`,
    (v) => commit({ ...ctx.state, vegetationDensity: v / 100 }),
  );
  container.appendChild(density.row);

  sync(() => widthSel.setValue(ctx.state.width));
  sync(() => depthSel.setValue(ctx.state.depth));
  sync(() => cellSel.setValue(ctx.state.cellSize));
  sync(() => density.setValue(ctx.state.vegetationDensity * 100));
}
