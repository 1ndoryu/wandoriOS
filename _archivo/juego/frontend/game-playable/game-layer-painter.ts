/* 138A-9 — Painter del editor de mapa: convierte pointer events del host en
 * pinceladas de celdas (máscara pintada del stack). Vive en la presentación
 * y NO decide capas ni documento: pide el pick de terreno a la escena, acumula
 * celdas dentro del radio del pincel y delega el commit en `onStroke` al
 * soltar (con commits intermedios acotados para feedback en vivo). Cuando el
 * pincel está activo consume el evento (stopImmediatePropagation) para que la
 * órbita de cámara no arranque; el teardown limpia listeners y capturas. */

import type { TerrainPick } from './game-procedural-comparator';

export interface LayerPainterCallbacks {
  /** ¿Pincel habilitado? (estado compartido panel ↔ escena). */
  readonly isActive: () => boolean;
  /** Pick de terreno bajo el puntero (raycast de la escena; null = aire). */
  readonly pickAt: (clientX: number, clientY: number) => TerrainPick | null;
  readonly cellSize: () => number;
  /** Radio del pincel en unidades de mundo (celdas alrededor del cursor). */
  readonly radius: () => number;
  /** Commit de una pincelada: `ended=false` es feedback intermedio acotado,
   *  `ended=true` cierra la sesión (pointerup/cancel). */
  readonly onStroke: (
    cells: readonly (readonly [number, number])[],
    ended: boolean,
  ) => void;
}

const INTERMEDIATE_COMMIT_MS = 120;
const MAX_SESSION_CELLS = 4096;

export function attachLayerPainter(
  host: HTMLElement,
  callbacks: LayerPainterCallbacks,
): () => void {
  let painting = false;
  let strokeCells: (readonly [number, number])[] = [];
  let lastCommit = 0;

  const cellsAt = (clientX: number, clientY: number): (readonly [number, number])[] => {
    const pick = callbacks.pickAt(clientX, clientY);
    if (!pick) return [];
    const cellSize = Math.max(callbacks.cellSize(), 0.01);
    const cellRadius = Math.max(1, Math.ceil(callbacks.radius() / cellSize));
    const cells: (readonly [number, number])[] = [];
    for (let di = -cellRadius; di <= cellRadius; di += 1) {
      for (let dj = -cellRadius; dj <= cellRadius; dj += 1) {
        const i = pick.i + di;
        const j = pick.j + dj;
        if (i < 0 || j < 0) continue;
        const worldX = pick.worldX + di * cellSize;
        const worldZ = pick.worldZ + dj * cellSize;
        if (Math.hypot(worldX - pick.worldX, worldZ - pick.worldZ) <= callbacks.radius() + 1e-6) {
          cells.push([i, j]);
        }
      }
    }
    return cells;
  };

  const commitStroke = (ended: boolean): void => {
    if (strokeCells.length === 0) return;
    callbacks.onStroke(strokeCells, ended);
    strokeCells = [];
    lastCommit = performance.now();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!callbacks.isActive()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    painting = true;
    strokeCells = [];
    lastCommit = 0;
    host.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!painting) return;
    const added = cellsAt(event.clientX, event.clientY);
    for (const cell of added) {
      if (strokeCells.length >= MAX_SESSION_CELLS) break;
      if (!strokeCells.some(candidate => candidate[0] === cell[0] && candidate[1] === cell[1])) {
        strokeCells.push(cell);
      }
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    /* Feedback en vivo: commit intermedio con la pincelada acumulada. */
    if (strokeCells.length > 0 && performance.now() - lastCommit >= INTERMEDIATE_COMMIT_MS) {
      commitStroke(false);
    }
  };

  const finishStroke = (event: PointerEvent): void => {
    if (!painting) return;
    painting = false;
    event.preventDefault();
    event.stopImmediatePropagation();
    commitStroke(true);
  };

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', finishStroke);
  host.addEventListener('pointercancel', finishStroke);

  return () => {
    host.removeEventListener('pointerdown', onPointerDown);
    host.removeEventListener('pointermove', onPointerMove);
    host.removeEventListener('pointerup', finishStroke);
    host.removeEventListener('pointercancel', finishStroke);
    painting = false;
    strokeCells = [];
  };
}
