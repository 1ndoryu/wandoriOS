import { lstat, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { ACTIVE_LOCK_TTL_MS, MIN_QUOTA_AGE_MS, normalizeReportRetention, TEMP_PATTERN } from './report-retention-config.mjs';
import { assertBeforeRemove, assertReportsRoot, inspectTree, removeTreeSafely } from './report-retention-fs.mjs';

export { REPORT_RETENTION_DEFAULTS, normalizeReportRetention } from './report-retention-config.mjs';

async function branchEntries(reportsRoot) {
  const entries = await readdir(reportsRoot, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const target = path.join(reportsRoot, entry.name);
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) throw new Error(`namespace de rama symlink rechazado: ${target}`);
    result.push({ name: entry.name, path: target });
  }
  return result;
}

async function taskEntries(branchPath) {
  const entries = await readdir(branchPath, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'cache' || entry.name === 'locks') continue;
    const target = path.join(branchPath, entry.name);
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) throw new Error(`namespace de tarea symlink rechazado: ${target}`);
    result.push({ name: entry.name, path: target });
  }
  return result;
}

function canRemove(item, now, retention, reason = 'age') {
  const age = now - item.newestMs;
  const minimumAge = reason === 'quota' ? Math.max(MIN_QUOTA_AGE_MS, retention.maxAgeMs / 2) : retention.maxAgeMs;
  return !item.activeLock
    && !item.hasRecentWrite
    && !item.protectedTemp
    && age > minimumAge;
}

async function pruneOrphanLocks(projectRoot, branchPath, knownTaskNames, now, dryRun) {
  const locksPath = path.join(branchPath, 'locks');
  const entries = await readdir(locksPath, { withFileTypes: true }).catch(() => []);
  const removed = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || knownTaskNames.has(entry.name.replace(/\.lock$/u, ''))) continue;
    const target = path.join(locksPath, entry.name);
    const lock = await inspectTree(target, now, { isLockTree: true });
    if (!lock.staleLock || lock.activeLock) continue;
    removed.push({ bytes: lock.bytes, path: target, taskId: entry.name, reason: 'orphan-lock' });
    if (!dryRun) await removeTreeSafely(projectRoot, target);
  }
  return removed;
}

