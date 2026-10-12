import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { writeAtomic } from './atomic-file.mjs';
import { projectRoot } from './preflight.mjs';

export const TAKEOVER_TTL_MS = 6 * 60 * 60 * 1000;
export const TAKEOVER_SCHEMA_VERSION = 1;

/* Centinela para marcados presentes pero ilegibles (JSON roto o esquema
 * desconocido): no pertenecen a nadie; `status` los lista como corruptos y
 * cualquier agente puede retirarlos con take/release. [018A-97] */
export const CORRUPT_TAKEOVER = Symbol('corrupt-takeover');

const SAFE_TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;

export function sanitizeTaskId(taskId) {
  if (typeof taskId !== 'string' || !SAFE_TASK_ID.test(taskId)) {
    throw new Error(`taskId inválido para toma de tarea: ${String(taskId)}`);
  }
  return taskId;
}

export function takeoverRegistryRoot(root = projectRoot) {
  return path.join(root, '.quality-reports', 'task-takeover');
}

export function takeoverEntryPath(root, taskId) {
  return path.join(takeoverRegistryRoot(root), `${sanitizeTaskId(taskId)}.json`);
}

/* Identificador de toma: `T-<epochMs>-<hex8>`. El epoch codifica el instante
 * exacto de la toma; basta decodificarlo para saber cuándo se tomó. */
export function createTakeoverId(takenAtMs) {
  return `T-${Math.trunc(takenAtMs)}-${randomBytes(4).toString('hex')}`;
}

export function decodeTakeoverId(id) {
  if (typeof id !== 'string') return null;
  const match = /^T-(\d{13})-([0-9a-f]{8})$/u.exec(id);
  if (!match) return null;
  const takenAtMs = Number(match[1]);
  if (!Number.isSafeInteger(takenAtMs)) return null;
  return { takenAtMs, randomHex: match[2] };
}

export function isStale(entry, nowMs = Date.now()) {
  return typeof entry?.takenAtMs === 'number'
    && nowMs - entry.takenAtMs > TAKEOVER_TTL_MS;
}

export function defaultAgent(env = process.env) {
  return env.GLORY_AGENT_ID?.trim() || os.hostname();
}

/* El nombre de agente entra por CLI (--by) o env y se vuelca en el reporte
 * Markdown: se recorta y se eliminan caracteres de control para que un valor
 * con `\n` no inyecte contenido en el reporte. */
export function sanitizeAgentName(value) {
  const cleaned = String(value ?? '').replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  return cleaned.slice(0, 64) || 'unknown';
}

export async function readTakeover(root, taskId) {
  let raw;
  try {
    raw = await readFile(takeoverEntryPath(root, taskId), 'utf8');
  } catch (error) {
    /* Marcado inexistente (o leído a medias por otro proceso): sin tomar. */
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const entry = JSON.parse(raw);
    if (entry?.schemaVersion !== TAKEOVER_SCHEMA_VERSION || typeof entry.takenAtMs !== 'number') {
      /* Archivo presente pero ilegible/ajeno: se distingue del "sin tomar"
       * para que status lo liste y el re-toma lo retire (antes un marcado
       * corrupto bloqueaba la tarea para siempre con un falso conflicto). */
      return CORRUPT_TAKEOVER;
    }
    return entry;
  } catch (error) {
    if (error instanceof SyntaxError) return CORRUPT_TAKEOVER;
    throw error;
  }
}

export async function listTakeovers(root, nowMs = Date.now()) {
  const registry = takeoverRegistryRoot(root);
  let names = [];
  try {
    names = await readdir(registry);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const entries = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const taskId = name.slice(0, -'.json'.length);
    try {
      const entry = await readTakeover(root, taskId);
      if (entry === CORRUPT_TAKEOVER) {
        /* Marcado ilegible: se lista como corrupto, no se aborta el listado. */
        entries.push({ taskId, entry: null, stale: false, corrupt: true });
      } else if (entry) {
        entries.push({ taskId, entry, stale: isStale(entry, nowMs) });
      }
    } catch {
      entries.push({ taskId, entry: null, stale: false, corrupt: true });
    }
  }
  return entries.sort((left, right) => (left.entry?.takenAtMs ?? 0) - (right.entry?.takenAtMs ?? 0));
}

