/* wandori.us — Resize Edge Detection & Calculation
 * Detecta qué borde de la ventana está bajo el cursor,
 * devuelve el cursor CSS apropiado y calcula bounds de resize.
 * Extraído de drag-resize.ts para cumplir límite de 150 líneas.
 */

export type ResizeEdge = 'right' | 'bottom' | 'corner' | 'left' | 'bottom-left';

/** Detectar qué borde de la ventana está bajo el cursor. */
export function detectEdge(
  e: MouseEvent,
  windowEl: HTMLElement,
  edgeSize: number,
): ResizeEdge | null {
  const rect = windowEl.getBoundingClientRect();
  /* Top edge excluded: titlebar lives there (Windows/macOS convention) */
  const onRight = e.clientX > rect.right - edgeSize;
  const onBottom = e.clientY > rect.bottom - edgeSize;
  const onLeft = e.clientX < rect.left + edgeSize;

  if (onBottom && onLeft) return 'bottom-left';
  if (onBottom && onRight) return 'corner';
  if (onRight) return 'right';
  if (onBottom) return 'bottom';
  if (onLeft) return 'left';
  return null;
}

/** Cursor CSS para el borde dado. */
export function cursorForEdge(edge: ResizeEdge | null): string {
  switch (edge) {
    case 'right': return 'ew-resize';
    case 'left': return 'ew-resize';
    case 'bottom': return 'ns-resize';
    case 'corner': return 'nwse-resize';
    case 'bottom-left': return 'nesw-resize';
    default: return '';
  }
}

/** Bounds calculados durante resize. */
export interface ResizeBounds { x: number; y: number; w: number; h: number }

/**
 * Calcular nuevos bounds basados en el edge arrastrado.
 * Lógica pura — no accede al DOM ni al store.
 */
export function calculateResizeBounds(
  edge: ResizeEdge,
  dx: number,
  dy: number,
  startLeft: number,
  startTop: number,
  startW: number,
  startH: number,
  minW: number,
  minH: number,
): ResizeBounds {
  let newX = startLeft;
  let newY = startTop;
  let newW = startW;
  let newH = startH;

  if (edge.includes('right')) newW = Math.max(minW, startW + dx);
  if (edge.includes('left')) {
    newW = Math.max(minW, startW - dx);
    newX = startLeft + (startW - newW);
  }
  if (edge === 'bottom' || edge === 'corner' || edge === 'bottom-left') {
    newH = Math.max(minH, startH + dy);
  }

  return { x: newX, y: newY, w: newW, h: newH };
}
