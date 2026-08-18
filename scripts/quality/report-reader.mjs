import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { branchReportRoot, BRANCH_KEY_VERSION, createBranchKey } from './branch-identity.mjs';

const TASK_ID_PATTERN = /^\d{2}[1-9ABC][A-Z]-\d+$/u;

/* [028A-6] Compatibilidad temporal del lector histórico: solo lectura, sin
 * migración automática ni escritura de alias. El runtime global será quien
 * convierta este marcador en una retirada efectiva después de dos releases. */
export const LEGACY_REPORT_COMPATIBILITY = Object.freeze({
  mode: 'legacy-read-only',
  compatibilityVersion: 1,
  maxRuntimeVersions: 2,
  retireAfterCompatibilityVersion: 3,
  retirement: 'after-two-runtime-versions',
  warning: 'Reporte legacy compatible: solo lectura; no se migra ni se escribe alias.',
});

function assertTaskId(taskId) {
  if (typeof taskId !== 'string' || !TASK_ID_PATTERN.test(taskId)) {
    throw new Error(`taskId inválido para lectura de reporte: ${String(taskId)}`);
  }
}

async function safeFile(workspaceRoot, target, label) {
  const reportsRoot = path.resolve(workspaceRoot, '.quality-reports');
  const reportsMetadata = await lstat(reportsRoot).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (reportsMetadata?.isSymbolicLink()) throw new Error('.quality-reports no puede ser symlink');
  if (reportsMetadata && !reportsMetadata.isDirectory()) throw new Error('.quality-reports no es un directorio');
  if (reportsMetadata) {
    const reportsReal = await realpath(reportsRoot);
    if (path.resolve(reportsReal) !== reportsRoot) throw new Error('.quality-reports resuelve fuera del workspace');
  }
  const absolute = path.resolve(target);
  const relativeParts = path.relative(reportsRoot, absolute).split(path.sep).filter(Boolean);
  let cursor = reportsRoot;
  for (const component of relativeParts.slice(0, -1)) {
    cursor = path.join(cursor, component);
    const componentMetadata = await lstat(cursor).catch(error => {
      if (error?.code === 'ENOENT') return null;
      throw error;
    });
    if (componentMetadata?.isSymbolicLink()) throw new Error(`${label} namespace no puede ser symlink`);
  }
  const relative = path.relative(reportsRoot, absolute);
  if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} fuera de .quality-reports`);
  }
  const metadata = await lstat(absolute).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!metadata) return null;
  if (metadata.isSymbolicLink()) throw new Error(`${label} no puede ser symlink`);
  if (!metadata.isFile()) throw new Error(`${label} no es un archivo regular`);
  const resolved = await realpath(absolute);
  const resolvedRelative = path.relative(reportsRoot, resolved);
  if (resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
    throw new Error(`${label} resuelve fuera de .quality-reports`);
  }
  return absolute;
}

async function readJsonReport(workspaceRoot, target, label) {
  const safePath = await safeFile(workspaceRoot, target, label);
  if (!safePath) return null;
  let report;
  try {
    report = JSON.parse(await readFile(safePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} JSON inválido: ${error.message}`);
  }
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`${label} debe contener un objeto JSON`);
  }
  return { path: safePath, report };
}

function exactBranchMetadata(report, taskId, branch) {
  return report.taskId === taskId
    && report.branch?.branchKeyVersion === BRANCH_KEY_VERSION
    && report.branch.branchKey === branch.branchKey
    && report.branch.canonicalRef === branch.canonicalRef
    && report.branch.commit === branch.commit;
}

export async function readQualityReport({ projectRoot, taskId, branch }) {
  if (typeof projectRoot !== 'string') throw new Error('projectRoot es obligatorio');
  assertTaskId(taskId);
  if (!branch || branch.branchKeyVersion !== BRANCH_KEY_VERSION
    || typeof branch.canonicalRef !== 'string'
    || createBranchKey(branch.canonicalRef) !== branch.branchKey
    || !/^[a-f0-9]{7,64}$/u.test(branch.commit ?? '')) {
    throw new Error('identidad de rama inválida para lectura de reporte');
  }

  const canonicalPath = path.join(branchReportRoot(projectRoot, branch), taskId, 'latest.json');
  const canonical = await readJsonReport(projectRoot, canonicalPath, 'reporte canónico');
  if (canonical) {
    if (canonical.report.taskId !== taskId) throw new Error('reporte canónico no coincide con taskId');
    if (!exactBranchMetadata(canonical.report, taskId, branch)) {
      throw new Error('reporte canónico no coincide con la identidad de rama');
    }
    return { status: 'canonical', path: canonical.path, report: canonical.report };
  }

  const legacyPath = path.join(projectRoot, '.quality-reports', taskId, 'latest.json');
  const legacy = await readJsonReport(projectRoot, legacyPath, 'reporte legacy');
  if (!legacy) return { status: 'not-found', path: null, report: null };
  if (!exactBranchMetadata(legacy.report, taskId, branch)) {
    return {
      status: 'legacy-ambiguous',
      path: legacy.path,
      report: null,
      compatibility: LEGACY_REPORT_COMPATIBILITY,
      warning: LEGACY_REPORT_COMPATIBILITY.warning,
      reason: 'metadata de rama ausente o no coincide; no se atribuye a la rama actual',
    };
  }
  return {
    status: 'legacy-compatible',
    path: legacy.path,
    report: legacy.report,
    compatibility: LEGACY_REPORT_COMPATIBILITY,
    warning: LEGACY_REPORT_COMPATIBILITY.warning,
  };
}

export async function main(argv = process.argv.slice(2), { projectRoot = process.cwd(), branchResolver } = {}) {
  const taskId = argv[0];
  if (!taskId || argv.some(value => value.startsWith('--'))) {
    throw new Error('Uso: quality:reports:read <task-id>');
  }
  const branch = branchResolver
    ? await branchResolver(projectRoot)
    : await import('./branch-identity.mjs').then(module => module.resolveBranchIdentity(projectRoot));
  const result = await readQualityReport({ projectRoot: path.resolve(projectRoot), taskId, branch });
  process.stdout.write(`${JSON.stringify({ command: 'quality report read', ...result }, null, 2)}\n`);
  if (result.status === 'legacy-ambiguous') process.exitCode = 1;
  if (result.status === 'legacy-compatible') process.stderr.write(`[quality:reports] warning: ${result.compatibility.warning}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`[quality:reports] ERROR: ${error.message}\n`);
    process.exitCode = 2;
  });
}