/* Toma la tarea. Devuelve:
 * - { status: 'taken', entry }            marcado nuevo
 * - { status: 'refreshed', entry }        mismo agente re-tomando (renueva)
 * - { status: 'taken-over-stale', entry } marcado viejo olvidado, re-tomado
 * - { status: 'conflict', entry }         tomada por otro agente activo */
export async function takeTask(root, taskId, { by = defaultAgent(), force = false, nowMs = Date.now() } = {}) {
  sanitizeTaskId(taskId);
  const agent = sanitizeAgentName(by);
  const target = takeoverEntryPath(root, taskId);
  await mkdir(path.dirname(target), { recursive: true });
  const existing = await readTakeover(root, taskId);
  if (existing === CORRUPT_TAKEOVER) {
    /* Marcado ilegible: no es de nadie; se retira y se toma de cero. */
    await unlink(target).catch(() => {});
    return { status: 'taken-over-corrupt', entry: await writeEntry(target, taskId, agent, nowMs) };
  }
  if (existing && existing.takenBy === agent) {
    /* Re-toma del mismo agente (con o sin --force): renueva el marcado.
     * El archivo ya existe, así que se reemplaza atómicamente, no con `wx`. */
    const entry = buildEntry(taskId, agent, nowMs);
    await writeAtomic(target, `${JSON.stringify(entry, null, 2)}\n`);
    return { status: 'refreshed', entry };
  }
  if (existing && !isStale(existing, nowMs)) {
    return { status: 'conflict', entry: existing };
  }
  if (existing && force) {
    /* Re-toma forzada de un marcado expirado: se reemplaza atómicamente
     * (el archivo ya existe, `wx` fallaría con EEXIST). */
    const entry = buildEntry(taskId, agent, nowMs);
    await writeAtomic(target, `${JSON.stringify(entry, null, 2)}\n`);
    return { status: 'taken-over-stale', entry };
  }
  if (existing) {
    /* Marcado olvidado (>6h): re-toma con aviso. Compare-and-delete: solo se
     * retira si sigue siendo el mismo marcado que observamos; si otro agente
     * lo re-tomó entre la lectura y este punto, se devuelve conflicto y no se
     * pisa la toma fresca ajena. */
    const current = await readTakeover(root, taskId);
    if (current && current.id !== existing.id) {
      return { status: 'conflict', entry: current };
    }
    await unlink(target).catch(() => {});
  }
  try {
    return { status: existing ? 'taken-over-stale' : 'taken', entry: await writeEntry(target, taskId, agent, nowMs) };
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const other = await readTakeover(root, taskId);
      if (other === CORRUPT_TAKEOVER) {
        /* El marcado se corrompió entre la lectura y la escritura (o era
         * ilegible): retirarlo y reintentar una vez con escritura atómica. */
        await unlink(target).catch(() => {});
        return { status: 'taken-over-corrupt', entry: await writeEntry(target, taskId, agent, nowMs) };
      }
      if (other && !isStale(other, nowMs)) return { status: 'conflict', entry: other };
      return { status: 'conflict', entry: other ?? null };
    }
    throw error;
  }
}

function buildEntry(taskId, by, nowMs) {
  const takenAtMs = Math.trunc(nowMs);
  return {
    schemaVersion: TAKEOVER_SCHEMA_VERSION,
    taskId,
    id: createTakeoverId(takenAtMs),
    takenAt: new Date(takenAtMs).toISOString(),
    takenAtMs,
    takenBy: sanitizeAgentName(by),
    expiresAt: new Date(takenAtMs + TAKEOVER_TTL_MS).toISOString(),
    expiresAtMs: takenAtMs + TAKEOVER_TTL_MS,
  };
}

