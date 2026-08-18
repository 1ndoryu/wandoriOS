/* wandori.us — Selection Store
 * Estado de selección de objetos del escritorio y del Finder.
 * [Plan §3] Selección, activación y foco.
 * Clic selecciona; Ctrl alterna; Shift extiende rango.
 * Foco de teclado, selección de objetos y ventana activa son estados distintos.
 * [018A-95] La selección se escala por superficie (source): el grid del
 * escritorio y el Finder comparten store pero cada uno refleja solo su propia
 * selección. Antes, con el Finder en la raíz (mismos node-ids que el
 * escritorio), seleccionar un ítem en el explorador marcaba el mismo objeto
 * en el escritorio. Los comandos siguen leyendo la selección global como
 * fallback sin targets (copiar/cortar por teclado). */

import { createStore, type Store } from '../../store';

/** Superficie que puede originar una selección de objetos. */
export type SelectionSource = 'desktop' | 'finder';

export interface SelectionState {
  /** IDs de los objetos seleccionados. */
  readonly selectedIds: readonly string[];
  /** ID del último seleccionado (para extender rango con Shift). */
  readonly lastSelectedId: string | null;
  /** Si la selección es del workspace vacío (no un objeto). */
  readonly isBackground: boolean;
  /** Superficie que originó la selección; null = sin selección activa. */
  readonly source: SelectionSource | null;
}

const initialState: SelectionState = {
  selectedIds: [],
  lastSelectedId: null,
  isBackground: false,
  source: null,
};

export const selectionStore: Store<SelectionState> = createStore(initialState);

/** Seleccionar un solo objeto (reemplaza selección) en la superficie dada. */
export function selectSingle(id: string, source: SelectionSource): void {
  selectionStore.set({
    selectedIds: [id],
    lastSelectedId: id,
    isBackground: false,
    source,
  });
}

/** Alternar selección de un objeto (Ctrl/Cmd + clic) en la superficie dada. */
export function toggleSelect(id: string, source: SelectionSource): void {
  const current = selectionStore.get();
  const isSelected = current.selectedIds.includes(id);
  const newIds = isSelected
    ? current.selectedIds.filter(i => i !== id)
    : [...current.selectedIds, id];
  selectionStore.set({
    selectedIds: newIds,
    lastSelectedId: id,
    isBackground: false,
    source,
  });
}

/** Reemplazar (o ampliar si additive) la selección por un conjunto de ids.
 * [058A-4] Lo usa la banda de selección (rubber band) al soltar: sin Ctrl
 * reemplaza la selección con los ítems intersectados; con Ctrl/Cmd los suma a
 * la selección actual. lastSelectedId queda en el último id para que Shift
 * pueda extender desde ahí. */
export function selectMany(
  ids: readonly string[],
  source: SelectionSource,
  opts: { additive?: boolean } = {},
): void {
  const current = selectionStore.get();
  const merged = opts.additive
    ? Array.from(new Set([...current.selectedIds, ...ids]))
    : [...ids];
  selectionStore.set({
    selectedIds: merged,
    lastSelectedId: ids.length > 0 ? ids[ids.length - 1] : current.lastSelectedId,
    isBackground: false,
    source,
  });
}

/** Extender selección desde el último seleccionado hasta el actual (Shift + clic).
 * idsInOrder = array ordenado de IDs visibles en el contenedor actual. */
export function extendSelect(id: string, idsInOrder: readonly string[], source: SelectionSource): void {
  const current = selectionStore.get();
  const anchor = current.lastSelectedId;
  if (!anchor || !idsInOrder.includes(anchor)) {
    selectSingle(id, source);
    return;
  }
  const startIdx = idsInOrder.indexOf(anchor);
  const endIdx = idsInOrder.indexOf(id);
  if (startIdx < 0 || endIdx < 0) {
    selectSingle(id, source);
    return;
  }
  const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
  const rangeIds = idsInOrder.slice(from, to + 1);
  selectionStore.set({
    selectedIds: rangeIds,
    lastSelectedId: id,
    isBackground: false,
    source,
  });
}

/** Limpiar selección (clic en vacío o Escape). */
export function clearSelection(): void {
  selectionStore.set(initialState);
}

/** Marcar que se hizo clic en el fondo de una superficie. */
export function selectBackground(source: SelectionSource): void {
  selectionStore.set({
    selectedIds: [],
    lastSelectedId: null,
    isBackground: true,
    source,
  });
}

/** Verificar si un objeto está seleccionado en la superficie dada.
 * [018A-95] El source evita que la selección de una superficie se refleje en
 * otra que muestre los mismos node-ids (Finder en la raíz vs escritorio). */
export function isSelected(id: string, source: SelectionSource): boolean {
  const state = selectionStore.get();
  return state.source === source && state.selectedIds.includes(id);
}

/** Obtener IDs seleccionados (independiente de la superficie que los originó).
 * Úsalo solo como fallback de comandos sin targets (copiar/cortar por teclado). */
export function getSelectedIds(): readonly string[] {
  return selectionStore.get().selectedIds;
}
