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
import { pathToFileURL } from 'node:url';
import { projectRoot } from './preflight.mjs';
import { defaultAgent, isStale, listTakeovers, releaseTask, sanitizeAgentName, sanitizeTaskId, takeTask } from './task-takeover-store.mjs';
export { TAKEOVER_TTL_MS, TAKEOVER_SCHEMA_VERSION, CORRUPT_TAKEOVER, sanitizeTaskId, takeoverRegistryRoot, takeoverEntryPath, createTakeoverId, decodeTakeoverId, isStale, defaultAgent, sanitizeAgentName, readTakeover, listTakeovers, takeTask, touchTakeover, releaseTask } from './task-takeover-store.mjs';
export { foreignTakeoverDecision, listActiveForeignTakeovers, takeoverReminders } from './task-takeover-query.mjs';

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
