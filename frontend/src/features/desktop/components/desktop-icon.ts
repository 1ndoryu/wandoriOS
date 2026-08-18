import { createElement, type IconNode } from 'lucide';
import { createEl } from '../../../utils/dom';

export type DesktopIconType = 'folder' | 'document' | 'application';

export interface DesktopIconOptions {
  label: string;
  type: DesktopIconType;
  selected?: boolean;
  lucideIcon: IconNode;
  onActivate?: () => void;
}

/* [297A-2] Cada objeto conserva su tipo semántico, pero usa nodos oficiales de Lucide
 * para mantener una gramática monocroma uniforme; la activación llegará con el registro de apps. */
export function createDesktopIcon(options: DesktopIconOptions): HTMLElement {
  const onActivate = options.onActivate;
  const icon = onActivate
    ? createEl('button', { type: 'button', className: 'desktop-icon desktop-icon--interactive' })
    : createEl('div', { className: 'desktop-icon' });
  icon.setAttribute('aria-label', options.label);

  if (onActivate && icon instanceof HTMLButtonElement) {
    icon.addEventListener('click', onActivate);
  }

  if (options.selected) {
    icon.classList.add('desktop-icon--selected');
  }

  const pictogram = createEl('span', {
    className: `desktop-icon__pictogram desktop-icon__pictogram--${options.type} desktop-icon__pictogram--lucide`,
    ariaHidden: 'true',
  }, createElement(options.lucideIcon));

  const label = createEl('span', { className: 'desktop-icon__label', textContent: options.label });

  icon.append(pictogram, label);
  return icon;
}
