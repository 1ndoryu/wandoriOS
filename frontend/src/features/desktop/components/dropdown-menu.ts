/* wandori.us — Dropdown Menu
 * Componente compartido para menús desplegables del OS.
 * Unifica la lógica de apertura/cierre, keyboard handling y positioning
 * que estaba duplicada en context-menu, menu-bar y app-toolbar.
 * [Auditoría v2] */

import { createElement, type IconNode } from 'lucide';
import { createEl } from '../../../utils/dom';
import { getViewport } from '../../../utils/viewport';
import { formatShortcut } from '../../../utils/format-shortcut';

export interface DropdownMenuItem {
  readonly icon?: IconNode;
  readonly label: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly separator?: boolean;
  readonly onClick?: () => void;
}

export interface DropdownMenuOptions {
  readonly items: readonly DropdownMenuItem[];
  readonly ariaLabel?: string;
  /** Modificador visual de la misma superficie de menú. */
  readonly className?: string;
  readonly positioning?: 'fixed' | 'absolute';
  readonly x?: number;
  readonly y?: number;
  readonly onClose?: () => void;
}

let activeDropdown: { el: HTMLElement; cleanup: () => void } | null = null;
let pendingSetup: ReturnType<typeof setTimeout> | null = null;

function closeActiveDropdown(): void {
  if (pendingSetup) {
    clearTimeout(pendingSetup);
    pendingSetup = null;
  }
  if (activeDropdown) {
    activeDropdown.cleanup();
    activeDropdown.el.remove();
    activeDropdown = null;
  }
}

function onGlobalEscape(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeActiveDropdown();
  }
}

function onGlobalClick(e: MouseEvent): void {
  if (activeDropdown && !activeDropdown.el.contains(e.target as Node)) {
    closeActiveDropdown();
  }
}

export function createDropdownItem(item: DropdownMenuItem): HTMLElement {
  if (item.separator) {
    return createEl('div', { className: 'desktop-context-menu__separator', role: 'separator' });
  }

  const el = createEl('button', { type: 'button', className: 'desktop-context-menu__item', role: 'menuitem' });

  if (item.icon) {
    const iconWrapper = createEl('span', { className: 'desktop-context-menu__icon' },
      createElement(item.icon),
    );
    el.appendChild(iconWrapper);
  }

  el.appendChild(createEl('span', { className: 'desktop-context-menu__label', textContent: item.label }));

  if (item.shortcut) {
    /* [297A-20] Atajo renderizado con glifos de tecla (Meta+Shift+l -> ⌘⇧L).
     * Para revertir: volver a textContent: item.shortcut. */
    el.appendChild(createEl('span', { className: 'desktop-context-menu__shortcut', textContent: formatShortcut(item.shortcut) }));
  }

  if (item.disabled) {
    el.classList.add('desktop-context-menu__item--disabled');
    el.setAttribute('aria-disabled', 'true');
  } else if (item.onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveDropdown();
      item.onClick!();
    });
  }

  return el;
}

export function openDropdownMenu(options: DropdownMenuOptions): HTMLElement | null {
  closeActiveDropdown();

  if (options.items.length === 0) return null;

  const menu = createEl('div', {
    className: ['desktop-context-menu', options.className].filter(Boolean).join(' '),
    role: 'menu',
  });
  if (options.ariaLabel) menu.setAttribute('aria-label', options.ariaLabel);

  for (const item of options.items) {
    menu.appendChild(createDropdownItem(item));
  }

  if (options.positioning === 'fixed') {
    menu.style.position = 'fixed';
    menu.style.left = '0';
    menu.style.top = '0';
    menu.style.zIndex = '9999';
  }

  document.body.appendChild(menu);

  if (options.positioning === 'fixed' && options.x !== undefined && options.y !== undefined) {
    const rect = menu.getBoundingClientRect();
    const taskbarH = 32;
    const vp = getViewport();
    const maxX = vp.width - rect.width - 4;
    const maxY = vp.height - rect.height - taskbarH - 4;
    menu.style.left = `${Math.max(0, Math.min(options.x, maxX))}px`;
    menu.style.top = `${Math.max(0, Math.min(options.y, maxY))}px`;
  }

  const cleanup = (): void => {
    document.removeEventListener('keydown', onGlobalEscape);
    document.removeEventListener('click', onGlobalClick);
    options.onClose?.();
  };

  activeDropdown = { el: menu, cleanup };

  pendingSetup = setTimeout(() => {
    pendingSetup = null;
    document.addEventListener('keydown', onGlobalEscape);
    document.addEventListener('click', onGlobalClick);
  }, 0);

  return menu;
}
