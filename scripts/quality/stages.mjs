#!/usr/bin/env node
/* [SNT-14] El manifest del proyecto describe transporte y etapas; Sentinel
 * sigue siendo dueño del scheduler, locks, reporte final y decisión. */
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { preflight, projectRoot } from './preflight.mjs';
import { detectScope, manifestToScope } from './scope.mjs';
import { readAdapterManifest, adapterStageNames, adapterEnvironmentAllowlist, assertImplementedStages, assertStageParity, materializeTransportArguments, resolveWorkspacePath, assertTaskId } from './adapter-manifest.mjs';
import { stageDefinitions } from './stage-definitions.mjs';
import { DEFAULT_ENV_ALLOWLIST } from './runner.mjs';
import { EXECUTABLE_PROFILES } from './profile-contract.mjs';

function parseArgs(argv) {
  const parsed = { taskId: null, output: null, full: false, ci: false, profile: null, reportRoot: null, scopeManifest: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const argValue = argv[++index];
    if (arg === '--task-id') parsed.taskId = argValue ?? null;
    else if (arg === '--output') parsed.output = argValue ?? null;
    else if (arg === '--report-root') parsed.reportRoot = argValue ?? null;
    else if (arg === '--scope-manifest') parsed.scopeManifest = argValue ?? null;
    else if (arg === '--full') { parsed.full = true; index -= 1; }
    else if (arg === '--ci') { parsed.ci = true; index -= 1; }
    else if (arg === '--profile') parsed.profile = argValue ?? null;
    else index -= 1;
  }
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskId) { process.stderr.write('[stages] requiere --task-id seguro\n'); process.exitCode = 2; return; }
  assertTaskId(args.taskId);
  const adapter = await readAdapterManifest(projectRoot);
  const profiles = args.profile ? args.profile.split(',').map(item => item.trim()).filter(Boolean) : [];
  const scopeArgs = { full: args.full, ci: args.ci, profiles };
  const context = await preflight({ taskId: args.taskId, cwd: projectRoot, ...scopeArgs });
  context.adapterEnvironmentAllowlist = adapterEnvironmentAllowlist(adapter, DEFAULT_ENV_ALLOWLIST);
  const scopeManifestPath = args.scopeManifest ? resolveWorkspacePath(projectRoot, args.scopeManifest, '--scope-manifest', { allowReportRoot: true }) : null;
  const scope = scopeManifestPath ? manifestToScope(JSON.parse(await readFile(scopeManifestPath, 'utf8'))) : await detectScope(context, scopeArgs);
  /* [138A-1] Los perfiles de clasificación (desktop/mobile/workspace/auth/
   * commerce) solo activan recordatorios; no seleccionan etapas. El adapter
   * falla fail-closed ante perfiles no declarados, así que se filtran aquí
   * antes del transporte, conservando el contrato para errores reales. */
  const stageProfiles = [...scope.profiles].filter(profile => EXECUTABLE_PROFILES.has(profile));
  const stageNames = adapterStageNames(adapter, stageProfiles, scope.executionFull ?? scope.full);
  const implementedNames = stageDefinitions(context, scope, args.taskId, adapter).map(item => item.name);
  assertImplementedStages(adapter, stageNames, implementedNames);
  assertStageParity(stageNames, implementedNames);
  const reportRoot = resolveWorkspacePath(projectRoot, args.reportRoot ?? path.join(context.reportRoot, '..', 'check', 'stages'), '--report-root', { allowReportRoot: true });
  const wrapper = resolveWorkspacePath(projectRoot, adapter.transport.entrypoint, 'adapter.transport.entrypoint');
  /* The child adapter must receive the same explicit execution selector as
   * the planner. Without forwarding --profile/--full/--ci, an incremental
   * change outside the requested profile can make stage-process rediscover a
   * narrower scope and report "stage not implemented" (SETUP ERROR). */
  const scopeArgsForStage = [
    ...(scopeManifestPath ? ['--scope-manifest', scopeManifestPath] : []),
    ...(args.profile ? ['--profile', args.profile] : []),
    ...(args.full ? ['--full'] : []),
    ...(args.ci ? ['--ci'] : []),
  ];
  /* [108A-6] El contrato del Core (stageManifest.ts) acepta únicamente
   * name/executable/args/reportPath/expectedSchemaVersion/timeoutMs/cwd y
   * aplica su propia allowlist fija de entorno (toolRunner ENV_ALLOWLIST),
   * que ya cubre la allowlist declarada del adapter (CARGO_TARGET_DIR_BASE)
   * y los tokens de sanción del gate. Se omite envAllowlist para que el
   * manifest generado sea aceptado por `sentinel check --stages`; si el
   * adapter declara variables fuera de la allowlist del Core, registrarlas
   * como contrato del manifest es una extensión del Core (seguimiento). */
  const declarations = stageNames.map(name => {
    const reportPath = resolveWorkspacePath(projectRoot, path.join(reportRoot, `${name}.json`), `report ${name}`, { allowReportRoot: true });
    const adapterArgs = materializeTransportArguments(adapter, { stage: name, reportPath, taskId: args.taskId });
    return { name, executable: process.execPath, args: [wrapper, ...adapterArgs, ...scopeArgsForStage], expectedSchemaVersion: String(adapter.adapter.output.schemaVersion), timeoutMs: adapter.stages[name].timeoutMs, reportPath };
  });
  const outputPath = resolveWorkspacePath(projectRoot, args.output ?? path.join(reportRoot, 'stages.json'), '--output', { allowReportRoot: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(declarations, null, 2)}\n`, 'utf8');
  process.stdout.write(`${outputPath}\n`);
}
try { await main(); } catch (error) { process.stderr.write(`[stages] SETUP ERROR — ${error.message}\n`); process.exitCode = 2; }