async function writeEntry(target, taskId, by, nowMs) {
  const entry = buildEntry(taskId, by, nowMs);
  /* `wx` garantiza que dos agentes tomando a la vez no se pisen: si el
   * archivo ya existe, la creación falla y el caller decide (conflicto). */
  await writeFile(target, `${JSON.stringify(entry, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  return entry;
}

/* Heartbeat: renueva la expiración de la toma propia (el agente que la tomó
 * sigue trabajando). Devuelve:
 * - { status: 'touched', entry }    renovada (nuevo expiresAt)
 * - { status: 'not-taken', entry: null }
 * - { status: 'corrupt', entry }    ilegible (no se renueva)
 * - { status: 'foreign', entry }    activa de otro agente (no se toca)
 *
 * El TTL es un recordatorio de “olvidada”, no un plazo real de trabajo: un
 * trabajo largo no debe expirar a mitad solo porque superó 6 h. Cada gate
 * del propio agente renueva su toma, de modo que un marcado activo con
 * actividad reciente NUNCA puede ser re-tomado como “olvidado” por otro. */
export async function touchTakeover(root, taskId, { by = defaultAgent(), nowMs = Date.now() } = {}) {
  sanitizeTaskId(taskId);
  const agent = sanitizeAgentName(by);
  const existing = await readTakeover(root, taskId);
  if (!existing) return { status: 'not-taken', entry: null };
  if (existing === CORRUPT_TAKEOVER) return { status: 'corrupt', entry: existing };
  if (existing.takenBy !== agent) return { status: 'foreign', entry: existing };
  const target = takeoverEntryPath(root, taskId);
  /* [018A-97] Compare-and-write: entre la lectura y la escritura otro agente
   * pudo re-tomar la tarea (marcado expirado con --force o taken-over-stale).
   * Sin esta re-verificación, el heartbeat pisaría la toma fresca ajena. Se
   * vuelve a leer justo antes de escribir y se aborta si el marcado cambió de
   * identidad (id) — el id es único por toma, así que compararlo por valor
   * detecta el re-toma aunque el objeto JSON sea nuevo (mismo patrón que
   * takeTask sobre stale). */
  const current = await readTakeover(root, taskId);
  if (!current || current === CORRUPT_TAKEOVER || current.id !== existing.id) {
    return { status: 'foreign', entry: current ?? null };
  }
  const entry = buildEntry(taskId, agent, nowMs);
  await writeAtomic(target, `${JSON.stringify(entry, null, 2)}\n`);
  return { status: 'touched', entry };
}

/* Libera la tarea. Devuelve:
 * - { status: 'released', entry }       liberada por su autor
 * - { status: 'released-stale', entry } marcado expirado liberado por otro
 * - { status: 'not-taken', entry: null } no estaba tomada
 * - { status: 'conflict', entry }       activa y de otro agente (imposible
 *   liberar, ni con --force: el autor debe liberarla o esperar la expiración)
 *
 * Sin parámetro force: el propietario libera su toma; un marcado expirado
 * (>6 h, olvidado) puede liberarlo cualquier agente; un marcado ACTIVO de
 * otro agente SIEMPRE devuelve conflicto. Así un agente no puede desmarcar
 * la tarea que otro está trabajando. */
export async function releaseTask(root, taskId, { by = defaultAgent(), nowMs = Date.now() } = {}) {
  sanitizeTaskId(taskId);
  const agent = sanitizeAgentName(by);
  const target = takeoverEntryPath(root, taskId);
  const existing = await readTakeover(root, taskId);
  if (!existing) return { status: 'not-taken', entry: null };
  if (existing === CORRUPT_TAKEOVER) {
    /* Marcado ilegible: no es de nadie; cualquier agente puede retirarlo. */
    await unlink(target).catch(() => {});
    return { status: 'released-corrupt', entry: null };
  }
  if (existing.takenBy !== agent && !isStale(existing, nowMs)) {
    return { status: 'conflict', entry: existing };
  }
  await unlink(target).catch(error => {
    if (error?.code !== 'ENOENT') throw error;
  });
  return { status: existing.takenBy === agent ? 'released' : 'released-stale', entry: existing };
}
