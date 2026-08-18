/* [028A-5] Popover de novedades (compartido desktop/móvil).
 * Reemplaza la ventana `notifications`: se abre anclado al botón que lo
 * invoca (campana del OS o control del launcher), sin crear chrome propio.
 * El estado vive en notifications-store; la lista solo lo proyecta.
 * Gotcha: el anchor debe estar en el DOM y visible en el clamp del viewport;
 * el popover se reposiciona en cada open (position fixed sobre body). */

import { Bell, createElement, RefreshCw } from 'lucide';
import { createEl } from '../../utils/dom';
import { createVacio } from '../../components/ui/empty-state';
import { getViewport } from '../../utils/viewport';
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsStore,
  type NotificationsState,
} from './notifications-store';

const POPOVER_ANCHO = 300;
const DESPLAZAMIENTO = 6;
const PADDING_UNIVERSO = 4;

export interface NotificationsPopover {
  readonly element: HTMLElement;
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
  readonly destroy: () => void;
}

/** Formato compacto de la fecha según el boceto: hoy/ayer con hora. */
function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const ayer = new Date();
  ayer.setDate(today.getDate() - 1);
  const mismaFecha = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();
  const hora = date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  if (mismaFecha(date, today)) return `hoy · ${hora}`;
  if (mismaFecha(date, ayer)) return `ayer · ${hora}`;
  return `${date.getDate()} ${date.toLocaleString('es', { month: 'short' }).replace('.', '')} · ${hora}`;
}

export function createNotificationsPopover(anchor: HTMLElement): NotificationsPopover {
  const root = createEl('div', {
    className: 'notificacionesPopover',
    role: 'dialog',
    ariaLabel: 'Novedades',
  });
  root.style.display = 'none';

  /* [028A-5] La cabecera compacta no reutiliza .boton (superficie OS); consume
   * los tokens de menú del sistema (texto 11px, trazo 1px). */
  const btnRecargar = createEl('button', {
    type: 'button',
    className: 'notificacionesPopover__recargar',
    ariaLabel: 'Recargar novedades',
  }, createElement(RefreshCw), createEl('span', { textContent: 'recargar' }));
  const cabecera = createEl('div', { className: 'notificacionesPopover__cabecera' },
    createEl('h2', { className: 'notificacionesPopover__titulo', textContent: 'Novedades' }),
    btnRecargar,
  );
  const lista = createEl('div', { className: 'notificacionesPopover__lista', role: 'list' });
  const btnMarcarTodos = createEl('button', {
    type: 'button',
    className: 'notificacionesPopover__pieBoton',
    textContent: 'marcar todo como leído',
  });
  const pie = createEl('div', { className: 'notificacionesPopover__pie' }, btnMarcarTodos);
  root.append(cabecera, lista, pie);

  /* Recargar refresca la fuente canónica (store) sin crear estado paralelo. */
  btnRecargar.addEventListener('click', () => { void loadNotifications(); });
  btnMarcarTodos.addEventListener('click', () => { markAllNotificationsRead(); });

  const renderItem = (item: NotificationsState['items'][number]): HTMLElement => {
    const clases = ['notificacionesPopover__item'];
    if (item.read) clases.push('notificacionesPopover__item--leida');
    else clases.push('notificacionesPopover__item--noLeida');
    const entry = createEl('article', {
      className: clases.join(' '),
      role: 'listitem',
    },
      createEl('span', { className: 'notificacionesPopover__icono', ariaHidden: 'true' }, createElement(Bell)),
      createEl('div', { className: 'notificacionesPopover__contenido' },
        createEl('p', { className: 'notificacionesPopover__itemTitulo', textContent: item.title }),
        createEl('p', { className: 'notificacionesPopover__itemTexto', textContent: item.body }),
        createEl('time', { className: 'notificacionesPopover__itemFecha', textContent: formatFecha(item.publishedAt) }),
      ));
    if (item.read) return entry;
    entry.tabIndex = 0;
    entry.addEventListener('click', () => markNotificationRead(item.id));
    entry.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        markNotificationRead(item.id);
      }
    });
    return entry;
  };

  const render = (state: NotificationsState): void => {
    lista.replaceChildren();
    if (state.loading) {
      lista.appendChild(createVacio('Cargando novedades…'));
      return;
    }
    if (state.error) {
      lista.appendChild(createVacio(state.error));
      return;
    }
    if (state.items.length === 0) {
      lista.appendChild(createVacio('No hay novedades.'));
      return;
    }
    for (const item of state.items.slice(0, 40)) lista.appendChild(renderItem(item));
  };

  const stop = notificationsStore.subscribeSimple(render);

  function position(): void {
    const rect = anchor.getBoundingClientRect();
    const vp = getViewport();
    const ancho = Math.min(POPOVER_ANCHO, vp.width - PADDING_UNIVERSO * 2);
    root.style.width = `${ancho}px`;
    let top = rect.bottom + DESPLAZAMIENTO;
    if (top + root.offsetHeight > vp.height - PADDING_UNIVERSO) {
      /* Abajo no cabe: colocar por encima del ancla si hay altura. */
      const arriba = rect.top - DESPLAZAMIENTO - root.offsetHeight;
      top = Math.max(PADDING_UNIVERSO, Math.min(top, arriba));
    }
    let right = vp.width - rect.right;
    right = Math.max(PADDING_UNIVERSO, Math.min(right, vp.width - ancho - PADDING_UNIVERSO));
    root.style.right = `${right}px`;
    root.style.top = `${top}px`;
  }

  let abierto = false;

  function cerrarExterior(event: MouseEvent): void {
    const objetivo = event.target as Node;
    if (root.contains(objetivo) || anchor.contains(objetivo)) return;
    close();
  }

  function onEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }

  function instalarListeners(): void {
    document.addEventListener('click', cerrarExterior, true);
    document.addEventListener('keydown', onEscape);
  }
  function retirarListeners(): void {
    document.removeEventListener('click', cerrarExterior, true);
    document.removeEventListener('keydown', onEscape);
  }

  function open(): void {
    if (abierto) return;
    abierto = true;
    document.body.appendChild(root);
    anchor.setAttribute('aria-expanded', 'true');
    position();
    root.style.display = '';
    instalarListeners();
  }

  function close(): void {
    if (!abierto) return;
    abierto = false;
    retirarListeners();
    root.style.display = 'none';
    anchor.setAttribute('aria-expanded', 'false');
    root.remove();
  }

  function toggle(): void {
    if (abierto) close();
    else open();
  }

  return {
    element: root,
    open,
    close,
    toggle,
    destroy: () => {
      close();
      stop();
      root.remove();
    },
  };
}