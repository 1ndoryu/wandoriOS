/* [018A-97] Tests de la coordinación de tomas de tarea (task-takeover):
 * conflicto entre agentes, release solo por autor, expiración (stale),
 * marcados ilegibles (JSON roto / esquema desconocido) y carrera de escritura.
 * Usan un root temporal para no tocar el registro del checkout compartido. */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  TAKEOVER_TTL_MS,
  CORRUPT_TAKEOVER,
  sanitizeTaskId,
  decodeTakeoverId,
  isStale,
  readTakeover,
  listTakeovers,
  listActiveForeignTakeovers,
  takeTask,
  releaseTask,
  touchTakeover,
  foreignTakeoverDecision,
  takeoverReminders,
} from '../task-takeover.mjs';

const TASK = 'TEST-018A';
const OLD_MS = Date.now() - TAKEOVER_TTL_MS - 60_000;

function staleEntry(taskId, by = 'fantasma') {
  return {
    schemaVersion: 1,
    taskId,
    id: `T-${OLD_MS}-deadbeef`,
    takenAt: new Date(OLD_MS).toISOString(),
    takenAtMs: OLD_MS,
    takenBy: by,
    expiresAt: new Date(OLD_MS + TAKEOVER_TTL_MS).toISOString(),
    expiresAtMs: OLD_MS + TAKEOVER_TTL_MS,
  };
}

function registryPath(root, taskId) {
  return path.join(root, '.quality-reports', 'task-takeover', `${taskId}.json`);
}

