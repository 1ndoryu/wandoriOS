/* wandori.us — Grid Geometry for free icon placement
 * Cálculos puros y geometría del snap-grid del escritorio (297A-20).
 * Separa la lógica de celdas/colisiones del DOM para poder testearla. */

import type { GridPosition, NodeId, WorkspaceNode } from '../../runtime/workspace/types';

export type { GridPosition } from '../../runtime/workspace/types';

/** Ancho mínimo de viewport para posicionamiento libre (desktop/tablet ≥768). */
export const DESKTOP_MIN_WIDTH = 769;

/** Métricas del grid medidas desde el DOM. */
export interface GridMetrics {
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
  /** [058A-1] Gap de fila efectivo con align-content distribuido
   * (space-between/around/evenly): el navegador reparte el sobrante vertical
   * entre filas; getCellAt lo usa para que el snap-grid siga siendo exacto.
   * [018A-97 F6] El CSS real del escritorio usa align-content: START (filas
   * deterministas desde arriba): con space-between el navegador reparte entre
   * las filas MATERIALIZADAS por el contenido (cambian en cada drop) y la
   * geometría divergía. Con start este valor siempre == rowGap, pero se
   * conserva por si otro grid vuelve a distribuir. */
  readonly rowGapEffective: number;
  /** [018A-97] Gap de columna efectivo con justify-content distribuido
   * (space-between/around/evenly): el navegador reparte el sobrante horizontal
   * entre columnas. Equivalente horizontal de rowGapEffective: sin esto la
   * geometría usaba columnGap fijo y el highlight/rejilla quedaban desfasados
   * del track real cuando sobraba espacio. */
  readonly columnGapEffective: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  /** Grid en direction: rtl (col 0 = columna derecha, crece hacia la izquierda). */
  readonly rtl: boolean;
}

/* [018A-97] Ancho del track declarado del grid: con repeat(auto-fill) el
 * navegador resuelve gridTemplateColumns a longitudes ("88px 88px …"); el
 * primer track es la celda real. Se acepta solo si es px: un template con
 * minmax()/fr (o vacío en jsdom) devuelve 0 y el caller cae al primer item. */
function parseTrackWidthPx(template: string): number {
  if (!template || template === 'none') return 0;
  const first = template.trim().split(/\s+/)[0];
  if (!first?.endsWith('px')) return 0;
  const px = parseFloat(first);
  return Number.isFinite(px) && px > 0 ? px : 0;
}

/** Medir columnas, celdas y gaps del grid real (desktop/tablet). */
export function getGridMetrics(
  gridEl: HTMLElement,
  itemSelector = '.desktop-icon--interactive',
): GridMetrics {
  const rect = gridEl.getBoundingClientRect();
  const cs = getComputedStyle(gridEl);
  const columnGap = parseFloat(cs.columnGap) || 0;
  const rowGap = parseFloat(cs.rowGap) || 0;
  const template = cs.gridTemplateColumns;
  const declaredColumns = !template || template === 'none' ? 1 : template.split(' ').length;
  const first = gridEl.querySelector<HTMLElement>(itemSelector);
  /* [018A-97] Medir la celda del TRACK real del CSS grid, no del primer item:
   * el label puede cambiar el ancho del item (overflow, tema) y desacoplaba la
   * geometría del snap-grid de los tracks reales. Fallback al item solo si el
   * template no es parseable o el grid está vacío. */
  const trackWidth = parseTrackWidthPx(cs.gridTemplateColumns);
  const cellWidth = trackWidth > 0 ? trackWidth : (first ? first.getBoundingClientRect().width : 0);
  /* [297A-20] Altura de fila = grid-auto-rows (fijo) para que la geometría
   * coincida con el CSS grid real; fallback al alto del icono si no es fijo. */
  const autoRows = parseFloat(cs.gridAutoRows);
  const cellHeight = autoRows > 0 ? autoRows : (first ? first.getBoundingClientRect().height : 0);
  /* [058A-1] Columnas VISIBLES por geometría, no tracks declarados: con
   * repeat(auto-fill), un icono posicionado más allá del área visible crea un
   * track implícito que gridTemplateColumns reporta y que infla el conteo.
   * Con ese conteo el reflow creía que el icono "cabía" cuando en realidad
   * estaba fuera del viewport (el icono más a la izquierda desaparecía al
   * encoger la ventana). Fallback a tracks declarados si no hay items. */
  const columns = cellWidth > 0
    ? Math.max(1, Math.floor((rect.width + columnGap) / (cellWidth + columnGap)))
    : declaredColumns;
  const rows = Math.max(1, Math.floor((rect.height + rowGap) / (cellHeight + rowGap)));
  /* [058A-1] rowGap efectivo: con align-content space-between/around/evenly el
   * sobrante vertical se reparte entre filas; el snap-grid debe replicarlo.
   * [018A-97 F6] El escritorio usa align-content: start (no distribuye), así
   * que en producción rowGapEffective == rowGap y las filas son deterministas. */
  const distribute = /space-between|space-around|space-evenly/.test(cs.alignContent);
  const used = rows * cellHeight + (rows - 1) * rowGap;
  const extra = Math.max(0, rect.height - used);
  const rowGapEffective = distribute && rows > 1 ? rowGap + extra / (rows - 1) : rowGap;
  /* [018A-97] Distribución horizontal: mismo patrón que rowGapEffective pero
   * con justify-content (eje inline). El sobrante horizontal se reparte entre
   * columnas; la geometría (getCellAt/cellOriginAt) debe replicarlo. */
  const justifyDistribute = /space-between|space-around|space-evenly/.test(cs.justifyContent);
  const usedWidth = columns * cellWidth + (columns - 1) * columnGap;
  const extraX = Math.max(0, rect.width - usedWidth);
  const columnGapEffective = justifyDistribute && columns > 1
    ? columnGap + extraX / (columns - 1)
    : columnGap;
  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    columnGap,
    rowGap,
    rowGapEffective,
    columnGapEffective,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    rtl: cs.direction === 'rtl',
  };
}

