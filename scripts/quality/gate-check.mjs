#!/usr/bin/env node
/* [108A-6] Gate canónico de wandorius: genera el manifest declarativo
 * (stages.mjs + quality-adapter.json) y delega la decisión en
 * `sentinel check --stages`, la única autoridad de cierre (ADR 0001,
 * gate SNT-10). `task:check` queda como alias temporal de compatibilidad.
 *
 * El Core es dueño de alcance, guard, caché, etapas, reporte y exit code;
 * este wrapper solo encadena la generación del manifest y la invocación, y
 * emite metrics.json con el schema histórico para la publicación de CI
 * (export-ci-metrics.mjs) sin cambiar el contrato. */
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadPolicy, policyIdentity } from './policy.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const parsed = { taskId: null, full: false, ci: false, profile: null, allowHeavy: false, keepStages: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--') && !parsed.taskId) parsed.taskId = arg;
    else if (arg === '--full') parsed.full = true;
    else if (arg === '--ci') parsed.ci = true;
    else if (arg === '--profile') parsed.profile = argv[index + 1] ?? null, index += 1;
    else if (arg === '--allow-heavy') parsed.allowHeavy = true;
    else if (arg === '--keep-stages') parsed.keepStages = true;
    else throw new Error(`Opción desconocida: ${arg}`);
  }
  if (!parsed.taskId) throw new Error('gate:check requiere task-id');
  return parsed;
}

function scopeFlags(parsed) {
  const flags = [];
  if (parsed.full) flags.push('--full');
  if (parsed.ci) flags.push('--ci');
  if (parsed.profile) flags.push('--profile', parsed.profile);
  return flags;
}

async function generateManifest(parsed) {
  const reportRoot = path.join(projectRoot, '.quality-reports', 'check', parsed.taskId);
  const stagesJson = path.join(reportRoot, 'stages.json');
  await mkdir(reportRoot, { recursive: true });
  await execFileAsync(
    process.execPath,
    ['scripts/quality/stages.mjs', '--task-id', parsed.taskId, '--report-root', reportRoot, '--output', stagesJson, ...scopeFlags(parsed)],
    { cwd: projectRoot, timeout: 120_000, windowsHide: true },
  );
  return stagesJson;
}

async function resolveSentinelCli() {
  /* [108A-6] En CI el submodule `tools/sentinel/out/` no existe (artefacto
   * ignorado): `quality:setup` compila la copia provisionada
   * `.quality-tools/sentinel`. Se resuelve el CLI desde quality-tools.json
   * (provisionPath + cli) y se cae al checkout del submódulo solo como
   * fallback local. */
  try {
    const manifest = JSON.parse(await readFile(path.join(projectRoot, 'quality-tools.json'), 'utf8'));
    const tool = manifest?.tools?.sentinel;
    if (tool?.provisionPath && tool?.cli) {
      const candidate = path.join(projectRoot, tool.provisionPath, tool.cli);
      await access(candidate);
      return candidate;
    }
  } catch { /* fallback al checkout */ }
  return path.join(projectRoot, 'tools', 'sentinel', 'out', 'cli', 'index.js');
}

/* [108A-6] Sentinel 0.7.0 puede ejecutar correctamente las etapas pero dejar
 * la identidad de política vacía en el reporte combinado porque su runner
 * interno aún no recibe el contexto del adapter. El wrapper no inventa una
 * política: la carga desde la fuente canónica local y la adjunta al artefacto.
 * Si esa fuente es inválida, el gate queda en error aunque las etapas hayan
 * terminado PASS; cerrar con `policy: unavailable` sería una falsa confianza. */
export function needsPolicyIdentity(report) {
  return !report?.policy
    || !report.policy.policyHash
    || report.policy.policyHash === 'unavailable'
    || report?.policy?.decision?.action === 'error'
    || report?.policy?.decision?.status === 'invalid-policy';
}

export function applyPolicyIdentity(report, identity) {
  const policyError = identity?.decision?.action === 'error';
  const invalidDecision = policyError && report?.decision?.exitCode === 0
    ? { ...report.decision, exitCode: 2, label: 'SETUP ERROR' }
    : report?.decision;
  if (!needsPolicyIdentity(report) && !policyError) return { report, changed: false };
  return { report: { ...report, policy: identity, decision: invalidDecision }, changed: true };
}

