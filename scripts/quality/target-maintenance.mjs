import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveTargetBase } from './heavy-run-guard.mjs';

const execFileAsync = promisify(execFile);

const DEFAULT_MAX_BYTES = 15 * 1024 ** 3;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/* [028A-6] La cuota se comprueba en cada gate. El intervalo solo conserva
 * la retención por edad para consumidores que explícitamente la soliciten;
 * no puede retrasar el control del límite físico. */
const DEFAULT_MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/* [028A-6] Presupuesto del pase automático: si excede, se informa
 * `truncated` y el gate nunca se cuelga en el mantenimiento. */
export const DEFAULT_MAINTENANCE_BUDGET_MS = 60_000;
/* [028A-6] Escritura reciente: un target que cargo/rustc está recompilando
 * ahora no se protege por ruta de ejecutable (cargo.exe vive en .rustup),
 * solo por mtime. Se preserva durante la ventana de seguridad y se informa
 * como activo si impide cumplir la cuota. */
export const RECENT_WRITE_MS = 30 * 60 * 1000;

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch { return fallback; }
}

function normalizePath(filePath) {
  return path.resolve(filePath).replace(/\\/g, '/').toLowerCase();
}

/* [028A-6] Rutas de ejecutables de procesos vivos (Windows). Un target en
 * uso — p. ej. un `cargo run` lanzado directamente, sin marcador del guard —
 * se protege comparando el prefijo del ejecutable: borrar `debug/` mientras
 * `glory-backend.exe` corre desde ahí rompería el proceso en ejecución. */
async function runningProcessPaths() {
  const paths = new Set();
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath } | ForEach-Object { $_.ExecutablePath }',
      ], { timeout: 10_000, windowsHide: true });
      for (const line of stdout.split(/\r?\n/)) {
        const candidate = line.trim();
        if (candidate) paths.add(normalizePath(candidate));
      }
    } catch { /* Sin acceso a WMI: se depende de los marcadores del guard. */ }
  } else {
    try {
      const { stdout } = await execFileAsync('ps', ['-eo', 'comm'], { timeout: 10_000 });
      for (const line of stdout.split(/\r?\n/)) {
        const candidate = line.trim();
        if (candidate) paths.add(normalizePath(candidate));
      }
    } catch { /* Fallback sin procesos: se depende de los marcadores. */ }
  }
  return paths;
}

async function pathSize(root, budgetDeadlineMs = Infinity) {
  let total = 0;
  let latestMs = 0;
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch { return { size: total, latestMs, truncated: false }; }
  for (const entry of entries) {
    if (Date.now() > budgetDeadlineMs) return { size: total, latestMs, truncated: true };
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await pathSize(target, budgetDeadlineMs);
      total += nested.size;
      latestMs = Math.max(latestMs, nested.latestMs);
      if (nested.truncated) return { size: total, latestMs, truncated: true };
    } else {
      try {
        const details = await stat(target);
        total += details.size;
        latestMs = Math.max(latestMs, details.mtimeMs);
      } catch { /* Archivo concurrente: se medirá en la siguiente ejecución. */ }
    }
  }
  return { size: total, latestMs, truncated: false };
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function activeMarkers(target) {
  const markers = [];
  const entries = await readdir(target, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.filter(item => item.isDirectory())) {
    const children = await readdir(path.join(target, entry.name), { withFileTypes: true }).catch(() => []);
    for (const child of children.filter(item => item.name.startsWith('.glory-cargo-active-') && item.name.endsWith('.json'))) {
      const markerPath = path.join(target, entry.name, child.name);
      const marker = await readJson(markerPath, null);
      if (pidAlive(Number(marker?.pid))) markers.push({ target: entry.name, pid: Number(marker.pid), path: markerPath });
      else await rm(markerPath, { force: true }).catch(() => {});
    }
  }
  return markers;
}

