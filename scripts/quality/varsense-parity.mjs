#!/usr/bin/env node
/* [028A-6 Fase 3] Paridad de VarSense: ejecuta la etapa varsense del gate
 * agnóstico (stage-process → adapter → CLI) y el CLI de VarSense directo
 * sobre el mismo alcance, normaliza ambos reportes y compara hallazgos.
 * Objetivo del plan: "Ejecutar VarSense desde Sentinel y demostrar paridad de
 * hallazgos con su CLI/LSP, sin permitir que VarSense cierre la tarea por
 * separado". El gate es la única autoridad de decisión: VarSense es una etapa
 * más del reporte combinado y no produce exit code propio. Exit 0 = paridad,
 * 1 = diferencias, 2 = error de configuración. */
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { preflight, projectRoot } from './preflight.mjs';
import { detectScope, manifestToScope } from './scope.mjs';
import { buildVarsenseInvocation } from './adapters/varsense-contract.mjs';
import { runProcess } from './runner.mjs';

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const parsed = { taskId: null, scopeManifest: null, keepStages: false, full: false, ci: false, profile: null };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--task-id') parsed.taskId = argv[++index] ?? null;
    else if (arg === '--scope-manifest') parsed.scopeManifest = argv[++index] ?? null;
    else if (arg === '--keep-stages') parsed.keepStages = true;
    else if (arg === '--full') parsed.full = true;
    else if (arg === '--ci') parsed.ci = true;
    else if (arg === '--profile') parsed.profile = argv[++index] ?? null;
  }
  return parsed;
}

/* [028A-6 Fase 3] El reporte de la etapa ya viene normalizado por el adapter
 * (ruleId/severity/file/line/message); el JSON crudo del CLI usa
 * entries[].ruta + findings[].range. Ambas funciones puras se exportan para
 * los tests sin ejecutar el CLI. */
export function normalizeGateFindings(gateEntries) {
  return (gateEntries ?? []).flatMap(entry => (entry.findings ?? []).map(finding => ({
    ruleId: String(finding.ruleId ?? 'unknown'),
    severity: String(finding.severity ?? 'warning'),
    file: finding.file ? String(finding.file).replace(/\\/g, '/') : undefined,
    line: Number.isInteger(finding.line) ? finding.line : undefined,
    message: String(finding.message ?? ''),
  })));
}

export function normalizeDirectFindings(directEntries) {
  return (directEntries ?? []).flatMap(entry => (entry.findings ?? []).map(finding => ({
    ruleId: String(finding.ruleId ?? 'unknown'),
    severity: String(finding.severity ?? 'warning'),
    file: (entry.ruta ?? entry.file) ? String(entry.ruta ?? entry.file).replace(/\\/g, '/') : undefined,
    line: Number.isInteger(finding.range?.start?.line) ? finding.range.start.line + 1 : undefined,
    message: String(finding.message ?? ''),
  })));
}

export function findingKey(finding) {
  return `${finding.ruleId}:${finding.file ?? ''}:${finding.line ?? ''}`;
}