export function renderPolicyIdentity(markdown, identity) {
  const line = `- Política: ${identity.policyHash} · ${identity.decision?.action ?? 'unknown'} · ${identity.reason}`;
  return /^- Política: .*$/mu.test(markdown)
    ? markdown.replace(/^- Política: .*$/mu, line)
    : `${markdown.trimEnd()}\n${line}\n`;
}

async function writeMetrics(parsed, report) {
  const reportRoot = path.join(projectRoot, '.quality-reports', 'check', parsed.taskId);
  const metrics = {
    schemaVersion: 1,
    taskId: parsed.taskId,
    generatedAt: report.generatedAt ?? new Date().toISOString(),
    durationMs: report.durationMs ?? null,
    mode: report.mode ?? (parsed.ci ? 'ci' : parsed.full ? 'full' : 'scoped'),
    branch: report.branch ?? null,
    stages: (report.stages ?? []).map(stage => ({
      stage: stage.stage,
      status: stage.status,
      state: stage.state ?? null,
      durationMs: Number.isFinite(stage.durationMs) ? stage.durationMs : null,
      cache: stage.cached ? 'hit' : 'miss',
      cacheReason: null,
      summary: stage.summary ?? '',
      metrics: null,
    })),
  };
  await writeFile(path.join(reportRoot, 'metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
}

async function main() {
  let parsed;
  try { parsed = parseArgs(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`[gate:check] SETUP ERROR — ${error.message}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const stagesJson = await generateManifest(parsed);
    const sentinelCli = await resolveSentinelCli();
    const result = await execFileAsync(
      process.execPath,
      [sentinelCli, 'check', parsed.taskId, '--stages', stagesJson, '--workspace', projectRoot, ...scopeFlags(parsed), ...(parsed.allowHeavy ? ['--allow-heavy'] : [])],
      { cwd: projectRoot, timeout: 30 * 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
    ).catch(error => error);
    process.stdout.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    let exitCode = typeof result.code === 'number' ? result.code : 0;
    const reportPath = path.join(projectRoot, '.quality-reports', 'check', parsed.taskId, 'latest.json');
    try {
      const report = JSON.parse(await readFile(reportPath, 'utf8'));
      const manifest = JSON.parse(await readFile(path.join(projectRoot, 'quality-tools.json'), 'utf8'));
      const configuredVersion = manifest?.tools?.sentinel?.version ?? null;
      const identity = policyIdentity(await loadPolicy(projectRoot), configuredVersion);
      const normalized = applyPolicyIdentity(report, identity);
      if (normalized.changed) {
        await writeFile(reportPath, `${JSON.stringify(normalized.report, null, 2)}\n`, 'utf8');
        const markdownPath = path.join(projectRoot, '.quality-reports', 'check', parsed.taskId, 'latest.md');
        const markdown = await readFile(markdownPath, 'utf8');
        await writeFile(markdownPath, renderPolicyIdentity(markdown, identity), 'utf8');
      }
      if (identity.decision?.action === 'error' && exitCode === 0) {
        process.stderr.write('[gate:check] SETUP ERROR — identidad de política inválida\n');
        exitCode = 2;
      }
      await writeMetrics(parsed, normalized.report);
    } catch (error) {
      process.stderr.write(`[gate:check] aviso: no se pudo emitir metrics.json (${error instanceof Error ? error.message : String(error)})\n`);
      if (exitCode === 0) exitCode = 2;
    }
    if (!parsed.keepStages) {
      try { await import('node:fs/promises').then(({ rm }) => rm(stagesJson, { force: true })); } catch { /* best-effort */ }
    }
    /* execFile resuelve sin `.code` cuando el proceso termina en 0; el
     * catch de error lo expone en `error.code`. Cualquier otro valor se
     * considera error de transporte. */
    process.exitCode = exitCode;
  } catch (error) {
    process.stderr.write(`[gate:check] SETUP ERROR — ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

const isEntryPoint = typeof process.argv[1] === 'string'
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  try { await main(); } catch (error) { process.stderr.write(`[gate:check] ERROR — ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 2; }
}
