/* wandori.us — Result Type
 * Tipo discriminated union para operaciones que pueden fallar.
 * Reemplaza throw para flujos de dominio esperados. */

export type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Crear resultado exitoso. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Crear resultado de error. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Envolver una promesa que puede lanzar en un Result. */
export async function tryCatch<T>(promise: Promise<T>): Promise<Result<T>> {
  try {
    return ok(await promise);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}
