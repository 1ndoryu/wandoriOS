import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/* [028A-8 Fase 4] Retención separada para los índices de analizadores
 * (hoy `varsense` bajo `<branch>/cache/`). Son caché regenerable, así que
 * nunca deben compartir cuota ni TTL con los targets de cargo
 * (`C:\tmp\glory-target`): borrar un índice solo cuesta re-parsear, y la
 * política se configura en quality.config.json `indexRetention`. */
export const INDEX_RETENTION_DEFAULTS = Object.freeze({
  maxAgeDays: 7,
  maxMiB: 256,
  throttleHours: 6,
});
/* [028A-8] Escritura reciente: un índice que un gate de otro agente acaba de
 * reescribir no se toca en la misma ventana, igual que los targets. */
export const RECENT_INDEX_WRITE_MS = 30 * 60 * 1000;
/* [028A-8] La poda por cuota exige una antigüedad mínima para no eliminar un
 * índice que la siguiente ejecución reutilizará de inmediato. */
export const MIN_QUOTA_AGE_MS = 60 * 60 * 1000;
const ACTIVE_LOCK_TTL_MS = 10 * 60 * 1000;

export function normalizeIndexRetention(config = {}) {
  const values = { ...INDEX_RETENTION_DEFAULTS, ...config };
  if (!Number.isInteger(values.maxAgeDays) || values.maxAgeDays < 1 || values.maxAgeDays > 365) {
    throw new Error('indexRetention.maxAgeDays debe ser un entero entre 1 y 365');
  }
  if (!Number.isInteger(values.maxMiB) || values.maxMiB < 1 || values.maxMiB > 1024 * 1024) {
    throw new Error('indexRetention.maxMiB inválido');
  }
  if (!Number.isInteger(values.throttleHours) || values.throttleHours < 1 || values.throttleHours > 24 * 30) {
    throw new Error('indexRetention.throttleHours debe ser un entero entre 1 y 720');
  }
  return {
    maxAgeMs: values.maxAgeDays * 24 * 60 * 60 * 1000,
    maxBytes: values.maxMiB * 1024 * 1024,
    throttleMs: values.throttleHours * 60 * 60 * 1000,
  };
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); }
  catch { return fallback; }
}

/* [028A-8] Un gate en curso (otro agente) deja `locks/<task>.lock/owner.json`
 * con pid vivo o inicio reciente; esa rama no se toca para no romper una
 * ejecución concurrente que está reescribiendo su índice. */
async function branchHasActiveLock(branchPath, now) {
  const locksRoot = path.join(branchPath, 'locks');
  const entries = await readdir(locksRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const owner = await readJson(path.join(locksRoot, entry.name, 'owner.json'), null);
    if (!owner) continue;
    const startedAt = Date.parse(owner.startedAt);
    if (pidAlive(Number(owner.pid))) return true;
    if (Number.isFinite(startedAt) && now - startedAt <= ACTIVE_LOCK_TTL_MS) return true;
  }
  return false;
}

async function measureDir(root, budgetDeadlineMs = Infinity) {
  let bytes = 0;
  let newestMs = 0;
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (Date.now() > budgetDeadlineMs) return { bytes, newestMs, truncated: true };
    const target = path.join(root, entry.name);
    try {
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        const nested = await measureDir(target, budgetDeadlineMs);
        bytes += nested.bytes;
        newestMs = Math.max(newestMs, nested.newestMs);
        if (nested.truncated) return { bytes, newestMs, truncated: true };
      } else {
        bytes += metadata.size;
        newestMs = Math.max(newestMs, metadata.mtimeMs);
      }
    } catch { /* Archivo concurrente: se medirá en la siguiente ejecución. */ }
  }
  return { bytes, newestMs, truncated: false };
}

/* [028A-8] Namespace seguro: solo directorios reales (nunca symlinks) bajo
 * `.quality-reports/branches/` del workspace. Igual que report-retention:
 * se valida con realpath y se rechazan los padres symlink, porque lstat de
 * una ruta hija sigue a los padres symlink y rm() recursivo podría escapar
 * del workspace. */
