import { CORRUPT_TAKEOVER, defaultAgent, isStale, listTakeovers } from './task-takeover-store.mjs';

/* Decisión de cumplimiento para el gate: ¿puede este agente cerrar la tarea?
 * - 'active-foreign': tomada por otro agente activo → BLOQUEA
 * - 'own' / 'none' / 'corrupt' / 'stale-foreign' → no bloquea */
export function foreignTakeoverDecision({ entry, agent = defaultAgent(), nowMs = Date.now() } = {}) {
  if (!entry || entry === CORRUPT_TAKEOVER) return { blocked: false, reason: 'none' };
  if (entry.takenBy === agent) return { blocked: false, reason: 'own' };
  if (isStale(entry, nowMs)) return { blocked: false, reason: 'stale-foreign' };
  return { blocked: true, reason: 'active-foreign' };
}

/* Tomas activas de OTROS agentes (para banners de visibilidad temprana en
 * cualquier comando de trabajo, no solo el gate de la tarea objetivo). */
export async function listActiveForeignTakeovers(root, agent = defaultAgent(), nowMs = Date.now()) {
  const entries = await listTakeovers(root, nowMs);
  return entries.filter(item => item.entry
    && item.entry !== CORRUPT_TAKEOVER
    && !item.stale
    && item.entry.takenBy !== agent);
}

/* Recordatorios para el gate: el cierre debe recordar LIBERAR la tarea si el
 * agente la tomó, avisar si la tomó otro, y sugerir marcarla si no está. */
export function takeoverReminders({ taskId, entry, agent = defaultAgent(), nowMs = Date.now() } = {}) {
  if (!entry) {
    return [`Marca la tarea antes de trabajarla: npm run task:take -- --task ${taskId} --by <agente>`];
  }
  if (entry === CORRUPT_TAKEOVER) {
    return [`El marcado de ${taskId} es ilegible: re-tómala con npm run task:take -- --task ${taskId} --by <agente>`];
  }
  const stale = isStale(entry, nowMs);
  if (entry.takenBy === agent) {
    return [`Libera la tarea al terminar: npm run task:release -- --task ${taskId}`];
  }
  if (stale) {
    return [
      `El marcado de ${entry.takenBy} en ${taskId} expiró (olvidó liberarla): puedes re-tomarla con npm run task:take -- --task ${taskId} --by <agente> --force, o liberarla con npm run task:release -- --task ${taskId} (un marcado expirado lo libera cualquier agente; uno activo solo su autor)`,
    ];
  }
  return [
    `TAREA TOMADA por ${entry.takenBy} (${entry.id}) desde ${entry.takenAt} — expira ${entry.expiresAt}; no la trabajes en paralelo sin coordinar (npm run task:status)`,
  ];
}
