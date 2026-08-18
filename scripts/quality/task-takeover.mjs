#!/usr/bin/env node
/* [028A-17] Coordinación de tomas de tarea entre agentes en el checkout
 * compartido. Cada vez que un agente EMPIEZA una tarea la marca con
 * `npm run task:take -- --task <ID> --by <agente>`; al terminar la libera con
 * `npm run task:release -- --task <ID>`. El identificador de cada toma
 * codifica el instante exacto en que se tomó (formato `T-<epochMs>-<hex8>`),
 * de modo que basta leerlo para saber cuándo se tomó sin abrir el registro.
 *
 * Reglas:
 * - Una tarea tomada por OTRO agente activo no se puede tomar de nuevo.
 * - Un marcado que supera TAKEOVER_TTL_MS (6 h) sin liberarse se considera
 *   olvidado: cualquier agente puede re-tomarlo (con aviso) o liberarlo.
 * - task:release SOLO libera la tarea del agente que la tomó (o un marcado
 *   ya expirado); un agente NUNCA puede liberar la tarea activa de otro,
 *   ni siquiera con --force (--force solo afecta a task:take).
 * - El registro vive en `.quality-reports/task-takeover/<taskId>.json`
 *   (ignorado por git): es coordinación local del checkout, no un contrato.
 * - Un marcado ilegible (JSON roto o esquema desconocido) no pertenece a
 *   nadie: `status` lo lista como corrupto y `take`/`release` lo retiran
 *   para poder re-tomar la tarea (antes bloqueaba el re-toma para siempre
 *   con un falso "carrera de escritura").
 * - `task:check` solo informa/recuerda; nunca toma ni libera por sorpresa.
 *
 * Seguridad: el taskId se valida contra un patrón seguro (nada de traversal),
 * la creación de un marcado usa `wx` (falla si ya existe) para que dos tomas
 * concurrentes no se pisen, y los campos del registro son solo cadenas/números. */
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
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

function formatEntryLine({ taskId, entry, stale, corrupt }) {
  if (corrupt || !entry) return `- ${taskId} · registro ilegible`;
  const state = stale ? 'EXPIRADA (olvidada)' : 'activa';
  return `- ${taskId} · ${entry.id} · por ${entry.takenBy} · desde ${entry.takenAt} · expira ${entry.expiresAt} · ${state}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = {};
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--task') args.task = argv[++index];
    else if (arg === '--by') args.by = argv[++index];
    else if (arg === '--force') args.force = true;
    else if (arg === '--root') args.root = argv[++index];
  }
  const root = args.root ?? projectRoot;

  if (command === 'take' || command === 'release') {
    if (!args.task) {
      process.stderr.write(`[task-takeover] ${command} requiere --task <ID> [--by <agente>] [--force]\n`);
      process.exitCode = 2;
      return;
    }
    /* [018A-97] ID inválido (traversal, controles): error limpio, no un
     * stack trace sin controlar desde takeTask. */
    try {
      sanitizeTaskId(args.task);
    } catch (error) {
      process.stderr.write(`[task-takeover] ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    const agent = sanitizeAgentName(args.by ?? defaultAgent());
    const result = command === 'take'
      ? await takeTask(root, args.task, { by: agent, force: args.force })
      : await releaseTask(root, args.task, { by: agent });
    const { entry } = result;
    if (result.status === 'conflict' && entry) {
      const stale = isStale(entry);
      const hint = command === 'release'
        ? ' — solo el autor libera su toma activa (o un marcado expirado)'
        : '';
      process.stderr.write(`[task-takeover] ${command.toUpperCase()} RECHAZADO — ${args.task} tomada por ${entry.takenBy} (${entry.id}) desde ${entry.takenAt}${stale ? ' (expirada)' : ''}${hint}\n`);
      process.stderr.write('[task-takeover] Next: npm run task:status\n');
      process.exitCode = 1;
      return;
    }
    if (result.status === 'conflict' && !entry) {
      process.stderr.write(`[task-takeover] ${command.toUpperCase()} RECHAZADO — carrera de escritura, reintenta\n`);
      process.exitCode = 1;
      return;
    }
    if (result.status === 'not-taken') {
      process.stdout.write(`[task-takeover] NO TOMADA ${args.task} — no había marcado que liberar\n`);
      return;
    }
    const verb = {
      taken: 'TOMADA', refreshed: 'RENOVADA',
      'taken-over-stale': 'RE-TOMADA (marcado olvidado liberado)',
      'taken-over-corrupt': 'RE-TOMADA (registro ilegible retirado)',
      released: 'LIBERADA', 'released-stale': 'LIBERADA (marcado olvidado)',
      'released-corrupt': 'LIBERADA (registro ilegible retirado)',
    }[result.status] ?? result.status.toUpperCase();
    const who = entry ? ` · ${entry.id} · por ${entry.takenBy}` : ` · por ${agent}`;
    process.stdout.write(`[task-takeover] ${verb} ${args.task}${who}\n`);
    return;
  }

  if (command === 'status') {
    const entries = await listTakeovers(root);
    if (entries.length === 0) {
      process.stdout.write('[task-takeover] Ninguna tarea tomada.\n');
      return;
    }
    process.stdout.write('[task-takeover] Tomás de tarea (TTL 6 h; expiradas = olvidadas):\n');
    for (const item of entries) process.stdout.write(`${formatEntryLine(item)}\n`);
    if (args.task) {
      const match = entries.find(item => item.taskId === args.task);
      if (!match) process.stdout.write(`- ${args.task} · NO tomada\n`);
    }
    return;
  }

  process.stderr.write(`[task-takeover] uso:\n`);
  process.stderr.write(`  take    --task <ID> [--by <agente>] [--force]   (--force: re-tomar un marcado expirado)\n`);
  process.stderr.write(`  release --task <ID> [--by <agente>]            (solo el autor, o un marcado expirado)\n`);
  process.stderr.write(`  status  [--task <ID>] [--root <ruta>]\n`);
  process.exitCode = 2;
}

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) await main();
