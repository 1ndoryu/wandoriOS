import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from './quality-profile.mjs';
import { FIXTURES, fixtureManifest, validateFixtureFiles } from './bench-fixtures.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_OUT = path.join(projectRoot, '.quality-bench', 'baseline.json');

/* [028A-8 Fase 0] Baseline reproducible: ejecuta el gate N veces limpias
 * (--fresh, sin caché) y N incrementales (caché caliente), lee el metrics.json
 * de cada ejecución y agrega p50/p95 por etapa y total. El baseline se guarda
 * FUERA de `.quality-reports/cache` (`.quality-bench/baseline.json`) para no
 * contaminar los fingerprints del gate. No es parte del gate: es diagnóstico.
 * Fixtures: `--fixture small|medium` inyecta un scope-manifest determinista
 * (bench-fixtures.mjs) que referencía archivos reales sin tocar el árbol;
 * `representative` (default) usa el alcance git real. */

function parseArgs(argv) {
  const parsed = { taskId: '028A-16', clean: 5, incremental: 5, json: DEFAULT_OUT, jsonExplicit: false, dryRun: false, fixture: 'representative' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task') parsed.taskId = argv[++index] ?? parsed.taskId;
    else if (arg === '--clean') parsed.clean = Number(argv[++index]) || 5;
    else if (arg === '--incremental') parsed.incremental = Number(argv[++index]) || 5;
    else if (arg === '--json') {
      parsed.json = argv[++index] ?? parsed.json;
      parsed.jsonExplicit = true;
    } else if (arg === '--fixture') parsed.fixture = argv[++index] ?? parsed.fixture;
    else if (arg === '--dry-run') parsed.dryRun = true;
  }
  if (parsed.fixture !== 'representative' && !FIXTURES[parsed.fixture]) {
    throw new Error(`Fixture desconocido: ${parsed.fixture} (small|medium|representative)`);
  }
  return parsed;
}

/* [028A-8] Localiza el metrics.json más reciente de la tarea bajo el árbol de
 * ramas: el branch key depende de la identidad git actual. */
async function latestMetrics(taskId) {
  const branchesRoot = path.join(projectRoot, '.quality-reports', 'branches');
  let best = null;
  let bestTime = 0;
  const branches = await readdir(branchesRoot, { withFileTypes: true }).catch(() => []);
  for (const branch of branches) {
    if (!branch.isDirectory()) continue;
    const metricsPath = path.join(branchesRoot, branch.name, taskId, 'metrics.json');
    try {
      const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
      const generatedAt = Date.parse(metrics.generatedAt);
      if (Number.isFinite(generatedAt) && generatedAt >= bestTime) {
        best = metrics;
        bestTime = generatedAt;
      }
    } catch { /* tarea sin métricas en esta rama */ }
  }
  return best;
}

/* [028A-8] Normaliza el resultado de execFile promisificado: en la RESOLUCIÓN
 * no existe campo `code` (solo stdout/stderr), así que `result.code !== 0`
 * daba true con undefined y marcaba como fallida toda ejecución exitosa
 * (regresión introducida al añadir el manejo de rechazo). En el rechazo,
 * `error.code` es el exit code real del subproceso. */
export function normalizeGateResult(resolved, rejected) {
  if (resolved) {
    return { code: 0, stdout: resolved.stdout ?? '', stderr: resolved.stderr ?? '' };
  }
  return { code: rejected?.code ?? 1, stderr: String(rejected?.stderr ?? rejected?.message ?? '') };
}

async function runGateOnce(taskId, fresh, extraArgs, startedAt = Date.now()) {
  const args = ['scripts/quality/task-check.mjs', taskId, ...extraArgs];
  if (fresh) args.push('--fresh');
  /* [028A-8] execFile promisificado RECHAZA cuando el gate sale no-cero
   * (FAIL/SETUP-ERROR): se captura para atribuir la ejecución y continuar el
   * benchmark en lugar de abortarlo a mitad con un stack trace — un gate que
   * falla es exactamente el caso que más interesa medir. */
  const result = await execFileAsync(process.execPath, args, { cwd: projectRoot, windowsHide: true, timeout: 5 * 60 * 1000 })
    .then(resolved => normalizeGateResult(resolved, null), rejected => normalizeGateResult(null, rejected));
  const metrics = await latestMetrics(taskId);
  /* [028A-8] Solo se atribuye la métrica si es más nueva que el arranque de la
   * ejecución: un run fallido que no escribió metrics.json no puede heredar en
   * silencio la ejecución anterior (atribución viciada). */
  const freshEnough = metrics && Number.isFinite(Date.parse(metrics.generatedAt))
    && Date.parse(metrics.generatedAt) >= startedAt;
  if (result.code !== 0 || !freshEnough) {
    return {
      failed: true,
      exitCode: result.code ?? 1,
      stderr: result.stderr ?? '',
      taskId,
      fresh,
    };
  }
  return { ...metrics, exitCode: result.code ?? 0 };
}

/* [028A-8] Agrega ejecuciones por etapa y total: p50/p95 con summarize. Las
 * ejecuciones fallidas (sin métricas) se cuentan en `failed` y no contaminan
 * los percentiles con duraciones heredadas. */
