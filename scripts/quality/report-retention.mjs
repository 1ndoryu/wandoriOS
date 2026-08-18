import { lstat, mkdir, readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';

export const REPORT_RETENTION_DEFAULTS = Object.freeze({
  maxAgeDays: 7,
  maxWorkspaceMiB: 512,
  maxBranchMiB: 128,
});
const ACTIVE_LOCK_TTL_MS = 10 * 60 * 1000;
const MIN_QUOTA_AGE_MS = 60 * 60 * 1000;
const TEMP_PATTERN = /^(?:\.tmp-|.*\.tmp)$/u;

function bytesFromMiB(value, label) {
  if (!Number.isFinite(value) || value < 1 || value > 1024 * 1024) {
    throw new Error(`reportRetention.${label} inválido`);
  }
  return Math.floor(value * 1024 * 1024);
}

export function normalizeReportRetention(config = {}) {
  const values = { ...REPORT_RETENTION_DEFAULTS, ...config };
  if (!Number.isFinite(values.maxAgeDays) || values.maxAgeDays < 1 || values.maxAgeDays > 365) {
    throw new Error('reportRetention.maxAgeDays inválido');
  }
  return {
    maxAgeMs: values.maxAgeDays * 24 * 60 * 60 * 1000,
    maxWorkspaceBytes: bytesFromMiB(values.maxWorkspaceMiB, 'maxWorkspaceMiB'),
    maxBranchBytes: bytesFromMiB(values.maxBranchMiB, 'maxBranchMiB'),
  };
}

async function readOwner(lockPath) {
  try { return JSON.parse(await readFile(path.join(lockPath, 'owner.json'), 'utf8')); }
  catch { return null; }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error?.code === 'EPERM'; }
}

function ownerIsActive(owner, now) {
  if (!owner) return false;
  const startedAt = Date.parse(owner.startedAt);
  return pidAlive(Number(owner.pid)) || (Number.isFinite(startedAt) && now - startedAt <= ACTIVE_LOCK_TTL_MS);
}

async function inspectTree(root, now, { isLockTree = false } = {}) {
  const rootMetadata = await lstat(root).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (rootMetadata?.isSymbolicLink()) throw new Error(`namespace de retención symlink rechazado: ${root}`);
  let bytes = 0;
  let newestMs = 0;
  let hasRecentWrite = false;
  let activeLock = false;
  let staleLock = false;
  let protectedTemp = false;
  let exists = true;
  let entries = [];
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === 'ENOENT') return { bytes, newestMs, hasRecentWrite, activeLock, staleLock, protectedTemp, exists: false };
    throw error;
  }
  if (isLockTree) {
    const owner = await readOwner(root);
    const startedAt = Date.parse(owner?.startedAt);
    activeLock = ownerIsActive(owner, now);
    staleLock = Boolean(owner && !activeLock && Number.isFinite(startedAt) && now - startedAt > ACTIVE_LOCK_TTL_MS);
  }
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    const metadata = await lstat(target);
    if (metadata.isSymbolicLink()) continue;
    /* `mtime` representa la última escritura del reporte. `ctime` cambia al
     * crear/chmod en Windows y no debe mantener vivo un resultado antiguo. */
    const modifiedMs = metadata.mtimeMs;
    newestMs = Math.max(newestMs, modifiedMs);
    if (now - modifiedMs <= ACTIVE_LOCK_TTL_MS) hasRecentWrite = true;
    if (TEMP_PATTERN.test(entry.name) && now - modifiedMs <= ACTIVE_LOCK_TTL_MS) protectedTemp = true;
    if (entry.isDirectory()) {
      if (isLockTree && ownerIsActive(await readOwner(target), now)) activeLock = true;
      const child = await inspectTree(target, now, { isLockTree });
      bytes += child.bytes;
      newestMs = Math.max(newestMs, child.newestMs);
      hasRecentWrite ||= child.hasRecentWrite;
      activeLock ||= child.activeLock;
      staleLock ||= child.staleLock;
      protectedTemp ||= child.protectedTemp;
    } else if (entry.isFile()) {
      bytes += metadata.size;
    }
  }
  return { bytes, newestMs, hasRecentWrite, activeLock, staleLock, protectedTemp, exists };
}

async function assertReportsRoot(workspaceRoot, reportsRoot) {
  const qualityRoot = path.resolve(workspaceRoot, '.quality-reports');
  const expected = path.join(qualityRoot, 'branches');
  const actual = path.resolve(reportsRoot);
  if (actual !== expected) throw new Error('reportRoot fuera del namespace permitido');

  for (const parent of [qualityRoot, actual]) {
    const existing = await lstat(parent).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (existing?.isSymbolicLink()) throw new Error('reportRoot no puede ser symlink');
  }
  await mkdir(actual, { recursive: true });
  const resolved = await realpath(actual);
  if (path.resolve(resolved) !== expected) throw new Error('reportRoot resuelve fuera del workspace');
  return actual;
}

async function assertBeforeRemove(workspaceRoot, target) {
  const qualityRoot = path.resolve(workspaceRoot, '.quality-reports');
  const resolved = await realpath(target);
  const relative = path.relative(qualityRoot, resolved);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('target de retención fuera de .quality-reports');
  }
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new Error('target de retención no puede ser symlink');
}

async function removeTreeSafely(projectRoot, target) {
  try {
    await assertBeforeRemove(projectRoot, target);
    await rm(target, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

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
