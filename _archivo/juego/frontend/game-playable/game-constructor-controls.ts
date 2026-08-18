/* 138A-5 — Controles compartidos de los subpaneles del Constructor.
 * Fábricas DOM reutilizables (fila de rango, select y segmentos) con el
 * patrón del resto del OS: tokens B&W, `input` para valores continuos y
 * `setValue` para sincronizar desde fuera sin disparar eventos. */

import { createEl } from '../../../../utils/dom';

export interface RangeControl {
  readonly row: HTMLDivElement;
  readonly setValue: (value: number) => void;
}

export function createRangeControl(
  label: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  fmt: (value: number) => string,
  onChange: (value: number) => void,
): RangeControl {
  const row = createEl('div', { className: 'juegoPanelTerreno__fila' });
  const labelEl = createEl('label', { className: 'juegoPanelTerreno__rangoLabel', textContent: label });
  const valueEl = createEl('span', { className: 'juegoPanelTerreno__rangoValor', textContent: fmt(initial) });
  labelEl.appendChild(valueEl);
  const input = createEl('input', { className: 'juegoPanelTerreno__rango', type: 'range' });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.addEventListener('input', () => {
    const value = Number(input.value);
    valueEl.textContent = fmt(value);
    onChange(value);
  });
  row.append(labelEl, input);
  return {
    row,
    setValue(value) {
      input.value = String(value);
      valueEl.textContent = fmt(value);
    },
  };
}

export interface SelectControl {
  readonly row: HTMLDivElement;
  readonly setValue: (value: number) => void;
}

export function createSelectControl(
  label: string,
  options: readonly number[],
  initial: number,
  onChange: (value: number) => void,
): SelectControl {
  const row = createEl('div', { className: 'juegoPanelTerreno__fila' });
  row.appendChild(createEl('label', { className: 'juegoPanelTerreno__rangoLabel', textContent: label }));
  const select = createEl('select', { className: 'juegoPanelTerreno__entrada' });
  for (const option of options) {
    select.appendChild(createEl('option', { value: String(option), textContent: String(option) }));
  }
  select.value = String(initial);
  select.addEventListener('change', () => onChange(Number(select.value)));
  row.appendChild(select);
  return {
    row,
    setValue(value) {
      select.value = String(value);
    },
  };
}

export interface SegmentControl<T extends string> {
  readonly container: HTMLDivElement;
  readonly setActive: (key: T) => void;
}

export function createSegmentControl<T extends string>(
  options: readonly { readonly key: T; readonly label: string }[],
  initial: T,
  onChange: (key: T) => void,
): SegmentControl<T> {
  const container = createEl('div', { className: 'juegoPanelTerreno__segmentos' });
  const buttons = new Map<T, HTMLButtonElement>();
  for (const option of options) {
    const button = createEl('button', {
      className: 'juegoPanelTerreno__segmento',
      textContent: option.label,
      type: 'button',
    });
    if (option.key === initial) button.classList.add('juegoPanelTerreno__segmento--activo');
    button.addEventListener('click', () => {
      for (const [key, sibling] of buttons) {
        sibling.classList.toggle('juegoPanelTerreno__segmento--activo', key === option.key);
      }
      onChange(option.key);
    });
    buttons.set(option.key, button);
    container.appendChild(button);
  }
  return {
    container,
    setActive(key) {
      for (const [candidate, button] of buttons) {
        button.classList.toggle('juegoPanelTerreno__segmento--activo', candidate === key);
      }
    },
  };
}

/** Fila de seed numérico con botón "Aleatorio". */
export function createSeedRow(
  min: number,
  max: number,
  initial: number,
  onCommit: (seed: number) => void,
): { readonly row: HTMLDivElement; readonly setValue: (value: number) => void } {
  const row = createEl('div', { className: 'juegoPanelTerreno__fila' });
  row.appendChild(createEl('label', {
    className: 'juegoPanelTerreno__rangoLabel',
    textContent: 'Seed',
  }));
  const input = createEl('input', { className: 'juegoPanelTerreno__entrada', type: 'number' });
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(initial);
  input.addEventListener('input', () => {
    const seed = Math.floor(Number(input.value));
    if (Number.isFinite(seed)) onCommit(seed);
  });
  const randomButton = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Aleatorio',
  });
  randomButton.addEventListener('click', () => {
    const seed = Math.floor(Math.random() * 100000);
    input.value = String(seed);
    onCommit(seed);
  });
  const controls = createEl('div', { className: 'juegoPanelTerreno__doble' });
  controls.append(input, randomButton);
  row.appendChild(controls);
  return {
    row,
    setValue(value) {
      input.value = String(value);
    },
  };
}

export interface ColorControl {
  readonly row: HTMLDivElement;
  /** Sincroniza el valor desde fuera sin disparar onChange. */
  readonly setValue: (hex: number) => void;
}

/** Convierte un hex entero a `#rrggbb` (para input de color). */
export function hexToCss(hex: number): string {
  const clamped = Math.min(0xffffff, Math.max(0, Math.floor(hex)));
  return `#${clamped.toString(16).padStart(6, '0')}`;
}

/** Fila de color del panel de Paleta: picker + texto editable + hex. */
export function createColorControl(
  label: string,
  initial: number,
  onChange: (hex: number) => void,
): ColorControl {
  const row = createEl('div', { className: 'juegoPanelTerreno__fila' });
  const labelEl = createEl('label', {
    className: 'juegoPanelTerreno__rangoLabel',
    textContent: label,
  });
  const swatch = createEl('span', { className: 'juegoPanelTerreno__colorMuestra' });
  const input = createEl('input', {
    className: 'juegoPanelTerreno__color',
    type: 'color',
    value: hexToCss(initial),
  });
  input.addEventListener('input', () => {
    const hex = Number.parseInt(input.value.slice(1), 16);
    if (Number.isFinite(hex)) {
      swatch.textContent = hexToCss(hex);
      onChange(hex);
    }
  });
  labelEl.append(swatch, input);
  row.appendChild(labelEl);
  return {
    row,
    setValue(hex) {
      input.value = hexToCss(hex);
      swatch.textContent = hexToCss(hex);
    },
  };
}
