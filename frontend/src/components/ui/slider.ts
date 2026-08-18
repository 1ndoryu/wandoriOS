/* wandori.us — SizeSlider (UI atómica)
 * Slider de tamaño con etiqueta y valor en vivo.
 * [297A-29 F1] Extraído del panel legacy: al retirar la configuración de
 * fuentes, el slider queda como componente reutilizable del sistema (perfil,
 * redes y futuros paneles). */

import { createEl } from '../../utils/dom';

export function createSizeSlider(
  label: string,
  min: number,
  max: number,
  value: number,
  onChange: (v: number) => void,
  suffix = 'px',
  step?: number,
): HTMLElement {
  const etiqueta = createEl('label', { className: 'campo-etiqueta', textContent: label });
  const valor = createEl('span', { className: 'slider-valor', textContent: `${value}${suffix}` });
  const header = createEl('div', { className: 'slider-header' }, etiqueta, valor);

  const input = createEl('input', {
    type: 'range',
    className: 'slider-input',
    min: String(min),
    max: String(max),
  });
  input.value = String(value);
  if (step !== undefined) input.step = String(step);

  input.addEventListener('input', () => {
    const v = Number(input.value);
    valor.textContent = `${v}${suffix}`;
    onChange(v);
  });

  return createEl('div', { className: 'campo' }, header, input);
}