function assertSafeTargetRoot(targetRoot) {
  const resolved = path.resolve(targetRoot);
  const normalized = resolved.replace(/\\/g, '/').toLowerCase();
  const safeSuffix = normalized.endsWith('/glory-target');
  const parentIsTmp = path.basename(path.dirname(resolved)).toLowerCase() === 'tmp';
  if (!safeSuffix || !parentIsTmp || normalized === '/' || normalized.length < 12) {
    throw new Error(`Target root rechazado por seguridad: ${resolved}`);
  }
  return resolved;
}

async function loadPolicy(projectRoot) {
  const config = await readJson(path.join(projectRoot, 'quality.config.json'), {});
  const policy = config.heavyRun ?? {};
  const maxTargetBytes = Number(policy.maxTargetGb) > 0 ? Number(policy.maxTargetGb) * 1024 ** 3 : DEFAULT_MAX_BYTES;
  const maxAgeMs = Number(policy.maxTargetAgeDays) > 0 ? Number(policy.maxTargetAgeDays) * 24 * 60 * 60 * 1000 : DEFAULT_MAX_AGE_MS;
  return { maxTargetBytes, maxAgeMs };
}

export async function lastMaintenanceAt(targetRoot = resolveTargetBase()) {
  const marker = await readJson(path.join(targetRoot, '.glory-target-maintenance.json'), null);
  return Number(marker?.lastRunAt) || 0;
}

export async function shouldRunMaintenance({ targetRoot = resolveTargetBase(), now = Date.now(), intervalMs = DEFAULT_MAINTENANCE_INTERVAL_MS } = {}) {
  return now - await lastMaintenanceAt(targetRoot) >= intervalMs;
}

export async function markMaintenanceRun(targetRoot = resolveTargetBase(), now = Date.now()) {
  await writeFile(path.join(targetRoot, '.glory-target-maintenance.json'), `${JSON.stringify({ lastRunAt: now }, null, 2)}\n`, 'utf8');
}

