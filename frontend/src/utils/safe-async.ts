/* sentinel-disable-file mixed-barrel-logic
 * [por que] El re-export de ok/err/Result es API publica del wrapper (los
 * consumidores los importan desde aqui); mezclar re-export con la logica
 * del wrapper es intencional y documentado en el header del modulo.
 */
/* wandori.us — Safe Async
 * Wrapper unificado para funciones async con manejo de errores consistente.
 * [Auditoría v4 §5.1] Reemplaza try/catch dispersos por un patrón centralizado.
 *
 * Uso:
 *   safeClick(btn, async () => { await guardarDatos(); });
 *   const result = await safeRun(cargarDatos(), 'Error al cargar');
 *   if (!result.ok) { showToast(result.error); return; }
 */

import { showToast } from '../components/ui/toast';
import { logger } from '../services/logger';
import { tryCatch, type Result } from './result';

export type { Result } from './result';
export { ok, err } from './result';

/**
 * Ejecutar una promesa y mostrar toast en caso de error.
 * Retorna Result para que el caller pueda decidir el flujo post-error.
 */
export async function safeRun<T>(
  promise: Promise<T>,
  errorMessage?: string,
): Promise<Result<T>> {
  const result = await tryCatch(promise);
  if (!result.ok) {
    showToast(errorMessage ?? result.error);
  }
  return result;
}

/**
 * Envolver un event handler async con manejo de errores.
 * El toast muestra un mensaje por defecto traducible.
 * Útil para onClick, onSubmit, onChange en botones/forms.
 *
 * @example
 * btn.addEventListener('click', safeClick(async () => {
 *   await api.save(data);
 * }));
 */
export function safeClick(
  fn: (e: Event) => Promise<void>,
  errorMessage?: string,
): (e: Event) => void {
  return (e: Event) => {
    safeRun(fn(e), errorMessage).catch(() => {
      /* Nunca debería llegar aquí — safeRun ya atrapa todo */
    });
  };
}

/**
 * Envolver una función async que retorna void (efecto secundario).
 * El error se registra en consola pero no rompe la UI.
 * Útil para tracking, logging o efectos secundarios no críticos.
 */
export function safeEffect(fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err: unknown) => {
      logger.warn('[safeEffect] error no crítico:', err);
    });
  };
}

/**
 * Envolver un handler de evento Pointer/Keyboard/Mouse.
 * Todas las variantes de evento se unifican en un solo wrapper.
 */
export function safeHandler<E extends Event>(
  fn: (e: E) => Promise<void>,
  errorMessage?: string,
): (e: E) => void {
  return (e: E) => {
    safeRun(fn(e), errorMessage).catch(() => {});
  };
}
