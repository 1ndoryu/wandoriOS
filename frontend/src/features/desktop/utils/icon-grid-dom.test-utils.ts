/* wandori.us — Icon Grid DOM test utils
 * [018A-97] Helpers compartidos de los tests de geometría del snap-grid:
 * simulan el layout CSS grid real (jsdom no calcula CSS grid). Extraídos de
 * icon-grid-dom.test.ts para respetar el limite de lineas por archivo. */

import { afterEach, vi } from 'vitest';

export const CELL = 88;
export const CELL_H = 64;
export const GAP = 16;
export const ROW_GAP = 24;
export const GRID_LEFT = 100;
export const GRID_TOP = 50;

export interface StubCss {
  columnGap: string;
  rowGap: string;
  gridTemplateColumns: string;
  gridAutoRows: string;
  alignContent: string;
  justifyContent: string;
  direction: string;
}

function rectOf(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    x: left, y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Monta un grid con layout simulado (track auto-fill + distribución).
 * El stub de getBoundingClientRect/getComputedStyle ES la verdad de
 * referencia: jsdom no calcula CSS grid, así que el layout se simula. */
export function mountGrid(
  width: number,
  height: number,
  opts: Partial<StubCss> = {},
  iconWidth = CELL,
): HTMLElement {
  const grid = document.createElement('div');
  grid.style.position = 'absolute';
  grid.style.width = `${width}px`;
  grid.style.height = `${height}px`;
  const icon = document.createElement('div');
  icon.className = 'desktop-icon--interactive';
  grid.appendChild(icon);
  document.body.appendChild(grid);

  vi.spyOn(grid, 'getBoundingClientRect').mockReturnValue(
    rectOf(GRID_LEFT, GRID_TOP, width, height),
  );
  vi.spyOn(icon, 'getBoundingClientRect').mockReturnValue(
    rectOf(GRID_LEFT, GRID_TOP, iconWidth, CELL_H),
  );

  const css: StubCss = {
    columnGap: `${GAP}px`,
    rowGap: `${ROW_GAP}px`,
    gridTemplateColumns: `${CELL}px ${CELL}px ${CELL}px ${CELL}px`,
    gridAutoRows: `${CELL_H}px`,
    /* [018A-97 F6] El CSS real usa align-content: start (filas deterministas
     * desde arriba): con space-between el navegador reparte el sobrante entre
     * las filas materializadas por el CONTENIDO y la geometría JS divergía. */
    alignContent: 'start',
    justifyContent: 'space-between',
    direction: 'ltr',
    ...opts,
  };
  vi.spyOn(window, 'getComputedStyle').mockReturnValue(css as unknown as CSSStyleDeclaration);
  return grid;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});
