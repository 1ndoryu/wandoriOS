/* GAME-01 — Grupos de controles de la isla curva, compartidos por el panel
 * clásico (sin constructor) y por las secciones del rail del Constructor
 * ("Isla", "Estilos" y "Cámara"). Solo DOM + contrato puro: las mutaciones
 * se delegan en los callbacks que recibe la escena. */

import { createEl } from '../../../../utils/dom';
import type { MapVersion, RenderStyle, WorldPalette } from '../../../game-core';
import { createSegmentControl } from './game-constructor-controls';
import { CAMERA_MODES, type CameraMode } from './game-camera-modes';
import type { ConstructorPanelState } from './game-constructor-persistence';
import type { WorldConstructorControls } from './game-world-constructor';
import type { VisualStyleSettings } from './game-sakura-preset';

export interface CurvedIslandPanelControls {
  readonly setCurvature: (down: number, pull: number) => void;
  readonly setRain: (amount: number) => void;
  readonly setPropsVisible: (visible: boolean) => void;
  readonly setCameraFollow: (follow: boolean) => void;
  readonly regenerate: () => void;
  /** [138A-1] Comparador de estilos del toolkit (opcional: solo si existe). */
  readonly setTerrainMode?: (mode: RenderStyle) => void;
  /** [138A-7] Cambio de modo de cámara (opcional: solo con constructor). */
  readonly setCameraMode?: (mode: CameraMode) => void;
  /** [138A-4] Constructor de mundo (opcional: solo si existe). */
  readonly worldConstructor?: WorldConstructorControls;
  /** [138A-8] Paleta inicial para los pickers de Color (restauración). */
  readonly initialPalette?: WorldPalette;
  /** [138A-8] Documento MapVersion inicial del panel Assets (restauración). */
  readonly initialMap?: MapVersion | null;
  /** [138A-15] Estilo visual inicial del subpanel Estilo (restauración). */
  readonly initialStyle?: VisualStyleSettings;
  /** [138A-8] Estado inicial de la ventana (colapso/lado/ancho). */
  readonly constructorPanelState?: ConstructorPanelState;
  /** [138A-8] Emite cambios de ventana para persistirlos con 138A-5. */
  readonly onConstructorPanelStateChange?: (state: ConstructorPanelState) => void;
}

const PRESETS: readonly { readonly key: string; readonly label: string; readonly down: number; readonly pull: number }[] = [
  { key: 'flat', label: 'Plano', down: 0, pull: 0 },
  { key: 'cozy', label: 'Cozy', down: 0.010, pull: 0.004 },
  { key: 'marble', label: 'Mármol', down: 0.026, pull: 0.012 },
];

/** Grupo "Isla": curva del mundo + lluvia + props + follow + regenerar. */
export function buildIslaGroup(
  container: HTMLElement,
  controls: CurvedIslandPanelControls,
): void {
  /* --- grupo: curva del mundo --- */
  const grupoCurva = createEl('div', { className: 'juegoPanelTerreno__grupo' });
  grupoCurva.appendChild(createEl('p', { className: 'juegoPanelTerreno__tituloGrupo', textContent: 'Curva del mundo' }));

  const sliders = buildSliderPair(grupoCurva, controls.setCurvature);

  const segPresets = createEl('div', { className: 'juegoPanelTerreno__segmentos' });
  for (const preset of PRESETS) {
    const button = createEl('button', {
      className: 'juegoPanelTerreno__segmento',
      textContent: preset.label,
      type: 'button',
    });
    if (preset.key === 'cozy') button.classList.add('juegoPanelTerreno__segmento--activo');
    button.addEventListener('click', () => {
      for (const sibling of Array.from(segPresets.children)) {
        sibling.classList.toggle('juegoPanelTerreno__segmento--activo', sibling === button);
      }
      sliders.set(preset.down, preset.pull);
    });
    segPresets.appendChild(button);
  }
  grupoCurva.appendChild(segPresets);
  container.appendChild(grupoCurva);

  /* --- grupo: isla --- */
  const grupoIsla = createEl('div', { className: 'juegoPanelTerreno__grupo' });
  grupoIsla.appendChild(createEl('p', { className: 'juegoPanelTerreno__tituloGrupo', textContent: 'Isla' }));

  const rainRow = createEl('div', { className: 'juegoPanelTerreno__fila' });
  const rainLabel = createEl('label', { className: 'juegoPanelTerreno__rangoLabel', textContent: 'Lluvia' });
  const rainValue = createEl('span', { className: 'juegoPanelTerreno__rangoValor', textContent: '60%' });
  rainLabel.appendChild(rainValue);
  const rainInput = buildRange(0, 100, 1, 60, (v) => {
    rainValue.textContent = `${Math.round(v)}%`;
    controls.setRain(v / 100);
  });
  rainRow.append(rainLabel, rainInput);
  grupoIsla.appendChild(rainRow);

  buildCheck(grupoIsla, 'Árboles y rocas', true, (checked) => {
    controls.setPropsVisible(checked);
  });

  buildCheck(grupoIsla, 'Cámara sigue', true, (checked) => {
    controls.setCameraFollow(checked);
  });

  const regenButton = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Crecer nueva isla',
  });
  regenButton.addEventListener('click', () => {
    controls.regenerate();
  });
  grupoIsla.appendChild(regenButton);
  container.appendChild(grupoIsla);
}

/** Grupo "Comparar estilos" del toolkit; devuelve la línea de métricas y el
 * marcador de segmento activo (para que el panel externo sincronice). */
