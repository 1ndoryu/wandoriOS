/* wandori.us — Core Lifecycle
 * MountedView y RenderContext: contrato base para todas las apps del OS.
 * Cada app devuelve contenido; solo el shell crea ventana/chrome.
 * AbortSignal permite teardown limpio al cerrar ventana o navegar. */

/** Contexto que el runtime entrega a cada app al montarla. */
export interface RenderContext {
  /** Señal que se aborta al destruir la vista (cerrar ventana, navegar, etc.). */
  readonly signal: AbortSignal;
  /** Parámetros de instancia: folderId para Finder, resourceId para Reader/Editor, etc. */
  readonly params?: Readonly<Record<string, string>>;
}

/** Resultado que cada app devuelve al shell. */
export interface MountedView {
  /** Elemento raíz que el shell inserta en el DOM. */
  readonly element: HTMLElement;
  /** [018A-1] Franja de acciones opcional que la app aporta como barra
   * inferior fija. Desktop la coloca como hija de .desktop-window (debajo
   * del body padded, fuera de su padding y de su scroll) y el stack móvil
   * debajo del contenido full-screen; es la misma instancia, sin duplicar
   * lógica por plataforma. Una app sin acciones no cambia de comportamiento. */
  readonly actions?: HTMLElement;
  /** Cleanup opcional que el shell invoca antes de destruir la vista. */
  destroy?: () => void;
}

/** Tipo de función que renderiza una app. */
export type AppRenderFn = (ctx: RenderContext) => MountedView | Promise<MountedView>;

/**
 * Crea un AbortController con cleanup automático.
 * Útil para ventanas y vistas que necesitan teardown.
 */
export function createViewScope(): { ctx: RenderContext; controller: AbortController } {
  const controller = new AbortController();
  return {
    ctx: { signal: controller.signal, params: {} },
    controller,
  };
}
