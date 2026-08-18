/* wandori.us — Transient Presentation State
 * Conserva estado efímero al desmontar y reinstanciar una vista por cambio de
 * presentación. No usa URL, localStorage ni backend: no es estado de negocio.
 * [297A-12] Excluye secretos y archivos por diseño. */

export interface TransientStateKey {
  readonly appId: string;
  readonly params?: Readonly<Record<string, string>>;
}

interface ControlSnapshot {
  readonly selector: string;
  value?: string;
  checked?: boolean;
  selectedIndex?: number;
}

interface ScrollSnapshot {
  readonly selector: string;
  readonly top: number;
  readonly left: number;
}

interface TransientSnapshot {
  readonly controls: readonly ControlSnapshot[];
  readonly scroll: readonly ScrollSnapshot[];
}

const snapshots = new Map<string, TransientSnapshot>();

function stableKey(key: TransientStateKey): string {
  const params = Object.entries(key.params ?? {})
    .sort(([left], [right]) => left.localeCompare(right));
  return `${key.appId}:${JSON.stringify(params)}`;
}

/** Ruta CSS estructural relativa a la raíz para sobrevivir a reinstanciación. */
function selectorFor(element: Element, root: HTMLElement): string {
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    segments.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return segments.join(' > ');
}

function isSensitiveControl(
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): boolean {
  if (control instanceof HTMLInputElement
    && (control.type === 'password' || control.type === 'file' || control.type === 'hidden')) {
    return true;
  }
  const metadata = [
    control.name,
    control.id,
    control.getAttribute('autocomplete'),
  ].join(' ').toLowerCase();
  return /password|token|csrf|secret|authorization|card|cvv|cvc|one-time-code/.test(metadata);
}

/** Capturar controles restaurables y scroll de una raíz antes de desmontarla. */
export function captureTransientState(root: HTMLElement, key: TransientStateKey): void {
  const controls: ControlSnapshot[] = [];
  const controlElements = Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    'input, textarea, select',
  ));

  for (const element of controlElements) {
    if (element.getAttribute('data-transient') !== 'true') continue;
    if (isSensitiveControl(element)) continue;
    const snapshot: ControlSnapshot = { selector: selectorFor(element, root) };
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      snapshot.checked = element.checked;
    } else if (element instanceof HTMLSelectElement) {
      snapshot.selectedIndex = element.selectedIndex;
    } else {
      snapshot.value = element.value;
    }
    controls.push(snapshot);
  }

  const scroll: ScrollSnapshot[] = [{ selector: ':root', top: root.scrollTop, left: root.scrollLeft }];
  for (const element of root.querySelectorAll<HTMLElement>('[data-transient-scroll]')) {
    if (element.scrollTop === 0 && element.scrollLeft === 0) continue;
    scroll.push({ selector: selectorFor(element, root), top: element.scrollTop, left: element.scrollLeft });
  }

  snapshots.set(stableKey(key), { controls, scroll });
}

/** Restaurar una captura una sola vez después de montar la vista equivalente. */
export function restoreTransientState(root: HTMLElement, key: TransientStateKey): void {
  const snapshot = snapshots.get(stableKey(key));
  if (!snapshot) return;
  snapshots.delete(stableKey(key));

  for (const control of snapshot.controls) {
    const element = control.selector === ':root'
      ? root
      : root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(control.selector);
    if (!element) continue;
    if (control.checked !== undefined && element instanceof HTMLInputElement) element.checked = control.checked;
    else if (control.selectedIndex !== undefined && element instanceof HTMLSelectElement) element.selectedIndex = control.selectedIndex;
    else if (control.value !== undefined && 'value' in element) element.value = control.value;
  }

  for (const entry of snapshot.scroll) {
    const element = entry.selector === ':root' ? root : root.querySelector<HTMLElement>(entry.selector);
    if (!element) continue;
    element.scrollTop = entry.top;
    element.scrollLeft = entry.left;
  }
}

/** Descartar una captura cuando una transición se vuelve obsoleta o falla. */
export function discardTransientState(key: TransientStateKey): void {
  snapshots.delete(stableKey(key));
}

/** Limpiar capturas al salir de una sesión o teardown global. */
export function clearTransientState(): void {
  snapshots.clear();
}

/** Solo para tests: no expone el mapa mutable. */
export function _getTransientSnapshotCountForTest(): number {
  return snapshots.size;
}
