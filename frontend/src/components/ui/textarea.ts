/* wandori.us — Textarea Component
 * Area de texto minimalista. B&W. */

import { createEl } from '../../utils/dom';

export interface TextareaOptions {
  label?: string;
  placeholder?: string;
  value?: string;
  rows?: number;
  onInput?: (value: string) => void;
}

export function createTextarea(options: TextareaOptions): HTMLElement {
  const { label, placeholder, value = '', rows = 5, onInput } = options;

  const children: (string | HTMLElement)[] = [];

  if (label) {
    children.push(createEl('label', { className: 'campo-etiqueta', textContent: label }));
  }

  const textarea = createEl('textarea', {
    className: 'campo-textarea',
    value,
    rows: String(rows),
    'data-transient': 'true',
  });
  if (placeholder) textarea.placeholder = placeholder;

  textarea.addEventListener('input', () => { onInput?.(textarea.value); });

  children.push(textarea);

  return createEl('div', { className: 'campo' }, ...children);
}
