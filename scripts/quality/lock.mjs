import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

const DEFAULT_WAIT_MS = 300_000;
const POLL_MS = 100;
const STALE_MS = 600_000;
const TASK_ID_PATTERN = /^\d{2}[1-9ABC][A-Z]-\d+$/;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function lockPath(context, taskId) {
  return path.join(context.locksRoot ?? path.join(context.projectRoot, '.quality-reports', 'locks'), `${taskId}.lock`);
}

async function readLock(lock) {
  try {
    return JSON.parse(await readFile(path.join(lock, 'owner.json'), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return { invalid: true };
  }
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function isValidOwner(owner) {
  return Boolean(
    owner
    && !owner.invalid
    && Number.isInteger(owner.pid)
    && owner.pid > 0
    && typeof owner.token === 'string'
    && owner.token.length > 0
    && typeof owner.startedAt === 'string'
    && Number.isFinite(Date.parse(owner.startedAt)),
  );
}

async function lockAge(lock, owner) {
  if (isValidOwner(owner)) return Math.max(0, Date.now() - Date.parse(owner.startedAt));
  try {
    return Date.now() - (await stat(lock)).mtimeMs;
  } catch {
    return STALE_MS + 1;
  }
}

async function removeStaleLock(lock) {
  const owner = await readLock(lock);
  const age = await lockAge(lock, owner);
  if (age <= STALE_MS) return false;
  if (owner?.invalid || (owner && !isValidOwner(owner))) {
    /* Un owner corrupto sigue siendo un lock activo hasta superar el TTL. */
    await rm(lock, { recursive: true, force: true });
    return true;
  }
  if (isValidOwner(owner) && isProcessRunning(owner.pid)) return false;
  await rm(lock, { recursive: true, force: true });
  return true;
}

export async function acquireTaskLock(context, taskId, waitMs = DEFAULT_WAIT_MS, options = {}) {
  if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
    throw new Error(`taskId inválido para quality lock: ${String(taskId)}`);
  }
  const lock = lockPath(context, taskId);
  const startedWaiting = Date.now();
  const token = randomUUID();
  await mkdir(path.dirname(lock), { recursive: true });

  while (true) {
    if (options.isCancelled?.()) {
      throw new Error('quality gate cancelado mientras esperaba el lock');
    }

    let created = false;
    try {
      await mkdir(lock);
      created = true;
      await writeFile(
        path.join(lock, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() })}\n`,
        { encoding: 'utf8', flag: 'wx' },
      );
      return async () => {
        const owner = await readLock(lock);
        if (owner?.token === token) await rm(lock, { recursive: true, force: true });
      };
    } catch (error) {
      if (created) {
        const owner = await readLock(lock);
        if (!owner || owner.invalid || owner.token === token) await rm(lock, { recursive: true, force: true });
      }
      if (error?.code !== 'EEXIST') throw error;
      if (await removeStaleLock(lock)) continue;
      if (Date.now() - startedWaiting >= waitMs) {
        throw new Error(`quality gate ocupado para ${taskId}; espera a que termine la ejecución activa`);
      }
      await sleep(POLL_MS);
    }
  }
}