export function aggregateRuns(runs) {
  const succeeded = runs.filter(run => !run.failed);
  const stageNames = [...new Set(succeeded.flatMap(run => run.stages?.map(stage => stage.stage) ?? []))];
  const stages = stageNames.map(stage => {
    const samples = succeeded
      .flatMap(run => run.stages ?? [])
      .filter(item => item.stage === stage)
      .map(item => item.durationMs)
      .filter(Number.isFinite);
    return { stage, ...summarize(samples) };
  });
  return {
    runs: succeeded.length,
    failed: runs.length - succeeded.length,
    total: summarize(succeeded.map(run => run.durationMs).filter(Number.isFinite)),
    stages,
  };
}

/* [028A-8 Fase 0] Etiqueta del fixture para el baseline: representative usa
 * el alcance git real; los sintéticos llevan su id, tipos de cambio y tamaño. */
function fixtureLabel(fixture) {
  if (fixture.id === 'representative') return 'representative (alcance git real)';
  return `${fixture.id} — ${fixture.changeTypes.join(',')} · ${fixture.files} archivos`;
}

export function formatBaseline(baseline) {
  const lines = [`[bench] ${baseline.taskId} · ${fixtureLabel(baseline.fixture ?? { id: 'representative' })} · limpias ${baseline.clean.runs} · incrementales ${baseline.incremental.runs}`];
  for (const mode of ['clean', 'incremental']) {
    const section = baseline[mode];
    lines.push(`[bench] ${mode}: total p50 ${section.total.p50}ms · p95 ${section.total.p95}ms`);
    for (const stage of section.stages) {
      lines.push(`[bench]   ${stage.stage.padEnd(9)} p50 ${stage.p50 ?? '—'}ms · p95 ${stage.p95 ?? '—'}ms (${stage.samples} muestras)`);
    }
  }
  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  /* [028A-8] Sin --json explícito, el baseline se guarda por fixture para no
   * sobrescribir representative al correr small y medium seguidos. */
  const jsonPath = args.jsonExplicit ? args.json : path.join(projectRoot, '.quality-bench', `baseline-${args.fixture}.json`);
  /* [028A-8] Fixture sintético: se materializa el scope-manifest en
   * .quality-bench/manifests/ (fuera de la caché del gate) y se pasa con
   * --scope-manifest; loadInjectedScope valida rutas y transportes. Los
   * archivos referenciados deben existir (un ENOENT falsearía la medición). */
  let extraArgs = [];
  let fixture;
  if (args.fixture === 'representative') {
    fixture = { id: 'representative', changeTypes: ['git'], files: null };
  } else {
    const definition = FIXTURES[args.fixture];
    const missing = await validateFixtureFiles(definition, projectRoot);
    if (missing.length > 0) {
      throw new Error(`Fixture ${args.fixture}: archivos ausentes del workspace: ${missing.join(', ')}`);
    }
    const manifest = fixtureManifest(args.fixture);
    const manifestPath = path.join(projectRoot, '.quality-bench', 'manifests', `${args.fixture}-${args.taskId}.json`);
    await mkdir(path.dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    extraArgs = ['--scope-manifest', manifestPath];
    fixture = {
      id: definition.id,
      label: definition.label,
      changeTypes: definition.changeTypes,
      files: definition.files.length,
      deletedFiles: definition.deletedFiles.length,
    };
  }
  if (args.dryRun) {
    process.stdout.write(`[bench] Dry run: ${args.clean} limpias + ${args.incremental} incrementales de ${args.taskId} — ${fixtureLabel(fixture)} → ${path.relative(projectRoot, jsonPath)}\n`);
    return;
  }
  const cleanRuns = [];
  for (let index = 0; index < args.clean; index += 1) cleanRuns.push(await runGateOnce(args.taskId, true, extraArgs, Date.now()));
  const incrementalRuns = [];
  for (let index = 0; index < args.incremental; index += 1) incrementalRuns.push(await runGateOnce(args.taskId, false, extraArgs, Date.now()));
  const baseline = {
    schemaVersion: 1,
    taskId: args.taskId,
    fixture,
    generatedAt: new Date().toISOString(),
    machine: { platform: process.platform, arch: process.arch, node: process.version },
    clean: aggregateRuns(cleanRuns),
    incremental: aggregateRuns(incrementalRuns),
  };
  await mkdir(path.dirname(jsonPath), { recursive: true });
  if (baseline.clean.failed || baseline.incremental.failed) {
    process.stderr.write(`[bench] AVISO: ${baseline.clean.failed + baseline.incremental.failed} ejecuciones fallidas no entran en los percentiles.\n`);
  }
  await writeFile(jsonPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
  for (const line of formatBaseline(baseline)) process.stdout.write(`${line}\n`);
  process.stdout.write(`[bench] Detalle: ${path.relative(projectRoot, jsonPath)}\n`);
}

/* [028A-8] Guarda de entrada: solo se ejecuta el benchmark cuando este módulo
 * es el entry point. Sin ella, importar las funciones puras desde un test
 * lanzaba las 10 ejecuciones del gate por efecto lateral (bug preexistente
 * que ralentizaba toda la suite quality:test). */
const isEntryPoint = typeof process.argv[1] === 'string'
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) await main();