async function pruneOldCache(projectRoot, cachePath, now, retention, dryRun) {
  const entries = await readdir(cachePath, { withFileTypes: true }).catch(() => []);
  const removed = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const target = path.join(cachePath, entry.name);
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) continue;
    const old = now - metadata.mtimeMs > retention.maxAgeMs;
    const recentTemp = TEMP_PATTERN.test(entry.name) && now - metadata.mtimeMs <= ACTIVE_LOCK_TTL_MS;
    if (!old || recentTemp) continue;
    removed.push({ bytes: metadata.size, path: target, reason: TEMP_PATTERN.test(entry.name) ? 'stale-temp' : 'cache-age' });
    if (!dryRun) {
      try {
        await assertBeforeRemove(projectRoot, target);
        await rm(target, { force: true });
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
  return removed;
}

export async function pruneReportBranches({
  projectRoot,
  currentBranchKey,
  currentTaskId,
  reportsRoot = path.join(projectRoot, '.quality-reports', 'branches'),
  config,
  now = Date.now(),
  dryRun = false,
} = {}) {
  if (typeof projectRoot !== 'string' || typeof currentBranchKey !== 'string' || currentBranchKey.length === 0) {
    throw new Error('projectRoot y currentBranchKey son obligatorios');
  }
  const root = await assertReportsRoot(projectRoot, reportsRoot);
  const retention = normalizeReportRetention(config);
  const branches = [];
  for (const branch of await branchEntries(root)) {
    const tree = await inspectTree(branch.path, now);
    const locks = await inspectTree(path.join(branch.path, 'locks'), now, { isLockTree: true });
    branches.push({ ...branch, ...tree, activeLock: locks.activeLock, protected: branch.name === currentBranchKey });
  }

  const initialWorkspaceBytes = branches.reduce((total, branch) => total + branch.bytes, 0);
  let workspaceBytes = initialWorkspaceBytes;
  const removed = [];
  const current = branches.find(branch => branch.name === currentBranchKey);

  /* La rama activa no se borra completa, pero sí puede podar tareas antiguas. */
  if (current) {
    const tasks = [];
    for (const task of await taskEntries(current.path)) {
      const lockPath = path.join(current.path, 'locks', `${task.name}.lock`);
      const lock = await inspectTree(lockPath, now, { isLockTree: true });
      const tree = await inspectTree(task.path, now);
      tasks.push({ ...task, ...tree, lockPath, lock, activeLock: lock.activeLock });
    }
    let branchBytes = current.bytes;
    for (const task of tasks.sort((left, right) => left.newestMs - right.newestMs)) {
      const isCurrentTask = task.name === currentTaskId;
      const overBranch = branchBytes > retention.maxBranchBytes;
      if (isCurrentTask || task.activeLock || task.hasRecentWrite || task.protectedTemp) continue;
      const ageEligible = canRemove(task, now, retention, 'age');
      const quotaEligible = canRemove(task, now, retention, 'quota');
      if (!ageEligible && !(overBranch && quotaEligible)) continue;
      removed.push({ branchKey: current.name, taskId: task.name, bytes: task.bytes, reason: ageEligible ? 'age' : 'quota' });
      branchBytes -= task.bytes;
      workspaceBytes -= task.bytes;
      const staleLock = task.lock.exists && task.lock.staleLock;
      if (staleLock) {
        removed.push({ branchKey: current.name, taskId: task.name, bytes: task.lock.bytes, reason: 'stale-lock' });
        branchBytes -= task.lock.bytes;
        workspaceBytes -= task.lock.bytes;
      }
      if (!dryRun) {
        await removeTreeSafely(projectRoot, task.path);
        if (staleLock) await removeTreeSafely(projectRoot, task.lockPath);
      }
    }
    const orphanLocks = await pruneOrphanLocks(projectRoot, current.path, new Set(tasks.map(task => task.name)), now, dryRun);
    for (const item of orphanLocks) {
      branchBytes -= item.bytes;
      workspaceBytes -= item.bytes;
      removed.push({ branchKey: current.name, ...item });
    }
    const oldCache = await pruneOldCache(projectRoot, path.join(current.path, 'cache'), now, retention, dryRun);
    for (const item of oldCache) {
      branchBytes -= item.bytes;
      workspaceBytes -= item.bytes;
      removed.push({ branchKey: current.name, bytes: item.bytes, reason: item.reason, path: item.path });
    }
    current.bytes = branchBytes;
  }

  /* Una rama histórica reciente puede contener tareas antiguas: podarlas por
   * tarea evita que una sola ejecución nueva congele todo su namespace. */
  for (const branch of branches.filter(item => !item.protected)) {
    const tasks = await taskEntries(branch.path);
    for (const task of tasks) {
      const tree = await inspectTree(task.path, now);
      const ageEligible = canRemove(tree, now, retention, 'age');
      if (!ageEligible || tree.activeLock || tree.hasRecentWrite || tree.protectedTemp) continue;
      const lockPath = path.join(branch.path, 'locks', `${task.name}.lock`);
      const lock = await inspectTree(lockPath, now, { isLockTree: true });
      if (lock.activeLock) continue;
      removed.push({ branchKey: branch.name, taskId: task.name, bytes: tree.bytes, reason: 'age' });
      workspaceBytes -= tree.bytes;
      branch.bytes -= tree.bytes;
      const staleLock = lock.exists && lock.staleLock;
      if (staleLock) {
        removed.push({ branchKey: branch.name, taskId: task.name, bytes: lock.bytes, reason: 'stale-lock' });
        workspaceBytes -= lock.bytes;
        branch.bytes -= lock.bytes;
      }
      if (!dryRun) {
        await removeTreeSafely(projectRoot, task.path);
        if (staleLock) await removeTreeSafely(projectRoot, lockPath);
      }
    }
    const orphanLocks = await pruneOrphanLocks(projectRoot, branch.path, new Set(tasks.map(task => task.name)), now, dryRun);
    for (const item of orphanLocks) {
      workspaceBytes -= item.bytes;
      branch.bytes -= item.bytes;
      removed.push({ branchKey: branch.name, ...item });
    }
    const oldCache = await pruneOldCache(projectRoot, path.join(branch.path, 'cache'), now, retention, dryRun);
    for (const item of oldCache) {
      workspaceBytes -= item.bytes;
      branch.bytes -= item.bytes;
      removed.push({ branchKey: branch.name, bytes: item.bytes, reason: item.reason, path: item.path });
    }
  }

  const candidates = branches
    .filter(branch => branch.bytes > 0)
    .filter(branch => !branch.protected && !branch.activeLock && !branch.hasRecentWrite && !branch.protectedTemp)
    .sort((left, right) => left.newestMs - right.newestMs);
  for (const candidate of candidates) {
    const ageEligible = canRemove(candidate, now, retention, 'age');
    const quotaEligible = canRemove(candidate, now, retention, 'quota');
    const overWorkspace = workspaceBytes > retention.maxWorkspaceBytes;
    const overBranch = candidate.bytes > retention.maxBranchBytes;
    if (!ageEligible && !(quotaEligible && (overWorkspace || overBranch))) continue;
    removed.push({ branchKey: candidate.name, bytes: candidate.bytes, reason: ageEligible ? 'age' : 'quota' });
    workspaceBytes -= candidate.bytes;
    if (!dryRun) await removeTreeSafely(projectRoot, candidate.path);
  }

  const currentBranchBytes = current?.bytes ?? 0;
  return {
    dryRun,
    retention: {
      maxAgeMs: retention.maxAgeMs,
      maxWorkspaceBytes: retention.maxWorkspaceBytes,
      maxBranchBytes: retention.maxBranchBytes,
    },
    initialWorkspaceBytes,
    remainingBytes: workspaceBytes,
    workspaceBytes: workspaceBytes,
    currentBranchKey,
    currentBranchBytes,
    overQuota: currentBranchBytes > retention.maxBranchBytes || workspaceBytes > retention.maxWorkspaceBytes,
    removed,
    protectedBranches: branches.filter(branch => branch.protected || branch.activeLock || branch.hasRecentWrite || branch.protectedTemp).map(branch => branch.name),
  };
}