/** [018A-97] Origen (grid-local: relativo al borde superior-izquierdo del
 * grid) de la celda (col,row), replicando la distribución real del CSS grid
 * (justify-content/align-content space-between/around/evenly y direction
 * rtl). Fuente ÚNICA de geometría de celdas: la usan getCellAt (inverso),
 * positionCellHighlight y debugGridOverlay.render. Antes cada consumidor
 * tenía su propia fórmula RTL y divergían del track real. */
export function cellOriginAt(
  col: number,
  row: number,
  metrics: GridMetrics,
): { readonly left: number; readonly top: number } {
  const gridWidth = metrics.right - metrics.left;
  const left = metrics.rtl
    ? gridWidth - (col + 1) * metrics.cellWidth - col * metrics.columnGapEffective
    : col * (metrics.cellWidth + metrics.columnGapEffective);
  const top = row * (metrics.cellHeight + metrics.rowGapEffective);
  return { left, top };
}

/** Celda snap bajo unas coordenadas de viewport, o null si cae fuera del grid. */
export function getCellAt(
  x: number,
  y: number,
  metrics: GridMetrics,
): GridPosition | null {
  const { left, right, top, cellWidth, cellHeight, rowGap, rowGapEffective, columnGapEffective, columns, rows, rtl } = metrics;
  if (cellWidth <= 0 || cellHeight <= 0) return null;
  /* [018A-97] Gap de columna EFECTIVO (inverso de cellOriginAt): con
   * justify-content space-between el sobrante se reparte y columnGap fijo
   * mapeaba la columna equivocada. */
  const col = rtl
    ? Math.floor((right - x + columnGapEffective) / (cellWidth + columnGapEffective))
    : Math.floor((x - left + columnGapEffective) / (cellWidth + columnGapEffective));
  /* [058A-1] Usar el gap de fila efectivo (distribuido) para que el mapeo
   * y→fila coincida con las filas reales cuando align-content reparte el
   * sobrante; sin esto el drop podía caer en la fila equivocada. */
  const gapRow = rowGapEffective > 0 ? rowGapEffective : rowGap;
  const row = Math.floor((y - top + gapRow) / (cellHeight + gapRow));
  if (col < 0 || row < 0 || col >= columns || row >= rows) return null;
  return { col, row };
}

/** Clave estable de una celda para ocupación. */
export function cellKey(position: GridPosition): string {
  return `${position.col},${position.row}`;
}

/** Mapa celda → nodeId para todos los nodos con posición explícita. */
export function occupiedCells(nodes: readonly WorkspaceNode[]): Map<string, NodeId> {
  const map = new Map<string, NodeId>();
  for (const node of nodes) {
    if (node.position) map.set(cellKey(node.position), node.id);
  }
  return map;
}

/** Primera celda libre desde la fila de partida; autogrow si el grid está lleno.
 * [297A-20] `avoid` excluye una celda de la búsqueda (p.ej. la celda destino
 * del icono arrastrado) para no proponer dos iconos en la misma celda. */
export function findFreeCell(
  nodes: readonly WorkspaceNode[],
  start: GridPosition,
  metrics: GridMetrics,
  avoid?: GridPosition,
): GridPosition {
  const occupied = occupiedCells(nodes);
  for (let row = start.row; row < metrics.rows; row++) {
    for (let col = 0; col < metrics.columns; col++) {
      const candidate = { col, row };
      if (avoid && candidate.col === avoid.col && candidate.row === avoid.row) continue;
      if (!occupied.has(cellKey(candidate))) return candidate;
    }
  }
  /* Grid lleno: autogrow en la fila siguiente */
  return { col: start.col, row: metrics.rows };
}

/* Colocación (planPlacement) y reflow (reflowPositions): ver icon-grid-placement.ts. */
