/* wandori.us — Drag & Resize
 * Patrón estándar: pointerdown inicia, document-level pointermove/pointerup terminan.
 * Lógica de cálculo en resize-edges.ts; detección de cursor en resize-edges.ts. */

import { updateWindowBounds, focusWindow, clampWindowBounds } from '../../runtime/window-manager';
import { CommandRegistry } from '../../runtime/command-registry';
import { detectEdge, cursorForEdge, calculateResizeBounds, type ResizeEdge } from './resize-edges';

export interface DragResizeOptions {
  windowEl: HTMLElement;
  instanceId: string;
  dragHandle: HTMLElement;
  resizable: boolean;
}

interface ActiveDrag { startX: number; startY: number; startLeft: number; startTop: number; }
interface ActiveResize { edge: ResizeEdge; startX: number; startY: number; startLeft: number; startTop: number; startW: number; startH: number; }

/** Activa drag y resize en una ventana. Devuelve cleanup. */
export function enableDragResize(opts: DragResizeOptions): () => void {
  const { windowEl, instanceId, dragHandle, resizable } = opts;
  let drag: ActiveDrag | null = null;
  let resize: ActiveResize | null = null;
  const MIN_W = 200;
  const MIN_H = 150;
  const EDGE_SIZE = 4;

  function onTitleBarDblClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).closest('button')) return;
    focusWindow(instanceId);
    void CommandRegistry.execute('window:maximize', {
      targets: [{ id: instanceId, kind: 'window' }],
    });
  }

  function onDragPointerDown(e: PointerEvent): void {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    drag = { startX: e.clientX, startY: e.clientY, startLeft: windowEl.offsetLeft, startTop: windowEl.offsetTop };
    focusWindow(instanceId);
  }

  function onResizePointerDown(e: PointerEvent, edge: ResizeEdge): void {
    e.preventDefault();
    e.stopPropagation();
    resize = {
      edge, startX: e.clientX, startY: e.clientY,
      startLeft: windowEl.offsetLeft, startTop: windowEl.offsetTop,
      startW: windowEl.offsetWidth, startH: windowEl.offsetHeight,
    };
    focusWindow(instanceId);
  }

  function onDocumentPointerMove(e: PointerEvent): void {
    if (drag) {
      const clamped = clampWindowBounds(
        drag.startLeft + e.clientX - drag.startX,
        drag.startTop + e.clientY - drag.startY,
        windowEl.offsetWidth, windowEl.offsetHeight,
      );
      windowEl.style.setProperty('--win-x', `${clamped.x}px`);
      windowEl.style.setProperty('--win-y', `${clamped.y}px`);
      return;
    }
    if (resize) {
      const raw = calculateResizeBounds(
        resize.edge, e.clientX - resize.startX, e.clientY - resize.startY,
        resize.startLeft, resize.startTop, resize.startW, resize.startH,
        MIN_W, MIN_H,
      );
      const c = clampWindowBounds(raw.x, raw.y, raw.w, raw.h);
      windowEl.style.setProperty('--win-x', `${c.x}px`);
      windowEl.style.setProperty('--win-y', `${c.y}px`);
      windowEl.style.setProperty('--win-w', `${c.w}px`);
      windowEl.style.setProperty('--win-h', `${c.h}px`);
    }
  }

  function onDocumentPointerUp(): void {
    if (drag) { drag = null; commitBounds(); }
    if (resize) { resize = null; commitBounds(); }
  }

  function onMouseMove(e: MouseEvent): void {
    if (drag || resize) return;
    if (!resizable) { windowEl.style.cursor = ''; return; }
    windowEl.style.cursor = cursorForEdge(detectEdge(e, windowEl, EDGE_SIZE));
  }

  function onMouseDown(e: MouseEvent): void {
    if (!resizable) return;
    if (dragHandle.contains(e.target as Node)) return;
    const edge = detectEdge(e, windowEl, EDGE_SIZE);
    if (edge) onResizePointerDown(e as unknown as PointerEvent, edge);
  }

  function onMouseLeave(): void {
    if (!drag && !resize) windowEl.style.cursor = '';
  }

  function commitBounds(): void {
    const cs = getComputedStyle(windowEl);
    const g = (v: string) => parseInt(cs.getPropertyValue(v), 10) || 0;
    updateWindowBounds(instanceId, {
      x: g('--win-x'), y: g('--win-y'), w: g('--win-w'), h: g('--win-h'),
    });
  }

  dragHandle.addEventListener('dblclick', onTitleBarDblClick);
  dragHandle.addEventListener('pointerdown', onDragPointerDown);
  document.addEventListener('pointermove', onDocumentPointerMove);
  document.addEventListener('pointerup', onDocumentPointerUp);
  if (resizable) {
    windowEl.addEventListener('mousemove', onMouseMove);
    windowEl.addEventListener('mousedown', onMouseDown);
    windowEl.addEventListener('mouseleave', onMouseLeave);
  }

  return () => {
    dragHandle.removeEventListener('dblclick', onTitleBarDblClick);
    dragHandle.removeEventListener('pointerdown', onDragPointerDown);
    document.removeEventListener('pointermove', onDocumentPointerMove);
    document.removeEventListener('pointerup', onDocumentPointerUp);
    if (resizable) {
      windowEl.removeEventListener('mousemove', onMouseMove);
      windowEl.removeEventListener('mousedown', onMouseDown);
      windowEl.removeEventListener('mouseleave', onMouseLeave);
    }
  };
}
