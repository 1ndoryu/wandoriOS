/* [058A-4] Tests de la banda de selección (rubber band).
 * Cubren la matemática pura de intersección (intersectRects) y el cálculo de
 * hits (computeBandHits). La parte DOM (enableSelectionBand) se valida en
 * navegador; aquí se prueba la lógica que decide qué ítems caen dentro. */

import { describe, it, expect } from 'vitest';
import { intersectRects, computeBandHits, type Rect } from './selection-band-math';

describe('intersectRects', () => {
  const banda: Rect = { left: 10, top: 10, right: 50, bottom: 40 };

  it('detecta solapamiento parcial', () => {
    expect(intersectRects(banda, { left: 40, top: 30, right: 70, bottom: 60 })).toBe(true);
  });

  it('detecta contención (ítem dentro de la banda)', () => {
    expect(intersectRects(banda, { left: 15, top: 15, right: 30, bottom: 30 })).toBe(true);
  });

  it('detecta banda dentro del ítem', () => {
    expect(intersectRects(banda, { left: 0, top: 0, right: 100, bottom: 100 })).toBe(true);
  });

  it('detecta borde compartido como intersección (límite inclusivo)', () => {
    expect(intersectRects(banda, { left: 50, top: 10, right: 70, bottom: 40 })).toBe(true);
  });

  it('devuelve false cuando no hay solape', () => {
    expect(intersectRects(banda, { left: 60, top: 10, right: 80, bottom: 40 })).toBe(false);
    expect(intersectRects(banda, { left: 0, top: 50, right: 100, bottom: 80 })).toBe(false);
  });
});

describe('computeBandHits', () => {
  const banda: Rect = { left: 10, top: 10, right: 50, bottom: 40 };
  const items = [
    { id: 'a', rect: { left: 15, top: 15, right: 30, bottom: 30 } as Rect },
    { id: 'b', rect: { left: 40, top: 30, right: 70, bottom: 60 } as Rect },
    { id: 'c', rect: { left: 60, top: 10, right: 80, bottom: 40 } as Rect },
  ];

  it('devuelve solo los ítems que intersectan la banda', () => {
    expect(computeBandHits(banda, items)).toEqual(['a', 'b']);
  });

  it('devuelve array vacío si nada intersecta', () => {
    expect(computeBandHits({ left: 200, top: 200, right: 220, bottom: 220 }, items)).toEqual([]);
  });

  it('preserva el orden de los ítems de entrada', () => {
    const itemsReversed = [...items].reverse();
    expect(computeBandHits(banda, itemsReversed)).toEqual(['b', 'a']);
  });
});