async function assertBranchesRoot(workspaceRoot, reportsRoot) {
  const qualityRoot = path.resolve(workspaceRoot, '.quality-reports');
  const expected = path.join(qualityRoot, 'branches');
  const actual = path.resolve(reportsRoot);
  if (actual !== expected) throw new Error('index reportsRoot fuera del namespace permitido');
  for (const parent of [qualityRoot, actual]) {
    const existing = await lstat(parent).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (existing?.isSymbolicLink()) throw new Error('index reportsRoot no puede ser symlink');
  }
  await mkdir(actual, { recursive: true });
  const resolved = await realpath(actual);
  if (path.resolve(resolved) !== expected) throw new Error('index reportsRoot resuelve fuera del workspace');
  return actual;
}

/* [028A-8] Antes de borrar se re-verifica la contención con realpath: cierra
 * la ventana entre la medición y la eliminación (swap por symlink). */
async function assertBeforeRemove(workspaceRoot, target) {
  const qualityRoot = path.resolve(workspaceRoot, '.quality-reports');
  const resolved = await realpath(target);
  const relative = path.relative(qualityRoot, resolved);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('target de índice fuera de .quality-reports');
  }
  const metadata = await lstat(target);
  if (metadata.isSymbolicLink()) throw new Error('target de índice no puede ser symlink');
}

async function indexCandidates(branchesRoot, now, budgetDeadlineMs) {
  const candidates = [];
  const locked = [];
  let truncated = false;
  const branches = await readdir(branchesRoot, { withFileTypes: true }).catch(() => []);
  for (const branch of branches) {
    if (Date.now() > budgetDeadlineMs) return { candidates, locked, truncated: true };
    if (!branch.isDirectory()) continue;
    const branchPath = path.join(branchesRoot, branch.name);
    const branchMeta = await lstat(branchPath);
    if (branchMeta.isSymbolicLink()) continue;
    /* [028A-8] Rama con gate concurrente (o el propio gate en curso): se omite
     * completa y queda visible en protectedBranches para el reporte. */
    if (await branchHasActiveLock(branchPath, now)) { locked.push(branch.name); continue; }
    const cachePath = path.join(branchPath, 'cache');
    const entries = await readdir(cachePath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (Date.now() > budgetDeadlineMs) return { candidates, locked, truncated: true };
      /* [028A-8] Los índices son los directorios del cache por rama (p. ej.
       * `varsense`); los `.json` de etapa los gestiona la retención de
       * reportes (pruneOldCache), no este módulo. */
      if (!entry.isDirectory()) continue;
      const indexPath = path.join(cachePath, entry.name);
      const indexMeta = await lstat(indexPath);
      if (indexMeta.isSymbolicLink()) continue;
      const measured = await measureDir(indexPath, budgetDeadlineMs);
      if (measured.truncated) return { candidates, locked, truncated: true };
      const newestMs = measured.newestMs || indexMeta.mtimeMs;
      candidates.push({
        branchKey: branch.name,
        name: entry.name,
        path: indexPath,
        bytes: measured.bytes,
        newestMs,
        recentlyWritten: now - newestMs <= RECENT_INDEX_WRITE_MS,
      });
    }
  }
  return { candidates, locked, truncated };
}

/* [028A-8 Fase 4] Poda de índices por TTL (maxAgeDays) y cuota separada
 * (maxMiB). Nunca borra un índice con lock activo en la rama, ni uno escrito
 * en la última media hora; el directorio del branch actual (o cualquier otro)
 * se reescribe al siguiente gate y queda protegido por RECENT_INDEX_WRITE_MS.
 * Eliminar un índice solo cuesta un re-parseo: es caché regenerable. */
