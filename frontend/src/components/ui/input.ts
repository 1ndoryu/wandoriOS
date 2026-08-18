/* wandori.us — Input Component
 * Campo de entrada minimalista. Solo borde inferior 1px. */

import { createEl } from '../../utils/dom';

export interface InputOptions {
  label?: string;
  type?: string;
  placeholder?: string;
  value?: string;
  required?: boolean;
  error?: string;
  onInput?: (value: string) => void;
}

export function createInput(options: InputOptions): HTMLElement {
  const { label, type = 'text', placeholder, value = '', required, error, onInput } = options;

  const children: (string | HTMLElement)[] = [];

  if (label) {
    children.push(createEl('label', { className: 'campo-etiqueta', textContent: label }));
  }

  const entrada = createEl('input', {
    className: 'campo-entrada',
    type,
    value,
    'data-transient': type === 'password' || type === 'file' ? 'false' : 'true',
  });
  if (placeholder) entrada.placeholder = placeholder;
  if (required) entrada.required = true;

  entrada.addEventListener('input', () => { onInput?.(entrada.value); });

  children.push(entrada);

  if (error) {
    children.push(createEl('span', { className: 'campo-mensaje-error', textContent: error }));
  }

  return createEl('div', { className: 'campo' + (error ? ' campo-error' : '') }, ...children);
}