async function cleanupTargetsUnlocked({
  projectRoot = process.cwd(),
  targetRoot = resolveTargetBase(),
  now = Date.now(),
  dryRun = false,
  budgetMs,
  processPaths = null,
} = {}) {
  const safeRoot = assertSafeTargetRoot(targetRoot);
  const policy = await loadPolicy(projectRoot);
  await mkdir(safeRoot, { recursive: true });
  const ownershipPath = path.join(safeRoot, '.glory-target-root.json');
  const ownership = await readJson(ownershipPath, null);
  if (!ownership && !dryRun) {
    await writeFile(ownershipPath, `${JSON.stringify({ version: 1, managedBy: 'glory-quality', projectRoot: path.resolve(projectRoot), createdAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  }
  const markers = await activeMarkers(safeRoot);
  const activeFromMarkers = new Set(markers.map(item => item.target));
  /* [028A-6] Protección doble: marcadores del guard + ejecutables en uso.
   * Un binario corriendo desde `candidate` lo marca activo sin importar su
   * mtime; nunca se borra un target del que un proceso vivo está cargado. */
  const liveProcesses = processPaths ?? await runningProcessPaths();
  const budgetDeadline = budgetMs ? Date.now() + budgetMs : Infinity;
  const entries = await readdir(safeRoot, { withFileTypes: true });
  const candidates = [];
  let truncated = false;
  const failed = [];
  for (const entry of entries.filter(item => item.isDirectory())) {
    const fullPath = path.join(safeRoot, entry.name);
    const details = await stat(fullPath).catch(() => null);
    if (!details) continue;
    const measurement = await pathSize(fullPath, budgetDeadline);
    if (measurement.truncated) { truncated = true; break; }
    const runningFrom = [...liveProcesses].some(executable => executable.startsWith(normalizePath(fullPath) + '/'));
    const lastWriteMs = Math.max(details.mtimeMs, measurement.latestMs);
    const recentlyWritten = now - lastWriteMs < RECENT_WRITE_MS;
    candidates.push({
      name: entry.name,
      path: fullPath,
      bytes: measurement.size,
      lastWriteMs,
      active: activeFromMarkers.has(entry.name) || runningFrom || recentlyWritten,
      activeReason: activeFromMarkers.has(entry.name)
        ? 'marker'
        : runningFrom
          ? 'process'
          : recentlyWritten
            ? 'recent-write'
            : null,
    });
  }
  let totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  const removed = [];
  for (const candidate of candidates
    .filter(item => !item.active)
    .sort((left, right) => left.lastWriteMs - right.lastWriteMs)) {
    if (Date.now() > budgetDeadline) { truncated = true; break; }
    const tooOld = now - candidate.lastWriteMs > policy.maxAgeMs;
    const overQuota = totalBytes > policy.maxTargetBytes;
    if (!tooOld && !overQuota) continue;
    if (dryRun) {
      removed.push({ name: candidate.name, bytes: candidate.bytes, reason: tooOld ? 'age' : 'quota' });
      totalBytes -= candidate.bytes;
      continue;
    }
    try {
      await rm(candidate.path, { recursive: true, force: true });
      removed.push({ name: candidate.name, bytes: candidate.bytes, reason: tooOld ? 'age' : 'quota' });
      totalBytes -= candidate.bytes;
    } catch (error) {
      failed.push({ name: candidate.name, bytes: candidate.bytes, reason: tooOld ? 'age' : 'quota', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return {
    targetRoot: safeRoot,
    maxTargetBytes: policy.maxTargetBytes,
    totalBytes,
    active: [...new Set(candidates.filter(item => item.active).map(item => item.name))],
    activeDetails: candidates.filter(item => item.active).map(item => ({ name: item.name, reason: item.activeReason })),
    removed,
    failed,
    dryRun,
    truncated,
    scanIncomplete: truncated,
    quotaExceeded: truncated || totalBytes > policy.maxTargetBytes,
  };
}

const MAINTENANCE_LOCK_TTL_MS = 10 * 60 * 1000;

async function acquireMaintenanceLock(targetRoot) {
  const lockRoot = path.join(path.dirname(targetRoot), 'glory-quality-guard');
  const lockPath = path.join(lockRoot, 'target-maintenance.lock');
  await mkdir(lockRoot, { recursive: true });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const token = crypto.randomUUID();
    try {
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, 'owner.json'), `${JSON.stringify({ token, pid: process.pid, startedAt: Date.now() })}\n`, 'utf8');
      return async () => {
        const owner = await readJson(path.join(lockPath, 'owner.json'), null);
        if (owner?.token === token) await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const owner = await readJson(path.join(lockPath, 'owner.json'), null);
      const age = Date.now() - Number(owner?.startedAt || 0);
      if (owner && pidAlive(Number(owner.pid)) && age <= MAINTENANCE_LOCK_TTL_MS) {
        throw new Error(`mantenimiento de targets concurrente (PID ${owner.pid})`);
      }
      const stalePath = `${lockPath}.stale-${process.pid}-${Date.now()}`;
      try {
        await rename(lockPath, stalePath);
        await rm(stalePath, { recursive: true, force: true });
      } catch (takeoverError) {
        if (takeoverError?.code !== 'ENOENT') throw takeoverError;
      }
    }
  }
  throw new Error('no se pudo adquirir el lock de mantenimiento de targets');
}

export async function cleanupTargets(options = {}) {
  const targetRoot = assertSafeTargetRoot(options.targetRoot ?? resolveTargetBase());
  const release = await acquireMaintenanceLock(targetRoot);
  try {
    return await cleanupTargetsUnlocked({ ...options, targetRoot });
  } finally {
    await release();
  }
}

const argv = process.argv.slice(2);
if (argv.includes('--cleanup') || argv.includes('--dry-run')) {
  /* [028A-6] El comando manual fuerza el pase completo y sin presupuesto;
   * el gate usa presupuesto para no quedar bloqueado inspeccionando artefactos
   * enormes. */
  const dryRun = argv.includes('--dry-run') && !argv.includes('--cleanup');
  const result = await cleanupTargets({ dryRun });
  if (!dryRun) await markMaintenanceRun(result.targetRoot);
  console.log(JSON.stringify(result, null, 2));
  if (!dryRun && (result.quotaExceeded || result.failed?.length > 0)) process.exitCode = 75;
}
