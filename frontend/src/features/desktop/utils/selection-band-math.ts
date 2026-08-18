/* [058A-4] Geometría pura de la banda de selección (sin DOM).
 * Extraída de selection-band.ts para mantener esa util bajo el límite de 150
 * líneas y para poder testear la intersección sin jsdom. Aquí vive toda la
 * matemática de rectángulos; el comportamiento DOM (enableSelectionBand) en
 * selection-band.ts. */

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function rectFromClientRect(r: DOMRect): Rect {
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export function intersectRects(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

/** IDs de los ítems cuyo rect intersecta la banda. Función pura para tests. */
export function computeBandHits(
  bandRect: Rect,
  items: readonly { id: string; rect: Rect }[],
): string[] {
  return items.filter(i => intersectRects(bandRect, i.rect)).map(i => i.id);
}
