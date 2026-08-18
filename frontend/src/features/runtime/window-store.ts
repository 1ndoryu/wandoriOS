/* wandori.us — Window Store
 * Tipos, store reactivo, workspace bounds y funciones getter para ventanas.
 * Extraído de window-manager.ts para reducir tamaño bajo límite de 300 líneas.
 * [Auditoría v3 §2.2] */

import { createStore, type Store } from '../../store';
import type { AppDefinition, AppToolbarGroup } from './app-registry';
import type { IconNode } from 'lucide';

export type WindowState = 'open' | 'minimized' | 'maximized';

export interface WindowBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/* [Auditoría v4 §3.2] ISP: WindowEntry separado en 3 sub-interfaces.
 * Cada consumidor importa solo lo que necesita. WindowEntry mantiene
 * la unión completa para backward compatibility. */

/** Identidad de ventana — usado por taskbar, menús, route-adapter. */
export interface WindowIdentity {
  readonly instanceId: string;
  readonly appId: string;
  title: string;
  focused: boolean;
  state: WindowState;
}

/** Geometría de ventana — usado por window-manager. */
export interface WindowGeometry {
  bounds: WindowBounds;
  zIndex: number;
  preMaximizeBounds?: WindowBounds;
}

/** Contenido de ventana — usado por desktop-shell. */
export interface WindowContent {
  readonly content: HTMLElement;
  /** [018A-1] Franja de acciones inferior de la ventana (debajo del body
   * padded). La provee la app; opcional. */
  readonly actions?: HTMLElement;
  readonly controller?: AbortController;
  readonly app?: AppDefinition;
  readonly icon?: IconNode;
  readonly cssClass?: string;
  readonly layout?: 'padded' | 'full-bleed';
  readonly toolbar?: AppToolbarGroup[];
  readonly params?: Readonly<Record<string, string>>;
  readonly _paramKey?: string;
  readonly onDestroy?: () => void;
}

/** Entry completa de una ventana — unión de identidad + geometría + contenido.
 *  Los consumidores pueden usar las sub-interfaces para no acoplar código
 *  a campos que no necesitan. */
export interface WindowEntry extends WindowIdentity, WindowGeometry, WindowContent {}

/* === Store reactivo === */
export const windowStore: Store<WindowEntry[]> = createStore([]);

/* === Workspace bounds (set by shell after DOM creation) === */
export let workspaceW = 1200;
export let workspaceH = 800;

/** Called once by desktop-shell after the window container is in the DOM. */
export function setWorkspaceBounds(w: number, h: number): void {
  workspaceW = w;
  workspaceH = h;
}

/** Shared clamp: keeps a window partially visible within the workspace. */
export function clampWindowBounds(x: number, y: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const minVisible = 60;
  const titleH = 24;
  return {
    x: Math.max(-w + minVisible, Math.min(workspaceW - minVisible, x)),
    y: Math.max(0, Math.min(workspaceH - titleH, y)),
    w: Math.min(w, workspaceW),
    h: Math.min(h, workspaceH),
  };
}

let nextWindowId = 1;
let nextZIndex = 10;

export function generateWindowId(): string {
  return `win-${nextWindowId++}`;
}

/** Siguiente z-index para apilamiento de ventanas.
 * [Auditoría v4 §1.3] Movido de window-manager.ts para consolidar estado mutable. */
export function generateNextZIndex(): number {
  return nextZIndex++;
}

/** Subir el piso de z-index por encima del máximo restaurado de sesión.
 * [317A-5] Las ventanas restauradas conservan su zIndex; las aperturas nuevas
 * deben quedar por encima, nunca colisionar con el techo restaurado. */
export function ensureNextZIndexAbove(floor: number): void {
  if (nextZIndex <= floor) nextZIndex = floor + 1;
}

/** Resetear contadores (solo para tests — prefijo _ indica API interna). */
export function _resetWindowCountersForTest(): void {
  nextWindowId = 1;
  nextZIndex = 10;
}

/** Obtener todas las ventanas. */
export function getWindows(): WindowEntry[] {
  return windowStore.get();
}

/** Obtener la ventana con foco. */
export function getFocusedWindow(): WindowEntry | undefined {
  return windowStore.get().find(w => w.focused);
}

/** Verificar si una app singleton ya está abierta. */
export function findOpenWindow(appId: string): WindowEntry | undefined {
  return windowStore.get().find(w => w.appId === appId);
}