export async function pruneIndexDirs({
  projectRoot,
  currentBranchKey,
  reportsRoot = path.join(projectRoot, '.quality-reports', 'branches'),
  config = {},
  now = Date.now(),
  dryRun = false,
  budgetMs = 60_000,
} = {}) {
  if (typeof projectRoot !== 'string' || typeof currentBranchKey !== 'string' || currentBranchKey.length === 0) {
    throw new Error('projectRoot y currentBranchKey son obligatorios');
  }
  const root = await assertBranchesRoot(projectRoot, reportsRoot);
  const retention = normalizeIndexRetention(config);
  /* [028A-8] El presupuesto de tiempo se mide contra el reloj real (como
   * target-maintenance); `now` inyectado decide edad/cuota/escritura reciente
   * para tests deterministas, pero nunca la duración del pase. */
  const budgetDeadline = budgetMs ? Date.now() + budgetMs : Infinity;
  const { candidates, locked, truncated } = await indexCandidates(root, now, budgetDeadline);
  const totalBytes = candidates.reduce((sum, item) => sum + item.bytes, 0);
  const removed = [];
  let remainingBytes = totalBytes;
  const eligible = candidates
    /* [028A-8] El branch actual no se toca (sus índices son el objetivo del
     * gate en curso); el resto queda protegido si está en uso. */
    .filter(item => item.branchKey !== currentBranchKey && !item.recentlyWritten)
    .sort((left, right) => left.newestMs - right.newestMs);
  /* [028A-8] La cuota se re-evalúa tras cada eliminación: no se sigue
   * borrando una vez que remainingBytes queda bajo el máximo. */
  for (const candidate of eligible) {
    if (Date.now() > budgetDeadline) break;
    const tooOld = now - candidate.newestMs > retention.maxAgeMs;
    const quotaEligible = remainingBytes > retention.maxBytes && now - candidate.newestMs > MIN_QUOTA_AGE_MS;
    if (!tooOld && !quotaEligible) continue;
    if (!dryRun) await assertBeforeRemove(projectRoot, candidate.path);
    removed.push({ branchKey: candidate.branchKey, index: candidate.name, bytes: candidate.bytes, reason: tooOld ? 'age' : 'quota' });
    remainingBytes -= candidate.bytes;
    if (!dryRun) await rm(candidate.path, { recursive: true, force: true });
  }
  return {
    dryRun,
    retention: { maxAgeMs: retention.maxAgeMs, maxBytes: retention.maxBytes },
    totalBytes,
    remainingBytes,
    overQuota: totalBytes > retention.maxBytes,
    truncated,
    removed,
    protectedBranches: [...new Set([
      ...candidates.filter(item => item.recentlyWritten).map(item => item.branchKey),
      ...locked,
    ])],
  };
}

async function lastMaintenanceAt(projectRoot) {
  const marker = await readJson(path.join(projectRoot, '.quality-reports', '.glory-index-maintenance.json'), null);
  return Number(marker?.lastRunAt) || 0;
}

export async function shouldRunIndexMaintenance({ projectRoot, now = Date.now(), throttleMs }) {
  return now - await lastMaintenanceAt(projectRoot) >= throttleMs;
}

export async function markIndexMaintenanceRun(projectRoot, now = Date.now()) {
  const markerPath = path.join(projectRoot, '.quality-reports', '.glory-index-maintenance.json');
  await mkdir(path.dirname(markerPath), { recursive: true });
  await writeFile(markerPath, `${JSON.stringify({ lastRunAt: now }, null, 2)}\n`, 'utf8');
}

/* [028A-8] Mantenimiento auxiliar igual que targets y retención: un fallo de
 * filesystem o un pase truncado nunca convierte un gate válido en error. */
export async function runIndexMaintenanceBestEffort({
  projectRoot,
  currentBranchKey,
  config = {},
  now = Date.now(),
  budgetMs = 60_000,
  prune = pruneIndexDirs,
  shouldRun = shouldRunIndexMaintenance,
  mark = markIndexMaintenanceRun,
} = {}) {
  try {
    const retention = normalizeIndexRetention(config);
    const due = await shouldRun({ projectRoot, now, throttleMs: retention.throttleMs });
    if (!due) return { status: 'pass', skipped: 'cooldown' };
    const result = await prune({ projectRoot, currentBranchKey, config, now, budgetMs });
    /* [028A-8] Un pase truncado por presupuesto no arma el throttle: si la
     * poda quedó a medias por el límite de tiempo, el siguiente gate reintenta
     * en lugar de esperar 6 h con índices sin limpiar. */
    if (!result.truncated) await mark(projectRoot, now);
    return { status: 'pass', ...result };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
