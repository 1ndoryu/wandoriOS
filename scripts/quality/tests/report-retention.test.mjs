import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pruneReportBranches } from '../report-retention.mjs';

async function branch(root, key, bytes, timestamp) {
  const target = path.join(root, key, 'T-1');
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, 'latest.json'), 'x'.repeat(bytes), 'utf8');
  const date = new Date(timestamp);
  await utimes(target, date, date);
  await utimes(path.join(target, 'latest.json'), date, date);
  await utimes(path.dirname(target), date, date);
}

test('retención dry-run informa y no borra la rama activa', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-retention-'));
  const reportsRoot = path.join(projectRoot, '.quality-reports', 'branches');
  const now = Date.now();
  try {
    await branch(reportsRoot, 'active--1111111111111111', 32, now);
    await branch(reportsRoot, 'old--2222222222222222', 64, now - 10 * 24 * 60 * 60 * 1000);
    const result = await pruneReportBranches({
      projectRoot,
      currentBranchKey: 'active--1111111111111111',
      config: { maxAgeDays: 7, maxWorkspaceMiB: 1, maxBranchMiB: 1 },
      now,
      dryRun: true,
    });
    assert.equal(result.dryRun, true);
    assert.deepEqual(result.removed.map(item => item.branchKey), ['old--2222222222222222']);
    assert.equal(result.currentBranchKey, 'active--1111111111111111');
    assert.ok(result.protectedBranches.includes('active--1111111111111111'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('retención aplicada elimina histórico elegible y rechaza root inseguro', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-retention-'));
  const reportsRoot = path.join(projectRoot, '.quality-reports', 'branches');
  const now = Date.now();
  try {
    await branch(reportsRoot, 'active--1111111111111111', 32, now);
    await branch(reportsRoot, 'old--2222222222222222', 64, now - 10 * 24 * 60 * 60 * 1000);
    const result = await pruneReportBranches({
      projectRoot,
      currentBranchKey: 'active--1111111111111111',
      config: { maxAgeDays: 7, maxWorkspaceMiB: 1, maxBranchMiB: 1 },
      now,
      dryRun: false,
    });
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].branchKey, 'old--2222222222222222');
    await assert.rejects(
      pruneReportBranches({ projectRoot, currentBranchKey: 'active', reportsRoot: path.join(projectRoot, 'outside'), config: {} }),
      /reportRoot fuera del namespace permitido/,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('temporales antiguos y locks huérfanos se pueden podar tras TTL', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-retention-'));
  const reportsRoot = path.join(projectRoot, '.quality-reports', 'branches');
  const branchRoot = path.join(reportsRoot, 'active--1111111111111111');
  const taskRoot = path.join(branchRoot, 'old-task');
  const lockRoot = path.join(branchRoot, 'locks', 'old-task.lock');
  const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
  try {
    await mkdir(taskRoot, { recursive: true });
    await mkdir(lockRoot, { recursive: true });
    const orphanLock = path.join(branchRoot, 'locks', 'orphan-task.lock');
    await mkdir(orphanLock, { recursive: true });
    await writeFile(path.join(taskRoot, 'latest.json.tmp'), 'abandoned');
    await writeFile(path.join(lockRoot, 'owner.json'), JSON.stringify({ pid: 99999999, token: 'dead', startedAt: old.toISOString() }));
    await writeFile(path.join(orphanLock, 'owner.json'), JSON.stringify({ pid: 99999999, token: 'orphan', startedAt: old.toISOString() }));
    await utimes(taskRoot, old, old);
    await utimes(path.join(taskRoot, 'latest.json.tmp'), old, old);
    await utimes(lockRoot, old, old);
    await utimes(orphanLock, old, old);
    const result = await pruneReportBranches({
      projectRoot,
      currentBranchKey: 'active--1111111111111111',
      currentTaskId: 'current-task',
      config: { maxAgeDays: 1, maxWorkspaceMiB: 1, maxBranchMiB: 1 },
      now: Date.now(),
      dryRun: false,
    });
    assert.ok(result.removed.some(item => item.taskId === 'old-task'));
    assert.ok(result.removed.some(item => item.reason === 'stale-lock'));
    assert.ok(result.removed.some(item => item.reason === 'orphan-lock'));
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
