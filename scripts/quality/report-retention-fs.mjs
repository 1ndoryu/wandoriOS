import { lstat, mkdir, readdir, readFile, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { ACTIVE_LOCK_TTL_MS, TEMP_PATTERN } from './report-retention-config.mjs';

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

export { assertBeforeRemove, assertReportsRoot, inspectTree, removeTreeSafely };