export function buildEstilosGroup(
  container: HTMLElement,
  controls: CurvedIslandPanelControls,
  initialMode: RenderStyle,
): { readonly metricsEl: HTMLParagraphElement; readonly setActive: (mode: RenderStyle) => void } {
  const grupoComparador = createEl('div', { className: 'juegoPanelTerreno__grupo' });
  grupoComparador.appendChild(createEl('p', {
    className: 'juegoPanelTerreno__tituloGrupo',
    textContent: 'Comparar estilos',
  }));

  const segEstilos = createEl('div', { className: 'juegoPanelTerreno__segmentos' });
  const estilos: readonly { key: RenderStyle; label: string }[] = [
    { key: 'bloques', label: 'Bloques' },
    { key: 'suave', label: 'Suave' },
  ];
  const styleButtons = new Map<RenderStyle, HTMLButtonElement>();
  for (const estilo of estilos) {
    const button = createEl('button', {
      className: 'juegoPanelTerreno__segmento',
      textContent: estilo.label,
      type: 'button',
    });
    if (estilo.key === initialMode) button.classList.add('juegoPanelTerreno__segmento--activo');
    button.addEventListener('click', () => {
      setActive(estilo.key);
      controls.setTerrainMode?.(estilo.key);
    });
    styleButtons.set(estilo.key, button);
    segEstilos.appendChild(button);
  }
  const setActive = (mode: RenderStyle): void => {
    for (const [key, button] of styleButtons) {
      button.classList.toggle('juegoPanelTerreno__segmento--activo', key === mode);
    }
  };

  grupoComparador.appendChild(segEstilos);
  const metricsEl = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });
  grupoComparador.appendChild(metricsEl);
  container.appendChild(grupoComparador);
  return { metricsEl, setActive };
}

/** Grupo "Cámara": selector de modo libre/primera/3ª persona del toolkit.
 *  Devuelve el marcador de segmento activo para sincronizar desde fuera
 *  (restauración, atajo de teclado). */
export function buildCamaraGroup(
  container: HTMLElement,
  controls: CurvedIslandPanelControls,
  initialMode: CameraMode,
): { readonly setActive: (mode: CameraMode) => void } {
  const grupo = createEl('div', { className: 'juegoPanelTerreno__grupo' });
  grupo.appendChild(createEl('p', {
    className: 'juegoPanelTerreno__tituloGrupo',
    textContent: 'Modo de cámara',
  }));
  const segment = createSegmentControl(CAMERA_MODES, initialMode, (mode) => {
    controls.setCameraMode?.(mode);
  });
  grupo.appendChild(segment.container);
  grupo.appendChild(createEl('p', {
    className: 'juegoPanelTerreno__statsLine',
    textContent: 'Atajo: tecla C',
  }));
  container.appendChild(grupo);
  return { setActive: segment.setActive };
}

/* createEl no asigna min/max/step: se fijan como propiedades para que el
 * rango respete el paso y no se redondee al default del navegador (step=1). */
function buildRange(
  min: number,
  max: number,
  step: number,
  initial: number,
  onChange: (value: number) => void,
): HTMLInputElement {
  const input = createEl('input', { className: 'juegoPanelTerreno__rango', type: 'range' });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.addEventListener('input', () => onChange(Number(input.value)));
  return input;
}

interface SliderRef {
  readonly input: HTMLInputElement;
  readonly valueEl: HTMLSpanElement;
  readonly fmt: (v: number) => string;
}

function buildSliderPair(
  grupo: HTMLElement,
  setCurvature: (down: number, pull: number) => void,
): { readonly set: (down: number, pull: number) => void } {
  let down = 0.010;
  let pull = 0.004;
  const refs: SliderRef[] = [];

  const make = (
    label: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    fmt: (v: number) => string,
    apply: (v: number) => void,
  ): void => {
    const row = createEl('div', { className: 'juegoPanelTerreno__fila' });
    const labelEl = createEl('label', { className: 'juegoPanelTerreno__rangoLabel', textContent: label });
    const valueEl = createEl('span', { className: 'juegoPanelTerreno__rangoValor', textContent: fmt(initial) });
    labelEl.appendChild(valueEl);
    const input = buildRange(min, max, step, initial, (v) => {
      valueEl.textContent = fmt(v);
      apply(v);
    });
    refs.push({ input, valueEl, fmt });
    row.append(labelEl, input);
    grupo.appendChild(row);
  };

  make('Curva abajo', 0, 0.03, 0.0005, down, v => v.toFixed(4), (v) => { down = v; setCurvature(down, pull); });
  make('Tirón horizonte', 0, 0.016, 0.0002, pull, v => v.toFixed(4), (v) => { pull = v; setCurvature(down, pull); });

  return {
    set: (d, p) => {
      down = d;
      pull = p;
      refs[0].input.value = String(d);
      refs[0].valueEl.textContent = refs[0].fmt(d);
      refs[1].input.value = String(p);
      refs[1].valueEl.textContent = refs[1].fmt(p);
      setCurvature(d, p);
    },
  };
}

function buildCheck(
  grupo: HTMLElement,
  label: string,
  initial: boolean,
  onChange: (checked: boolean) => void,
): HTMLLabelElement {
  const wrap = createEl('label', { className: 'juegoPanelTerreno__check' });
  const input = createEl('input', { type: 'checkbox' });
  input.checked = initial;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.append(input, document.createTextNode(label));
  grupo.appendChild(wrap);
  return wrap;
}
