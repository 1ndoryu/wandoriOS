import { access, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './runner.mjs';
import { loadPolicy, policyIdentity } from './policy.mjs';
import { assertRuntimeLockHash, readLock, resolveToolRoot, verifyInstalledAnalyzers } from './lockfile.mjs';
import { branchReportRoot, resolveBranchIdentity } from './branch-identity.mjs';
import { normalizeReportRetention } from './report-retention.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function collectMarkdown(root, output = []) {
  if (!await exists(root)) return output;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) await collectMarkdown(target, output);
    else if (entry.isFile() && entry.name.endsWith('.md')) output.push(target);
  }
  return output;
}

async function assertTaskExists(root, taskId) {
  const candidates = [path.join(root, 'roadmap.md')];
  await collectMarkdown(path.join(root, 'Agente', 'planes'), candidates);
  await collectMarkdown(path.join(root, 'Agente', 'completados'), candidates);
  for (const candidate of candidates) {
    if ((await readFile(candidate, 'utf8')).includes(taskId)) return;
  }
  throw new Error(`La tarea ${taskId} no existe en roadmap, planes ni completados`);
}

async function verifyTool(root, name, toolConfig, manifest) {
  const toolRoot = await resolveToolRoot(root, name, toolConfig, manifest);
  const cliPath = path.join(toolRoot, toolConfig.cli);
  if (!await exists(cliPath)) {
    throw new Error(`Falta ${name} ${toolConfig.version}. Ejecuta: npm run quality:setup`);
  }
  const version = await runProcess(process.execPath, [cliPath, '--version'], { cwd: root, timeoutMs: 10_000 });
  if (version.code !== 0 || version.stdout.trim() !== toolConfig.version) {
    throw new Error(`${name} incompatible. Ejecuta: npm run quality:setup`);
  }
  const revision = await runProcess('git', ['-C', toolRoot, 'rev-parse', 'HEAD'], { cwd: root, timeoutMs: 10_000 });
  if (revision.code !== 0 || revision.stdout.trim() !== toolConfig.commit) {
    throw new Error(`${name} no coincide con el commit fijado. Ejecuta: npm run quality:setup`);
  }
  return { ...toolConfig, cliPath };
}

export function validateQualityConfig(qualityConfig) {
  const allowed = new Set(['schemaVersion', 'maxFindings', 'maxReminders', 'maxTerminalLines', 'lockWaitMs', 'maxConcurrentStages', 'timeoutsMs', 'performanceBudgets', 'heavyRun', 'reportRetention', 'fullPatterns', 'profiles', 'stageTimeBudgets', 'indexRetention', 'roadmapMaxLines']);
  const unknown = Object.keys(qualityConfig).filter(key => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`quality.config.json: claves desconocidas: ${unknown.join(', ')}`);
  for (const key of ['maxFindings', 'maxReminders', 'maxTerminalLines']) {
    if (!Number.isInteger(qualityConfig[key]) || qualityConfig[key] < 1) throw new Error(`quality.config.json: ${key} inválido`);
  }
  /* [028A-17] Límite de líneas del roadmap: opcional (default 700 en el
   * adapter). Si se define debe ser entero ≥100 para que la regla bloqueante
   * tenga sentido (un límite minúsculo rompería cualquier repo). */
  if (qualityConfig.roadmapMaxLines !== undefined
    && (!Number.isInteger(qualityConfig.roadmapMaxLines) || qualityConfig.roadmapMaxLines < 100)) {
    throw new Error('quality.config.json: roadmapMaxLines debe ser un entero >= 100');
  }
  if (!Number.isInteger(qualityConfig.lockWaitMs) || qualityConfig.lockWaitMs < 0 || qualityConfig.lockWaitMs > 300_000) {
    throw new Error('quality.config.json: lockWaitMs debe ser un entero entre 0 y 300000');
  }
  if (!Number.isInteger(qualityConfig.maxConcurrentStages) || qualityConfig.maxConcurrentStages < 1 || qualityConfig.maxConcurrentStages > 4) {
    throw new Error('quality.config.json: maxConcurrentStages debe ser un entero entre 1 y 4');
  }
  if (!Array.isArray(qualityConfig.fullPatterns) || !qualityConfig.fullPatterns.every(item => typeof item === 'string')) {
    throw new Error('quality.config.json: fullPatterns debe ser una lista de strings');
  }
  if (!qualityConfig.profiles || typeof qualityConfig.profiles !== 'object') throw new Error('quality.config.json: profiles inválido');
  if (!qualityConfig.timeoutsMs || Object.values(qualityConfig.timeoutsMs).some(value => !Number.isInteger(value) || value < 1)) {
    throw new Error('quality.config.json: timeoutsMs inválido');
  }
  if (!qualityConfig.performanceBudgets || Object.values(qualityConfig.performanceBudgets).some(value => !Number.isInteger(value) || value < 1)) {
    throw new Error('quality.config.json: performanceBudgets inválido');
  }
  if (qualityConfig.stageTimeBudgets !== undefined) {
    for (const [stage, budgetMs] of Object.entries(qualityConfig.stageTimeBudgets)) {
      if (!/^[A-Za-z0-9:_-]+$/.test(stage) || !Number.isInteger(budgetMs) || budgetMs < 1) {
        throw new Error(`quality.config.json: stageTimeBudgets.${stage} inválido (entero positivo en ms)`);
      }
    }
  }
  if (qualityConfig.indexRetention !== undefined) {
    const { maxAgeDays, maxMiB, throttleHours } = qualityConfig.indexRetention;
    if (!Number.isInteger(maxAgeDays) || maxAgeDays < 1 || maxAgeDays > 365) {
      throw new Error('quality.config.json: indexRetention.maxAgeDays debe estar entre 1 y 365');
    }
    if (!Number.isInteger(maxMiB) || maxMiB < 1 || maxMiB > 1024 * 1024) {
      throw new Error('quality.config.json: indexRetention.maxMiB inválido');
    }
    if (!Number.isInteger(throttleHours) || throttleHours < 1 || throttleHours > 720) {
      throw new Error('quality.config.json: indexRetention.throttleHours debe estar entre 1 y 720');
    }
  }
  if (!qualityConfig.heavyRun || !Number.isFinite(qualityConfig.heavyRun.cooldownMinutes) || qualityConfig.heavyRun.cooldownMinutes < 0 || qualityConfig.heavyRun.cooldownMinutes > 24 * 60) {
    throw new Error('quality.config.json: heavyRun.cooldownMinutes debe estar entre 0 y 1440');
  }
  if (!Number.isFinite(qualityConfig.heavyRun.maxTargetGb) || qualityConfig.heavyRun.maxTargetGb < 1 || qualityConfig.heavyRun.maxTargetGb > 100) {
    throw new Error('quality.config.json: heavyRun.maxTargetGb debe estar entre 1 y 100');
  }
  if (!Number.isFinite(qualityConfig.heavyRun.maxTargetAgeDays) || qualityConfig.heavyRun.maxTargetAgeDays < 1 || qualityConfig.heavyRun.maxTargetAgeDays > 365) {
    throw new Error('quality.config.json: heavyRun.maxTargetAgeDays debe estar entre 1 y 365');
  }
  if (!Number.isInteger(qualityConfig.heavyRun.maxConcurrent) || qualityConfig.heavyRun.maxConcurrent !== 1) {
    throw new Error('quality.config.json: heavyRun.maxConcurrent debe ser 1 para proteger la máquina');
  }
  normalizeReportRetention(qualityConfig.reportRetention);
}

