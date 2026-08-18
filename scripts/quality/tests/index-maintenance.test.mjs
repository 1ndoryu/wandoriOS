import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  normalizeIndexRetention,
  pruneIndexDirs,
  runIndexMaintenanceBestEffort,
} from '../index-maintenance.mjs';

/* Crea una rama con un índice `varsense` de `sizeBytes` y mtime fijado (por
 * edad o reciente). measureDir usa el mtime de los ARCHIVOS, así que el mtime
 * se fija en el archivo y en el directorio. */
async function makeBranch(root, branchKey, indexPath, mtimeMs, sizeBytes = 1024) {
  const cachePath = path.join(root, '.quality-reports', 'branches', branchKey, 'cache');
  const target = path.join(cachePath, indexPath);
  await mkdir(path.dirname(target), { recursive: true });
  await mkdir(target, { recursive: true });
  const filePath = path.join(target, 'entry.bin');
  await writeFile(filePath, 'x'.repeat(sizeBytes), 'utf8');
  const mtime = new Date(mtimeMs);
  await utimes(filePath, mtime, mtime);
  await utimes(target, mtime, mtime);
  return target;
}

const nowMs = Date.parse('2026-08-05T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test('normalizeIndexRetention aplica defaults y valida rangos', () => {
  const defaults = normalizeIndexRetention();
  assert.equal(defaults.maxAgeMs, 7 * DAY);
  assert.equal(defaults.maxBytes, 256 * 1024 * 1024);
  assert.equal(defaults.throttleMs, 6 * HOUR);
  const custom = normalizeIndexRetention({ maxAgeDays: 3, maxMiB: 10, throttleHours: 1 });
  assert.equal(custom.maxAgeMs, 3 * DAY);
  assert.equal(custom.maxBytes, 10 * 1024 * 1024);
  assert.equal(custom.throttleMs, HOUR);
  assert.throws(() => normalizeIndexRetention({ maxAgeDays: 0 }));
  assert.throws(() => normalizeIndexRetention({ maxMiB: 0 }));
  assert.throws(() => normalizeIndexRetention({ throttleHours: 0 }));
});

test('pruneIndexDirs elimina indices viejos por edad y conserva el actual', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-index-age-'));
  try {
    await makeBranch(root, 'branch-A', 'varsense', nowMs - 10 * DAY);
    await makeBranch(root, 'branch-B', 'varsense', nowMs - 2 * DAY);
    const result = await pruneIndexDirs({
      projectRoot: root,
      currentBranchKey: 'branch-B',
      config: { maxAgeDays: 7 },
      now: nowMs,
    });
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].branchKey, 'branch-A');
    assert.equal(result.removed[0].reason, 'age');
    /* El índice del branch actual (branch-B) nunca se toca. */
    assert.ok(!result.removed.some(item => item.branchKey === 'branch-B'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pruneIndexDirs poda por cuota solo lo mas antiguo y nunca lo recien escrito', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-index-quota-'));
  try {
    await makeBranch(root, 'branch-A', 'varsense', nowMs - 8 * DAY, 900 * 1024); /* ~900 KiB */
    await makeBranch(root, 'branch-B', 'varsense', nowMs - 3 * DAY, 900 * 1024);
    await makeBranch(root, 'branch-C', 'varsense', nowMs - 10 * 60 * 1000, 900 * 1024); /* reciente */
    const result = await pruneIndexDirs({
      projectRoot: root,
      currentBranchKey: 'branch-Z', /* ninguno es el actual */
      config: { maxAgeDays: 30, maxMiB: 5 }, /* 5 MiB > 2.7 MiB acumulados: no dispara */
      now: nowMs,
    });
    /* Sin sobre cuota ni edad: nada se borra por quota. */
    assert.equal(result.removed.length, 0);
    /* Cuota de 1 MiB: se elimina solo lo elegible (A y B, el más antiguo
     * primero); C es reciente y queda protegido. */
    const result2 = await pruneIndexDirs({
      projectRoot: root,
      currentBranchKey: 'branch-Z',
      config: { maxAgeDays: 30, maxMiB: 1 },
      now: nowMs,
    });
    assert.ok(result2.removed.length >= 1);
    assert.equal(result2.removed[0].branchKey, 'branch-A', 'cuota elimina el más antiguo primero');
    assert.ok(result2.removed.every(item => item.branchKey !== 'branch-C'), 'índice reciente protegido');
    assert.ok(result2.protectedBranches.includes('branch-C'));
    assert.ok(result2.overQuota);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pruneIndexDirs con dryRun no borra nada', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-index-dry-'));
  try {
    await makeBranch(root, 'branch-A', 'varsense', nowMs - 10 * DAY);
    const result = await pruneIndexDirs({
      projectRoot: root,
      currentBranchKey: 'branch-B',
      config: { maxAgeDays: 7 },
      now: nowMs,
      dryRun: true,
    });
    assert.equal(result.removed.length, 1);
    assert.equal(result.dryRun, true);
    await access(path.join(root, '.quality-reports', 'branches', 'branch-A', 'cache', 'varsense'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runIndexMaintenanceBestEffort respeta el throttle y no bloquea en error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-index-stage-'));
  try {
    const first = await runIndexMaintenanceBestEffort({
      projectRoot: root,
      currentBranchKey: 'branch-B',
      config: { throttleHours: 1 },
      now: nowMs,
      mark: async () => {},
      shouldRun: async () => true,
      prune: async () => ({ removed: [], status: 'pass' }),
    });
    assert.equal(first.status, 'pass');
    /* Cooldown: el marcador se escribió, la ventana no ha pasado. */
    const cooldown = await runIndexMaintenanceBestEffort({
      projectRoot: root,
      currentBranchKey: 'branch-B',
      config: { throttleHours: 1 },
      now: nowMs + 5 * 60 * 1000,
      mark: async () => {},
      shouldRun: async () => false,
    });
    assert.equal(cooldown.skipped, 'cooldown');
    /* Un fallo de filesystem no lanza: vuelve error no bloqueante. */
    const broken = await runIndexMaintenanceBestEffort({
      projectRoot: root,
      currentBranchKey: 'branch-B',
      config: { throttleHours: 1 },
      prune: async () => { throw new Error('disk'); },
      shouldRun: async () => true,
    });
    assert.equal(broken.status, 'error');
    assert.match(broken.message, /disk/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pruneIndexDirs protege la rama con lock de tarea activo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-index-lock-'));
  try {
    await makeBranch(root, 'branch-A', 'varsense', nowMs - 10 * DAY);
    /* Lock activo (pid propio vivo) en branch-A. */
    const lockPath = path.join(root, '.quality-reports', 'branches', 'branch-A', 'locks', 'T-1.lock');
    await mkdir(lockPath, { recursive: true });
    await writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
      pid: process.pid, startedAt: new Date(nowMs).toISOString(),
    }), 'utf8');
    const result = await pruneIndexDirs({
      projectRoot: root,
      currentBranchKey: 'branch-B',
      config: { maxAgeDays: 7 },
      now: nowMs,
    });
    assert.equal(result.removed.length, 0, 'rama con lock activo nunca se poda');
    assert.ok(result.protectedBranches.includes('branch-A'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('pruneIndexDirs rechaza un reportsRoot fuera del workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-index-safe-'));
  try {
    await assert.rejects(
      () => pruneIndexDirs({
        projectRoot: root,
        currentBranchKey: 'b',
        reportsRoot: path.join(os.tmpdir(), 'fuera'),
        now: nowMs,
      }),
      /fuera del namespace permitido/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