export function compareFindings(gate, direct) {
  const gateIds = new Set(gate.map(findingKey));
  const directIds = new Set(direct.map(findingKey));
  const onlyGate = gate.filter(item => !directIds.has(findingKey(item)));
  const onlyDirect = direct.filter(item => !gateIds.has(findingKey(item)));
  return { onlyGate, onlyDirect, matched: onlyGate.length === 0 && onlyDirect.length === 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.taskId) {
    process.stderr.write('[varsense-parity] requiere --task-id <id>\n');
    process.exitCode = 2;
    return;
  }
  const parityRoot = path.join(projectRoot, '.quality-reports', 'parity', 'varsense', args.taskId);
  await mkdir(parityRoot, { recursive: true });
  const reportRoot = path.join(parityRoot, 'gate');
  await mkdir(reportRoot, { recursive: true });
  const scopeArgs = { full: args.full, ci: args.ci, profiles: args.profile ? args.profile.split(',').map(item => item.trim()).filter(Boolean) : [] };
  const context = await preflight({ taskId: args.taskId, cwd: projectRoot, ...scopeArgs });
  context.reportRoot = reportRoot;
  context.logsRoot = path.join(reportRoot, 'logs');
  let scope;
  let scopeManifestArg = [];
  if (args.scopeManifest) {
    const manifest = JSON.parse(await readFile(args.scopeManifest, 'utf8'));
    scope = manifestToScope(manifest, reportRoot);
    await writeFile(scope.changedFilesPath, `${scope.files.join('\n')}\n`, 'utf8');
    scopeManifestArg = ['--scope-manifest', args.scopeManifest];
  } else {
    /* [028A-6] La paridad exige el mismo alcance en ambos lados: detectScope
     * ya escribe scope-manifest.json en context.reportRoot; se lo pasamos a
     * stage-process (igual que observe-compare) para que la etapa del gate no
     * recalcule un alcance distinto (p. ej. con --full). */
    scope = await detectScope(context, scopeArgs);
    const manifestPath = path.join(reportRoot, 'scope-manifest.json');
    scopeManifestArg = ['--scope-manifest', manifestPath];
  }
  await mkdir(context.logsRoot, { recursive: true });

  /* 1. Etapa del gate: stage-process --stage varsense (misma vía que
   * sentinel check --stages). */
  const wrapper = path.join(projectRoot, 'scripts', 'quality', 'stage-process.mjs');
  const gateReportPath = path.join(reportRoot, 'varsense-stage.json');
  const stageArgs = [wrapper, '--stage', 'varsense', '--report', gateReportPath, '--task-id', args.taskId, ...scopeManifestArg];
  const stageResult = await execFileAsync(process.execPath, stageArgs, { cwd: projectRoot, timeout: 10 * 60_000 }).catch(error => error);
  const stageExit = Number.isInteger(stageResult.code) ? stageResult.code : 0;

  /* 2. CLI directo: la misma invocación que el adapter (buildVarsenseInvocation)
   * con el mismo alcance, ejecutada sin la etapa del gate. El adapter puede
   * añadir --files-from/--index-dir después de --output, así que se reemplaza
   * el par --output <ruta> en su posición y se conserva el resto. */
  const directReportPath = path.join(reportRoot, 'varsense-direct.json');
  const invocation = buildVarsenseInvocation(context, scope);
  const outputIndex = invocation.args.lastIndexOf('--output');
  if (outputIndex < 0) {
    process.stderr.write('[varsense-parity] SETUP ERROR — la invocación de varsense no incluye --output\n');
    process.exitCode = 2;
    return;
  }
  const directArgs = [...invocation.args.slice(0, outputIndex), '--output', directReportPath, ...invocation.args.slice(outputIndex + 2)];
  const directExecution = await runProcess(process.execPath, directArgs, {
    cwd: projectRoot,
    timeoutMs: context.qualityConfig.timeoutsMs.varsense,
  });
  const directExit = directExecution.code;

  /* 3. Normalizar ambos y comparar. Si una vía falló (exit ≠ 0), no se puede
   * declarar paridad: se reporta el estado sin leer reportes que pueden no
   * existir (un crash no escribe --output). */
  const bothOk = stageExit === 0 && directExit === 0;
  let gateFindings = [];
  let directFindings = [];
  let comparison = { onlyGate: [], onlyDirect: [], matched: false };
  if (bothOk) {
    try {
      const gateReport = JSON.parse(await readFile(gateReportPath, 'utf8'));
      const directRaw = JSON.parse(await readFile(directReportPath, 'utf8'));
      gateFindings = normalizeGateFindings(gateReport.entries);
      directFindings = normalizeDirectFindings(directRaw.entries);
      comparison = compareFindings(gateFindings, directFindings);
    } catch (error) {
      process.stderr.write(`[varsense-parity] SETUP ERROR — reportes ilegibles: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
  }

  const lines = [`[varsense-parity] Comparación ${args.taskId} — etapa del gate vs CLI directo (alcance: ${scope.effectiveFull ? 'full' : 'scoped'}, ${scope.files.length} archivos)`];
  lines.push(`[varsense-parity] Hallazgos: ${gateFindings.length} (gate) vs ${directFindings.length} (CLI) — ${comparison.matched ? 'PARIDAD' : 'DIFIERE'}`);
  if (stageExit !== 0) lines.push(`[varsense-parity]   etapa del gate terminó con exit ${stageExit}`);
  if (directExit !== 0) lines.push(`[varsense-parity]   CLI directo terminó con exit ${directExit}`);
  for (const item of comparison.onlyGate.slice(0, 5)) {
    lines.push(`[varsense-parity]   solo-gate: ${item.ruleId} ${item.file ?? ''}:${item.line ?? ''} ${item.message}`);
  }
  for (const item of comparison.onlyDirect.slice(0, 5)) {
    lines.push(`[varsense-parity]   solo-cli: ${item.ruleId} ${item.file ?? ''}:${item.line ?? ''} ${item.message}`);
  }
  process.stdout.write(`${lines.join('\n')}\n`);

  const report = {
    taskId: args.taskId,
    scope: { effectiveFull: scope.effectiveFull, files: scope.files.length },
    stageExit,
    directExit,
    gateFindings: gateFindings.length,
    directFindings: directFindings.length,
    matched: comparison.matched,
    onlyGate: comparison.onlyGate,
    onlyDirect: comparison.onlyDirect,
    note: 'VarSense es una etapa del gate; la decisión final la toma sentinel check (reporte combinado), no VarSense por separado.',
  };
  await writeFile(path.join(parityRoot, 'parity.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.exitCode = bothOk && comparison.matched ? 0 : 1;
}

const isDirectRun = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;
if (isDirectRun) await main();