export async function preflight(args) {
  const workspaceRoot = args.cwd ? path.resolve(args.cwd) : projectRoot;
  await assertTaskExists(workspaceRoot, args.taskId);
  const discoveredPolicy = await loadPolicy(workspaceRoot);
  const qualityConfig = await readJson(path.join(workspaceRoot, 'quality.config.json'));
  const toolManifest = await readJson(path.join(workspaceRoot, 'quality-tools.json'));
  if (qualityConfig.schemaVersion !== 1 || toolManifest.schemaVersion !== 1) {
    throw new Error('Config de calidad incompatible: se esperaba schemaVersion 1');
  }
  validateQualityConfig(qualityConfig);
  const policy = discoveredPolicy;
  if (policy.status === 'invalid-policy') throw new Error(policy.error);

  const lockFile = policy.policy?.runtime?.lockFile ?? 'sentinel.lock.json';
  const { lock, lockPath } = await readLock(workspaceRoot, toolManifest, lockFile);
  assertRuntimeLockHash(lock.runtime);
  const installed = await verifyInstalledAnalyzers(workspaceRoot, toolManifest, lock);
  const tools = {};
  for (const [name, config] of Object.entries(toolManifest.tools)) {
    tools[name] = { ...await verifyTool(workspaceRoot, name, config, toolManifest), ...installed[name] };
  }

  const branch = await resolveBranchIdentity(workspaceRoot);
  const branchRoot = branchReportRoot(workspaceRoot, branch);
  const reportRoot = path.join(branchRoot, args.taskId);
  const logsRoot = path.join(reportRoot, 'logs');
  const cacheRoot = path.join(branchRoot, 'cache');
  const locksRoot = path.join(branchRoot, 'locks');
  await mkdir(logsRoot, { recursive: true });
  await mkdir(cacheRoot, { recursive: true });
  await mkdir(locksRoot, { recursive: true });
  /* [018A-51] El modo CI puede ampliar la validación frontend sin hacer que
   * cada agente ejecute la suite completa localmente. */
  return {
    projectRoot: workspaceRoot,
    qualityConfig,
    toolManifest,
    tools,
    reportRoot,
    logsRoot,
    cacheRoot,
    locksRoot,
    branch,
    ci: args.ci,
    full: args.full,
    allowHeavy: args.allowHeavy,
    heavyDeferred: args.heavyDeferred,
    policy,
    policyIdentity: policyIdentity(policy, toolManifest.tools?.sentinel?.version ?? null),
    lock,
    lockPath,
  };
}
