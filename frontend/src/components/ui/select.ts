/* wandori.us — Select Component (dropdown nativo del OS)
 * [018A-82] Selector propio del OS en lugar del <select> del navegador, que
 * renderizaba el control nativo del browser (violación de identidad visual:
 * no consumía tokens del OS y no se detectó antes porque no había validación
 * visual sobre los editores con campos). Reutiliza el patrón del menú
 * contextual (.desktop-context-menu): botón de campo con flecha token +
 * panel flotante B&W con hover inverso.
 * Misma API que el componente previo ({ label, options, value, onChange })
 * para no tocar consumidores (article/project/product editors).
 * Accesibilidad: role="listbox"/"option", aria-haspopup/expanded, teclado
 * (flechas mueven, Enter/Space selecciona, Escape cierra y devuelve el foco).
 * Gotcha: si el menú queda abierto al destruir la app, los listeners de
 * document se limpian en el siguiente click fuera (closeMenu). */

import { createEl } from '../../utils/dom';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectOptions {
  label?: string;
  options: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
}

export function createSelect(options: SelectOptions): HTMLElement {
  const { label, options: items, value, onChange } = options;

  const initial = (items.some(item => item.value === value) ? value : items[0]?.value) ?? '';
  let selected = initial;
  let open = false;

  const wrapper = createEl('div', { className: 'campo-select__wrapper' });

  const button = createEl('button', {
    type: 'button',
    className: 'campo-select',
    'data-transient': 'true',
    ariaHaspopup: 'listbox',
    ariaExpanded: 'false',
  });

  const menu = createEl('div', {
    className: 'desktop-context-menu campo-select__menu',
    role: 'listbox',
    ariaLabel: label,
  });
  menu.hidden = true;

  const optionEls = new Map<string, HTMLElement>();
  for (const item of items) {
    const opt = createEl('div', {
      className: 'desktop-context-menu__item',
      role: 'option',
      textContent: item.label,
    });
    opt.tabIndex = -1;
    opt.dataset.value = item.value;
    opt.setAttribute('aria-selected', item.value === selected ? 'true' : 'false');
    opt.addEventListener('click', (event) => {
      event.stopPropagation();
      choose(item.value);
    });
    optionEls.set(item.value, opt);
    menu.appendChild(opt);
  }

  function renderSelection(): void {
    const item = items.find(i => i.value === selected);
    button.textContent = item?.label ?? '';
    for (const [value, opt] of optionEls) {
      const isSelected = value === selected;
      opt.classList.toggle('desktop-context-menu__item--selected', isSelected);
      opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    }
  }

  function openMenu(): void {
    open = true;
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick);
    document.addEventListener('keydown', onKeyDown);
    optionEls.get(selected)?.focus();
  }

  function closeMenu(): void {
    open = false;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onOutsideClick(event: MouseEvent): void {
    if (!wrapper.contains(event.target as Node)) closeMenu();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      button.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const values = items.map(item => item.value);
      const idx = values.indexOf(selected);
      const next = (idx + (event.key === 'ArrowDown' ? 1 : -1) + values.length) % values.length;
      moveSelection(values[next]);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(selected);
    }
  }

  function moveSelection(value: string): void {
    selected = value;
    renderSelection();
    optionEls.get(selected)?.focus();
  }

  function choose(value: string): void {
    selected = value;
    renderSelection();
    closeMenu();
    onChange?.(value);
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (open) closeMenu();
    else openMenu();
  });

  renderSelection();
  wrapper.append(button, menu);

  const children: (string | HTMLElement)[] = [];
  if (label) {
    children.push(createEl('label', { className: 'campo-etiqueta', textContent: label }));
  }
  children.push(wrapper);

  return createEl('div', { className: 'campo' }, ...children);
}
