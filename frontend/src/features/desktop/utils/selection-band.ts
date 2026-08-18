/* [058A-4] Banda de selección múltiple (rubber band) estilo Windows.
 * Arrastrar un rectángulo desde el fondo de un contenedor (grid del escritorio
 * o del Finder) selecciona los ítems que intersecta. El feedback provisional
 * (clase --banded) se aplica sobre los elementos SIN tocar el store; al soltar,
 * onApply decide la selección definitiva (aditiva con Ctrl/Cmd). La
 * intersección se calcula en coordenadas de viewport para que scroll o
 * transforms no rompan la matemática.
 * Gotcha: el contenedor debe tener position:relative (la banda es absolute);
 * un clic simple sobre el fondo sin arrastre llama onApply([], false), que el
 * caller traduce a "limpiar selección" (igual que Windows). */

import { createEl } from '../../../utils/dom';
import { rectFromClientRect, intersectRects, computeBandHits } from './selection-band-math';

export type { Rect } from './selection-band-math';

export interface BandItem {
  id: string;
  el: HTMLElement;
}

export interface SelectionBandOptions {
  container: HTMLElement;
  /** Ítems seleccionables actuales (id + elemento). Se consulta en cada
   * movimiento y al soltar, nunca se cachea: el grid puede haber cambiado. */
  getItems: () => readonly BandItem[];
  /** Aplica la selección final al store. additive = Ctrl/Cmd durante el gesto. */
  onApply: (ids: readonly string[], additive: boolean) => void;
  /** Clase de la banda (absolute, pintada por CSS con tokens del sistema). */
  bandClass?: string;
  /** Clase provisional en ítems intersectados durante el arrastre. */
  itemFeedbackClass?: string;
}

/** Distancia mínima (px) de arrastre para considerar que hubo banda y no un
 * clic simple sobre el fondo. */
const MOVE_THRESHOLD_PX = 4;

export function enableSelectionBand(options: SelectionBandOptions): () => void {
  const {
    container,
    getItems,
    onApply,
    bandClass = 'desktop-selection-band',
    itemFeedbackClass,
  } = options;

  let bandEl: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let additive = false;
  let moved = false;
  let active = false;
  let currentHits = new Set<HTMLElement>();
  let removeWindowListeners: (() => void) | null = null;

  const applyFeedback = (els: readonly HTMLElement[]): void => {
    if (!itemFeedbackClass) return;
    const next = new Set(els);
    for (const el of currentHits) {
      if (!next.has(el)) el.classList.remove(itemFeedbackClass);
    }
    for (const el of next) {
      if (!currentHits.has(el)) el.classList.add(itemFeedbackClass);
    }
    currentHits = next;
  };

  const clearFeedback = (): void => {
    if (!itemFeedbackClass) return;
    for (const el of currentHits) el.classList.remove(itemFeedbackClass);
    currentHits = new Set();
  };

  const updateBand = (clientX: number, clientY: number): void => {
    if (!bandEl) return;
    const containerRect = container.getBoundingClientRect();
    /* [058A-4 fix] La banda se recorta al área del contenedor. Sin recorte, al
     * arrastrar más allá de los bordes creaba scrollable overflow en el scroll
     * container del Finder (.desktop-window__body con overflow:auto), lo que
     * activaba las barras de scroll vertical y horizontal del explorador. En
     * Windows la banda también se recorta a la ventana. clientWidth/Height =
     * tamaño del padding box (el área visible del grid). */
    const maxX = container.clientWidth;
    const maxY = container.clientHeight;
    const x1 = Math.max(0, Math.min(startX, clientX) - containerRect.left);
    const y1 = Math.max(0, Math.min(startY, clientY) - containerRect.top);
    const x2 = Math.min(maxX, Math.max(startX, clientX) - containerRect.left);
    const y2 = Math.min(maxY, Math.max(startY, clientY) - containerRect.top);
    bandEl.style.left = `${x1}px`;
    bandEl.style.top = `${y1}px`;
    bandEl.style.width = `${Math.max(0, x2 - x1)}px`;
    bandEl.style.height = `${Math.max(0, y2 - y1)}px`;

    const band = rectFromClientRect(bandEl.getBoundingClientRect());
    const hits = getItems()
      .filter(i => intersectRects(band, rectFromClientRect(i.el.getBoundingClientRect())))
      .map(i => i.el);
    applyFeedback(hits);
  };

  const onPointerMove = (e: PointerEvent): void => {
    if (!active) return;
    /* [058A-4 fix] Suprime el gesto nativo de scroll mientras se arrastra la
     * banda (la pulsación prolongada sobre el fondo no debe desplazar el
     * scroll container del Finder). */
    e.preventDefault();
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < MOVE_THRESHOLD_PX) {
      return;
    }
    moved = true;
    updateBand(e.clientX, e.clientY);
  };

  const onPointerUp = (): void => {
    if (!active) return;
    active = false;
    removeWindowListeners?.();
    removeWindowListeners = null;

    if (!moved) {
      /* Clic simple sobre el fondo: sin banda, se limpia la selección. */
      clearFeedback();
      bandEl?.remove();
      bandEl = null;
      onApply([], false);
      return;
    }

    /* Calcular hits ANTES de remover la banda (necesitamos su rect final). */
    let hitIds: string[] = [];
    if (bandEl) {
      const band = rectFromClientRect(bandEl.getBoundingClientRect());
      const items = getItems();
      hitIds = computeBandHits(
        band,
        items.map(i => ({ id: i.id, rect: rectFromClientRect(i.el.getBoundingClientRect()) })),
      );
      bandEl.remove();
      bandEl = null;
    }
    clearFeedback();
    onApply(hitIds, additive);
  };

  const onPointerDown = (e: PointerEvent): void => {
    /* Solo el fondo del contenedor inicia la banda; los ítems gestionan su
     * propio mousedown/pointerdown y son hijos, así que target !== container. */
    if (e.button !== 0 || e.target !== container) return;
    e.preventDefault();
    active = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    additive = e.ctrlKey || e.metaKey;
    bandEl = createEl('div', { className: bandClass });
    container.appendChild(bandEl);
    bandEl.style.left = '0px';
    bandEl.style.top = '0px';
    bandEl.style.width = '0px';
    bandEl.style.height = '0px';

    const onMove = (ev: PointerEvent): void => onPointerMove(ev);
    const onUp = (): void => onPointerUp();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    removeWindowListeners = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  };

  container.addEventListener('pointerdown', onPointerDown);

  return () => {
    container.removeEventListener('pointerdown', onPointerDown);
    if (active) {
      active = false;
      removeWindowListeners?.();
      removeWindowListeners = null;
    }
    clearFeedback();
    bandEl?.remove();
    bandEl = null;
  };
}
