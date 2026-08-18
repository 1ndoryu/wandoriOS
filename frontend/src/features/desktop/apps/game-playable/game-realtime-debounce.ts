/* 138A-5 — Debounce de regeneración en tiempo real del Constructor de mundo.
 * Agrupa cambios rápidos de controles (slider/input/select) en UNA
 * regeneración tras `delayMs`; la última opción enviada gana. No depende de
 * Three/DOM y se puede testear con timers fake. */

export interface DebouncedRegenerator<T> {
  /** Programa una regeneración con las últimas opciones (reemplaza la pendiente). */
  readonly schedule: (value: T) => void;
  /** Cancela la regeneración pendiente sin disparar el callback. */
  readonly cancel: () => void;
  /** Cancela y marca el objeto como inservible (teardown). */
  readonly dispose: () => void;
}

/** Debounce genérico: agrupa N cambios rápidos de un valor en UNA invocación
 *  del callback con el último valor enviado (opciones de terreno, paleta…). */
export function createDebouncedRegenerator<T>(
  delayMs: number,
  regenerate: (value: T) => void,
): DebouncedRegenerator<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: T | null = null;
  let disposed = false;

  const run = (): void => {
    timer = null;
    const value = latest;
    latest = null;
    if (value !== null) regenerate(value);
  };

  const cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    latest = null;
  };

  return {
    schedule(value) {
      if (disposed) return;
      latest = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(run, Math.max(0, delayMs));
    },
    cancel,
    dispose() {
      cancel();
      disposed = true;
    },
  };
}
