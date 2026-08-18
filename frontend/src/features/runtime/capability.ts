/* wandori.us — Capability Policy
 * Contrato puro de autorización de presentación/runtime.
 * Mantener este módulo sin imports de UI, stores o infraestructura para que
 * registry, workspace, comandos y adaptadores compartan la misma política.
 * [297A-23] Fail-closed ante datos corruptos o capacidades desconocidas.
 */

export type Capability = 'public' | 'authenticated' | 'admin';

const CAPABILITY_LEVELS: Readonly<Record<Capability, number>> = {
  public: 0,
  authenticated: 1,
  admin: 2,
};

/** Devuelve el nivel de una capacidad válida o -1 para input corrupto. */
export function capabilityLevel(value: unknown): number {
  if (value !== 'public' && value !== 'authenticated' && value !== 'admin') return -1;
  return CAPABILITY_LEVELS[value];
}

/** Evalúa si la capacidad actual satisface la requerida. */
export function hasCapability(
  current: unknown,
  required?: unknown,
): boolean {
  const currentLevel = capabilityLevel(current);
  const requiredLevel = capabilityLevel(required ?? 'public');
  return currentLevel >= 0 && requiredLevel >= 0 && currentLevel >= requiredLevel;
}

/** Disponibilidad admin-only genérica para comandos.
 * [297A-29 F2] Evita if/else por capacidad en el shell: cualquier comando
 * declara su disponibilidad con este helper y el toolbar solo lo proyecta.
 * Fail-closed: capacidad no admin (o corrupta) => hidden. */
export function adminOnlyAvailability(capability: unknown):
  | { state: 'enabled' }
  | { state: 'hidden' } {
  return hasCapability(capability, 'admin')
    ? { state: 'enabled' }
    : { state: 'hidden' };
}
