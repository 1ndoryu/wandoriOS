/* wandori.us — Debounced Autosave (generic)
 * Mecanismo reutilizable de autosave para editores del OS.
 * [297A-14 F5] Paridad "por tipo de recurso": artículo, proyecto y producto
 * comparten el mismo debounce/teardown; cada editor aporta su `save()` y su
 * feedback. Evita duplicar timers, carreras y cleanups en cada programa.
 *
 * Contrato:
 * - `schedule()` debouncea el guardado; se reprograma si el usuario siguió
 *   editando durante un save en vuelo (dirtyAgain).
 * - `cancel()` limpia el timer pendiente (guardado manual, cierre).
 * - `destroy()` cancela timers y marca destruido; idempotente.
 * - El evento de dominio y el feedback los decide el adaptador en `save()`.
 */

export interface DebouncedSaveResult {
  /** true si el guardado se completó (create o update). */
  readonly ok: boolean;
  /** true si este guardado CREÓ el recurso (primer save). */
  readonly created?: boolean;
}

export interface DebouncedSaverOptions {
  /** Milisegundos de inactividad antes de guardar. Default 2500. */
  readonly delayMs?: number;
  /** true si el editor sigue activo (no abortado/desmontado). */
  readonly isActive: () => boolean;
  /** Guardar el estado actual. Devuelve ok/created. */
  readonly save: () => Promise<DebouncedSaveResult>;
  /** Feedback cuando el guardado creó el recurso y no hay más ediciones. */
  readonly onCreated?: () => void;
}

export interface DebouncedSaver {
  /** Programar guardado tras debounce; se cancela al desmontar. */
  schedule: () => void;
  /** Cancelar el timer pendiente (manual save, close). */
  cancel: () => void;
  /** Destruir timers; idempotente. */
  destroy: () => void;
}

/** Crear un saver debounced genérico con teardown completo. */
export function createDebouncedSaver(options: DebouncedSaverOptions): DebouncedSaver {
  const delay = options.delayMs ?? 2500;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  let inFlight = false;
  let dirtyAgain = false;

  const run = async (): Promise<void> => {
    if (destroyed || inFlight) return;
    inFlight = true;
    try {
      const result = await options.save();
      /* Si el usuario siguió editando durante el guardado, reprogramar.
       * [297A-14 F5] onCreated también exige !destroyed: si la ventana se
       * cerró durante el save in-flight, el recurso YA existe en backend pero
       * no emitimos el evento ni mutamos estado sobre DOM desmontado. */
      if (dirtyAgain && !destroyed) {
        dirtyAgain = false;
        timer = setTimeout(() => { void run(); }, delay);
      } else if (!destroyed && result.ok && result.created) {
        options.onCreated?.();
      }
    } finally {
      inFlight = false;
    }
  };

  return {
    schedule: () => {
      if (destroyed) return;
      if (inFlight) {
        dirtyAgain = true;
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void run();
      }, delay);
    },
    /* [297A-14 F5] cancel() no aborta un save ya inFlight: el guardado
     * manual y el autosave escriben el mismo payload (idempotente,
     * last-write-wins); el evento de dominio se emite una vez por save. */
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      dirtyAgain = false;
    },
    destroy: () => {
      destroyed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      dirtyAgain = false;
    },
  };
}
