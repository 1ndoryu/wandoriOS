#!/usr/bin/env node
/* [SNT-14] Adaptador de proceso para `sentinel check --stages`: ejecuta una
 * etapa del proyecto y escribe únicamente el contrato JSON que Sentinel
 * consume. Scheduler, locks, reportería final y exit semantics pertenecen al
 * core; este wrapper solo resuelve el adapter y produce una salida versionada. */
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { stageDefinitions } from './stage-definitions.mjs';
import { preflight, projectRoot } from './preflight.mjs';
import { detectScope, manifestToScope } from './scope.mjs';
import { readAdapterManifest, adapterStageNames, manifestStageNames, adapterEnvironmentAllowlist, resolveWorkspacePath, assertTaskId } from './adapter-manifest.mjs';
import { DEFAULT_ENV_ALLOWLIST } from './runner.mjs';

function parseArgs(argv) {
  const parsed = { reportPath: null, taskId: null, stage: null, full: false, ci: false, profile: null, scopeManifest: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--stage') parsed.stage = argv[++index] ?? null;
    else if (arg === '--report') parsed.reportPath = argv[++index] ?? null;
    else if (arg === '--task-id') parsed.taskId = argv[++index] ?? null;
    else if (arg === '--scope-manifest') parsed.scopeManifest = argv[++index] ?? null;
    else if (arg === '--full') parsed.full = true;
    else if (arg === '--ci') parsed.ci = true;
    else if (arg === '--profile') parsed.profile = argv[++index] ?? null;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.stage || !args.reportPath || !args.taskId) {
    process.stderr.write('[stage-process] requiere --stage, --report y task-id seguro\n');
    process.exitCode = 2;
    return;
  }
  assertTaskId(args.taskId);
  const adapter = await readAdapterManifest(projectRoot);
  const profiles = args.profile ? args.profile.split(',').map(item => item.trim()).filter(Boolean) : [];
  const allowedStages = profiles.length > 0 || args.full || args.ci
    ? adapterStageNames(adapter, profiles, args.full || args.ci)
    : manifestStageNames(adapter);
  if (!allowedStages.includes(args.stage)) {
    process.stderr.write(`[stage-process] etapa no declarada por el adapter: ${args.stage}\n`);
    process.exitCode = 2;
    return;
  }
  const reportPath = resolveWorkspacePath(projectRoot, args.reportPath, '--report', { allowReportRoot: true });
  const reportRoot = path.dirname(reportPath);
  const scopeArgs = { full: args.full, ci: args.ci, profiles };
  const context = await preflight({ taskId: args.taskId, cwd: projectRoot, ...scopeArgs });
  context.reportRoot = reportRoot;
  context.logsRoot = path.join(reportRoot, 'logs');
  context.adapterEnvironmentAllowlist = adapterEnvironmentAllowlist(adapter, DEFAULT_ENV_ALLOWLIST);
  await mkdir(context.logsRoot, { recursive: true });
  const scope = args.scopeManifest
    ? manifestToScope(JSON.parse(await readFile(resolveWorkspacePath(projectRoot, args.scopeManifest, '--scope-manifest', { allowReportRoot: true }), 'utf8')), reportRoot)
    : await detectScope(context, scopeArgs);
  if (args.scopeManifest) await writeFile(scope.changedFilesPath, `${scope.files.join('\n')}\n`, 'utf8');
  const definition = stageDefinitions(context, scope, args.taskId, adapter).find(item => item.name === args.stage);
  if (!definition) {
    process.stderr.write(`[stage-process] etapa no implementada por el adapter: ${args.stage}\n`);
    process.exitCode = 2;
    return;
  }
  const result = await definition.run();
  const report = {
    schemaVersion: String(adapter.adapter.output.schemaVersion),
    stage: result.stage ?? args.stage,
    entries: [{ findings: (result.findings ?? []).map(item => ({
      ruleId: String(item.ruleId ?? 'unknown'),
      severity: String(item.severity ?? 'warning'),
      ...(item.file ? { file: String(item.file).replace(/\\/g, '/') } : {}),
      ...(Number.isInteger(item.line) ? { line: item.line } : {}),
      message: String(item.message ?? 'Hallazgo sin mensaje'),
      ...(item.help ? { help: String(item.help) } : {}),
    })) }],
    summary: result.summary ?? '',
    durationMs: result.durationMs ?? 0,
  };
  await mkdir(reportRoot, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.exitCode = result.status === 'error'
    ? adapter.adapter.output.exitCodes.toolError
    : result.status === 'fail'
      ? adapter.adapter.output.exitCodes.findings
      : adapter.adapter.output.exitCodes.pass;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`[stage-process] SETUP ERROR — ${error.message}\n`);
  process.exitCode = 2;
}