test('takeTask toma la tarea y otro agente activo no puede tomarla ni liberarla', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glory-takeover-'));
  try {
    const taken = await takeTask(root, TASK, { by: 'buffy', nowMs: Date.now() });
    assert.equal(taken.status, 'taken');
    assert.match(taken.entry.id, /^T-\d{13}-[0-9a-f]{8}$/u);
    assert.equal(decodeTakeoverId(taken.entry.id).takenAtMs, taken.entry.takenAtMs);

    const conflict = await takeTask(root, TASK, { by: 'otro', nowMs: Date.now() });
    assert.equal(conflict.status, 'conflict');
    assert.equal(conflict.entry.takenBy, 'buffy');

    /* El agente ajeno no libera la toma activa. */
    const foreign = await releaseTask(root, TASK, { by: 'otro', nowMs: Date.now() });
    assert.equal(foreign.status, 'conflict');
    assert.equal((await readTakeover(root, TASK)).takenBy, 'buffy');

    const released = await releaseTask(root, TASK, { by: 'buffy', nowMs: Date.now() });
    assert.equal(released.status, 'released');
    assert.equal(await readTakeover(root, TASK), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('releaseTask: no-taken, stale re-tomado sin force y con force', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glory-takeover-'));
  try {
    const again = await releaseTask(root, TASK, { by: 'buffy', nowMs: Date.now() });
    assert.equal(again.status, 'not-taken');

    /* Marcado olvidado (>6h): cualquier agente lo re-toma (aviso) o libera. */
    await mkdir(path.dirname(registryPath(root, TASK)), { recursive: true });
    await writeFile(registryPath(root, TASK), `${JSON.stringify(staleEntry(TASK))}\n`, 'utf8');
    const retaken = await takeTask(root, TASK, { by: 'buffy', nowMs: Date.now() });
    assert.equal(retaken.status, 'taken-over-stale');
    assert.equal(retaken.entry.takenBy, 'buffy');

    const stale2 = `${TASK}-2`;
    await writeFile(registryPath(root, stale2), `${JSON.stringify(staleEntry(stale2))}\n`, 'utf8');
    const staleRelease = await releaseTask(root, stale2, { by: 'otro', nowMs: Date.now() });
    assert.equal(staleRelease.status, 'released-stale');

    const stale3 = `${TASK}-3`;
    await writeFile(registryPath(root, stale3), `${JSON.stringify(staleEntry(stale3))}\n`, 'utf8');
    const forced = await takeTask(root, stale3, { by: 'otro', force: true, nowMs: Date.now() });
    assert.equal(forced.status, 'taken-over-stale');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('un marcado ilegible se lista como corrupto y se puede re-tomar o liberar', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glory-takeover-'));
  try {
    await mkdir(path.dirname(registryPath(root, TASK)), { recursive: true });
    const broken = `${TASK}-corrupt`;
    const schema = `${TASK}-schema`;
    await writeFile(registryPath(root, broken), '{json roto', 'utf8');
    await writeFile(registryPath(root, schema), `${JSON.stringify({ schemaVersion: 99, taskId: schema })}\n`, 'utf8');

    /* status los lista como corruptos sin abortar. */
    const listed = await listTakeovers(root);
    assert.equal(listed.filter(item => item.corrupt).length, 2);

    /* Un JSON roto bloqueaba el re-toma para siempre (falso "carrera"); ahora
     * se retira y se toma de cero. */
    const retaken = await takeTask(root, broken, { by: 'buffy', nowMs: Date.now() });
    assert.equal(retaken.status, 'taken-over-corrupt');
    assert.equal((await readTakeover(root, broken)).takenBy, 'buffy');

    /* Un esquema desconocido se libera por cualquier agente. */
    const released = await releaseTask(root, schema, { by: 'otro', nowMs: Date.now() });
    assert.equal(released.status, 'released-corrupt');
    assert.equal(await readTakeover(root, schema), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('la toma del mismo agente renueva el marcado (refreshed)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glory-takeover-'));
  try {
    const now = Date.now();
    const first = await takeTask(root, TASK, { by: 'buffy', nowMs: now });
    const second = await takeTask(root, TASK, { by: 'buffy', nowMs: now + 5_000 });
    assert.equal(second.status, 'refreshed');
    assert.notEqual(second.entry.id, first.entry.id);
    assert.equal(second.entry.takenAtMs, first.entry.takenAtMs + 5_000);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('touchTakeover renueva solo la toma propia y no toca la ajena', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glory-takeover-'));
  try {
    const now = Date.now();
    const taken = await takeTask(root, TASK, { by: 'buffy', nowMs: now });
    const beforeExpiry = taken.entry.expiresAtMs;

    /* Un agente ajeno NO renueva la toma activa de buffy. */
    const foreign = await touchTakeover(root, TASK, { by: 'otro', nowMs: now + 60_000 });
    assert.equal(foreign.status, 'foreign');
    assert.equal((await readTakeover(root, TASK)).expiresAtMs, beforeExpiry);

    /* La toma propia sí se renueva (heartbeat: trabajo largo no expira). */
    const touched = await touchTakeover(root, TASK, { by: 'buffy', nowMs: now + 60_000 });
    assert.equal(touched.status, 'touched');
    assert.equal(touched.entry.takenBy, 'buffy');
    assert.ok(touched.entry.expiresAtMs > beforeExpiry, 'el heartbeat debe extender la expiración');

    /* Sin toma: not-taken; ilegible: corrupt. */
    const none = await touchTakeover(root, `${TASK}-none`, { by: 'buffy' });
    assert.equal(none.status, 'not-taken');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('foreignTakeoverDecision bloquea solo tomas activas ajenas', async () => {
  const now = Date.now();
  const fresh = { takenBy: 'otro', takenAtMs: now, expiresAtMs: now + 3_600_000 };
  const mine = { takenBy: 'yo', takenAtMs: now, expiresAtMs: now + 3_600_000 };
  const stale = staleEntry('x', 'fantasma');

  assert.equal(foreignTakeoverDecision({ entry: fresh, agent: 'yo', nowMs: now }).blocked, true);
  assert.equal(foreignTakeoverDecision({ entry: fresh, agent: 'yo', nowMs: now }).reason, 'active-foreign');
  assert.equal(foreignTakeoverDecision({ entry: mine, agent: 'yo', nowMs: now }).blocked, false);
  assert.equal(foreignTakeoverDecision({ entry: stale, agent: 'yo', nowMs: now }).blocked, false);
  assert.equal(foreignTakeoverDecision({ entry: null, agent: 'yo', nowMs: now }).blocked, false);
  assert.equal(foreignTakeoverDecision({ entry: CORRUPT_TAKEOVER, agent: 'yo', nowMs: now }).blocked, false);
});

test('listActiveForeignTakeovers filtra las propias y las expiradas', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'glory-takeover-'));
  try {
    await takeTask(root, TASK, { by: 'buffy', nowMs: Date.now() });
    const otherTask = `${TASK}-otra`;
    await takeTask(root, otherTask, { by: 'otro', nowMs: Date.now() });
    const staleTask = `${TASK}-stale`;
    await mkdir(path.dirname(registryPath(root, staleTask)), { recursive: true });
    await writeFile(registryPath(root, staleTask), `${JSON.stringify(staleEntry(staleTask))}\n`, 'utf8');

    const foreign = await listActiveForeignTakeovers(root, 'buffy');
    assert.equal(foreign.length, 1);
    assert.equal(foreign[0].taskId, otherTask);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('sanitizeTaskId y reminders distinguen estados sin entradas extrañas', () => {
  assert.equal(sanitizeTaskId('297A-18'), '297A-18');
  assert.equal(sanitizeTaskId('T.1_2'), 'T.1_2');
  assert.throws(() => sanitizeTaskId('../evil'));
  assert.throws(() => sanitizeTaskId('a\nb'));
  assert.throws(() => sanitizeTaskId(''));

  assert.equal(isStale(staleEntry('x')), true);
  assert.equal(isStale(null), false);

  const [noEntry] = takeoverReminders({ taskId: 'X-1', entry: null });
  assert.match(noEntry, /task:take/);
  const [corrupt] = takeoverReminders({ taskId: 'X-1', entry: CORRUPT_TAKEOVER });
  assert.match(corrupt, /ilegible/);
  const [own] = takeoverReminders({ taskId: 'X-1', entry: staleEntry('X-1', 'yo'), agent: 'yo', nowMs: Date.now() });
  assert.match(own, /task:release/);
  const [foreign] = takeoverReminders({ taskId: 'X-1', entry: staleEntry('X-1', 'otro'), agent: 'yo', nowMs: Date.now() });
  assert.match(foreign, /expirado|olvidó/);
});
