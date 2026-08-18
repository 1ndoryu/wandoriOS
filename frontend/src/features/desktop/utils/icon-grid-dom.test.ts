/* wandori.us — Icon Grid DOM Geometry Tests
 * [018A-97] La geometría del snap-grid debe replicar el layout real del CSS
 * grid: justify-content space-between reparte el sobrante horizontal entre
 * columnas (columnGapEffective) y direction: rtl invierte el eje. jsdom no
 * calcula CSS grid, así que se simula el layout real con stubs de
 * getBoundingClientRect/getComputedStyle y se verifica que cellOriginAt
 * (fuente única) coincide con los tracks y que getCellAt es su inverso.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getGridMetrics, getCellAt, cellOriginAt } from './icon-grid';
import { positionCellHighlight, type HighlightSession } from './icon-reorder';

const CELL = 88;
const CELL_H = 64;
const GAP = 16;
const ROW_GAP = 24;
const GRID_LEFT = 100;
const GRID_TOP = 50;

interface StubCss {
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
function mountGrid(width: number, height: number, opts: Partial<StubCss> = {}, iconWidth = CELL): HTMLElement {
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

describe('getGridMetrics — track real y columnGapEffective', () => {
  it('debe medir la celda del TRACK declarado, no del primer item', () => {
    /* El template resuelto dice 88px aunque el item simule 100px: la
     * geometría debe salir del track, no del ancho del item. */
    const grid = mountGrid(4 * CELL + 3 * GAP, 3 * CELL_H + 2 * ROW_GAP, {}, 100);
    const metrics = getGridMetrics(grid);
    expect(metrics.cellWidth).toBe(CELL);
    expect(metrics.columns).toBe(4);
  });

  it('sin sobrante horizontal: columnGapEffective = columnGap', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP, 3 * CELL_H + 2 * ROW_GAP);
    const metrics = getGridMetrics(grid);
    expect(metrics.columns).toBe(4);
    expect(metrics.columnGapEffective).toBe(GAP);
    expect(metrics.rowGapEffective).toBe(ROW_GAP);
  });

  it('con sobrante horizontal: columnGapEffective reparte el extra entre columnas', () => {
    /* 424 = 4*88 + 3*16 + 24px de sobrante → cada gap crece 24/3 = 8px. */
    const grid = mountGrid(4 * CELL + 3 * GAP + 24, 3 * CELL_H + 2 * ROW_GAP);
    const metrics = getGridMetrics(grid);
    expect(metrics.columns).toBe(4);
    expect(metrics.columnGapEffective).toBe(GAP + 8);
  });

  it('[018A-97 F6] con sobrante VERTICAL y align-content: start, rowGapEffective = rowGap (filas deterministas)', () => {
    /* Antes (space-between) el navegador repartía el sobrante vertical entre
     * las filas materializadas por el contenido (cambian en cada drop) y la
     * fila real quedaba hasta ~675px de donde predecía la geometría. Con start
     * las filas arrancan desde arriba: row * (cellHeight + rowGap). */
    const grid = mountGrid(4 * CELL + 3 * GAP, 3 * CELL_H + 2 * ROW_GAP + 400);
    const metrics = getGridMetrics(grid);
    expect(metrics.rowGapEffective).toBe(ROW_GAP);
    expect(cellOriginAt(0, 2, metrics).top).toBe(2 * (CELL_H + ROW_GAP));
  });
});

describe('cellOriginAt — fuente única de geometría (LTR)', () => {
  it('debe coincidir con los tracks reales con sobrante distribuido', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP + 24, 3 * CELL_H + 2 * ROW_GAP);
    const metrics = getGridMetrics(grid);
    const origin0 = cellOriginAt(0, 0, metrics);
    expect(origin0).toEqual({ left: 0, top: 0 });
    const origin1 = cellOriginAt(1, 0, metrics);
    /* Track 1 empieza tras celda 0 + gap efectivo (16+8). */
    expect(origin1.left).toBe(CELL + GAP + 8);
    expect(origin1.top).toBe(0);
  });
});

describe('cellOriginAt — RTL (col 0 a la derecha)', () => {
  it('debe crecer hacia la izquierda con el gap efectivo', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP + 24, 3 * CELL_H + 2 * ROW_GAP, { direction: 'rtl' });
    const metrics = getGridMetrics(grid);
    expect(metrics.rtl).toBe(true);
    const width = 4 * CELL + 3 * GAP + 24;
    const gapEff = GAP + 8;
    expect(cellOriginAt(0, 0, metrics).left).toBe(width - CELL);
    expect(cellOriginAt(1, 0, metrics).left).toBe(width - 2 * CELL - gapEff);
    expect(cellOriginAt(3, 0, metrics).left).toBe(width - 4 * CELL - 3 * gapEff);
  });
});

describe('getCellAt — inverso de cellOriginAt', () => {
  it('LTR: el punto dentro de una celda mapea a esa columna con sobrante', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP + 24, 3 * CELL_H + 2 * ROW_GAP);
    const metrics = getGridMetrics(grid);
    /* Col 1 empieza en x local 88+24=112 → viewport 212. */
    expect(getCellAt(GRID_LEFT + 112 + 40, GRID_TOP + 10, metrics)).toEqual({ col: 1, row: 0 });
    expect(getCellAt(GRID_LEFT + 10, GRID_TOP + 10, metrics)).toEqual({ col: 0, row: 0 });
  });

  it('RTL: el punto a la derecha mapea a la col 0 (derecha del grid)', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP + 24, 3 * CELL_H + 2 * ROW_GAP, { direction: 'rtl' });
    const metrics = getGridMetrics(grid);
    const width = 4 * CELL + 3 * GAP + 24;
    const gapEff = GAP + 8;
    /* Col 0 (derecha) ocupa x local [width-88, width]. */
    expect(getCellAt(GRID_LEFT + width - 40, GRID_TOP + 10, metrics)).toEqual({ col: 0, row: 0 });
    /* Col 1 empieza en width - 2*88 - gapEff. */
    expect(getCellAt(GRID_LEFT + width - 2 * CELL - gapEff + 40, GRID_TOP + 10, metrics))
      .toEqual({ col: 1, row: 0 });
  });

  it('debe devolver null fuera de los límites del grid', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP, 3 * CELL_H + 2 * ROW_GAP);
    const metrics = getGridMetrics(grid);
    /* La fórmula heredada admite un margen de un gap antes de salir del grid
     * (el +gap del numerador); fuera de ese margen devuelve null. */
    expect(getCellAt(GRID_LEFT - GAP - 1, GRID_TOP + 10, metrics)).toBeNull();
    expect(getCellAt(GRID_LEFT + 4 * CELL + 3 * GAP + GAP + 1, GRID_TOP + 10, metrics)).toBeNull();
  });
});

describe('positionCellHighlight — highlight alineado con la celda real', () => {
  it('debe posicionar el highlight en el origen del track (LTR, con sobrante)', () => {
    const grid = mountGrid(4 * CELL + 3 * GAP + 24, 3 * CELL_H + 2 * ROW_GAP);
    const metrics = getGridMetrics(grid);
    const session: HighlightSession = {
      gridEl: grid,
      itemSelector: '.desktop-icon--interactive',
      placement: true,
      highlightEl: null,
      currentTarget: null,
    };
    positionCellHighlight({ col: 1, row: 0 }, metrics, session);
    const hl = session.highlightEl!;
    expect(hl.style.left).toBe(`${CELL + GAP + 8}px`);
    expect(hl.style.top).toBe('0px');
    expect(hl.style.width).toBe(`${CELL}px`);
  });
});
