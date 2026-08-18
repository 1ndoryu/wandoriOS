/* wandori.us — Barra de pestañas (universal)
 * Componente autocontenido para navegación por tabs en apps (Admin y futuras).
 * [317A-1] El estado activo se resuelve con clase + aria-selected; el consumidor
 * NO añade utilidades externas (flex-fila/gap/mb/border): el componente posee su
 * propio layout para que ninguna app dependa del padding/margin del contenedor.
 * Patrón: role=tablist + role=tab + aria-selected (accesible por teclado nativo). */

import { createEl } from '../../utils/dom';

export interface TabDef {
  /** ID estable; se entrega en onSwitch y distingue la pestaña activa. */
  id: string;
  /** Etiqueta visible. */
  label: string;
}

export interface TabsOptions {
  tabs: TabDef[];
  /** Tab activo inicial (por defecto el primero). */
  initial?: string;
  /** Callback al cambiar de tab (recibe el id activo). Se dispara también al inicializar. */
  onSwitch?: (id: string) => void;
}

export interface TabBar {
  /** Elemento raíz de la barra (role=tablist). */
  el: HTMLElement;
  /** Cambiar de tab programáticamente (actualiza estado y dispara onSwitch). */
  select: (id: string) => void;
  /** Tab activo actual ('' si no hay ninguno). */
  getActive: () => string;
}

export function createTabs(options: TabsOptions): TabBar {
  const { tabs, initial, onSwitch } = options;
  const buttons = new Map<string, HTMLButtonElement>();

  const bar = createEl('div', { className: 'barra-tabs', role: 'tablist' });

  function select(id: string): void {
    for (const def of tabs) {
      const btn = buttons.get(def.id);
      if (!btn) continue;
      const active = def.id === id;
      btn.classList.toggle('barra-tabs__tab--activa', active);
      btn.setAttribute('aria-selected', String(active));
    }
    onSwitch?.(id);
  }

  for (const def of tabs) {
    const btn = createEl('button', {
      className: 'barra-tabs__tab boton',
      textContent: def.label,
      role: 'tab',
    }) as HTMLButtonElement;
    btn.setAttribute('aria-selected', 'false');
    btn.addEventListener('click', () => select(def.id));
    buttons.set(def.id, btn);
    bar.appendChild(btn);
  }

  select(initial ?? tabs[0]?.id ?? '');

  return {
    el: bar,
    select,
    getActive: () => {
      for (const def of tabs) {
        if (buttons.get(def.id)?.classList.contains('barra-tabs__tab--activa')) return def.id;
      }
      return '';
    },
  };
}
