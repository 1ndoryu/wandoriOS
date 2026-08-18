#!/usr/bin/env node
/* [108A-1 Fase 3] Benchmark de VarSense (auditoría §14 F3): mide el análisis
 * en un fixture determinista por modos cold/warm × scoped/full, publica un
 * benchmark JSON versionado (schemaVersion, estado, muestras, p50/p95 por
 * fase y métricas) y declara regresión confirmada con exit != 0 cuando el p95
 * del modo warm-scoped (el del gate) supera el presupuesto efectivo
 * (quality.config.json → stageTimeBudgets.varsense, 6.000 ms).
 *
 * Fases (phaseDurationMs) y métricas las publica el CLI v2.2.0+ instrumentado
 * (108A-1 F3); con el CLI pineado actual el bench funciona igual (durationMs +
 * metrics) y las fases quedan null hasta adoptar el release (F8).
 *
 * Uso: node scripts/quality/bench-varsense.mjs [--samples N] [--fixture
 * tiny|small|full] [--varsense-cli <ruta>] [--budgets|--budgets-json <json>]
 * [--json <ruta>] */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './runner.mjs';
import { percentile, summarize } from './quality-profile.mjs';
import { evaluateStageBudgets, insufficientBudgetStages, readEffectiveBudgets } from './quality-profile.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BENCH_ROOT = path.join(projectRoot, '.quality-bench', 'varsense');
const DEFAULT_CLI = path.join(projectRoot, 'tools', 'varsense', 'dist', 'cli', 'index.js');
const FIXTURE_SIZES = { tiny: 2, small: 12, full: 120 };
const SCOPED_FRACTION = 0.3;

function parseArgs(argv) {
  const parsed = {
    samples: 3, fixture: 'small', varsenseCli: DEFAULT_CLI, json: null,
    budgets: null, budgetsJson: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--samples') parsed.samples = Number(argv[++index]) || 3;
    else if (arg === '--fixture') parsed.fixture = argv[++index] ?? 'small';
    else if (arg === '--varsense-cli') parsed.varsenseCli = path.resolve(argv[++index] ?? DEFAULT_CLI);
    else if (arg === '--json') parsed.json = argv[++index] ?? null;
    else if (arg === '--budgets') parsed.budgets = 'effective';
    else if (arg === '--budgets-json') parsed.budgetsJson = argv[++index] ?? null;
    else if (arg.startsWith('--budgets=')) parsed.budgetsJson = arg.slice('--budgets='.length);
    else throw new Error(`Opción no reconocida: ${arg}`);
  }
  return parsed;
}

/* Fixture determinista: archivos que ejercitan índice de variables, índice de
 * clases y análisis documental (CSS vars + className). El hash del contenido
 * forma parte de la identidad del benchmark. */
function fixtureFile(extension, index) {
  if (extension === '.css') {
    const accent = index % 5;
    return `:root { --accent-${accent}: #f00; }\n.card-${index % 7} { background: var(--accent-${accent}); }\n`;
  }
  if (extension === '.tsx') {
    return `import React from 'react';\nexport const value${index} = '${index}';\nconst style${index} = { color: 'var(--accent-${index % 5})' };\nexport default function Component${index}() {\n  return <div className={'card card-${index % 7}'} style={style${index}}>${index}</div>;\n}\n`;
  }
  return `export const value${index} = '${index}';\nconst color${index} = 'var(--accent-${index % 5})';\nexport function fn${index}(): string { return color${index}; }\n`;
}

export async function buildFixture(size, target) {
  const files = FIXTURE_SIZES[size] ?? FIXTURE_SIZES.small;
  const extensions = [];
  for (let index = 0; index < files; index += 1) {
    extensions.push(index % 5 === 0 ? '.css' : index % 3 === 0 ? '.tsx' : '.ts');
  }
  const relative = [];
  for (let index = 0; index < extensions.length; index += 1) {
    const name = `file-${String(index).padStart(3, '0')}${extensions[index]}`;
    await writeFile(path.join(target, name), fixtureFile(extensions[index], index), 'utf8');
    relative.push(name);
  }
  return { files, relative };
}

async function fixtureHash(target) {
  const hash = createHash('sha256');
  for (const name of ['file-000.css', 'file-001.ts']) {
    const full = path.join(target, name);
    hash.update(name);
    try { hash.update(await readFile(full)); } catch { hash.update('[missing]'); }
  }
  return hash.digest('hex').slice(0, 16);
}

async function runOnce(cli, workspace, args, indexDir) {
  const invocation = [cli, 'all', '--workspace', workspace, '--format', 'json'];
  if (indexDir) invocation.push('--index-dir', indexDir);
  if (args.filesFrom) invocation.push('--files-from', args.filesFrom);
  const started = Date.now();
  const result = await runProcess(process.execPath, invocation, { cwd: projectRoot, timeoutMs: 120_000 });
  const totalMs = Date.now() - started;
  /* Exit 1 = hallazgos de severidad error (normal en un fixture); el JSON
   * sigue en stdout. Exit >1 = fallo de herramienta/uso: aborta el bench. */
  if (result.code > 1) {
    throw new Error(`varsense bench falló (exit ${result.code}): ${result.stderr?.slice(0, 500) ?? ''}`);
  }
  const report = JSON.parse(result.stdout);
  return {
    durationMs: totalMs,
    cliDurationMs: report.durationMs ?? null,
    phaseDurationMs: report.phaseDurationMs ?? null,
    metrics: report.metrics ?? null,
    cache: report.cache ?? null,
  };
}

async function measureMode(cli, workspace, indexDir, filesFrom, samples) {
  const warmUp = indexDir ? await runOnce(cli, workspace, { filesFrom }, indexDir) : null;
  const durations = [];
  const cliDurations = [];
  const phases = {};
  const metricKeys = ['peakRssMb', 'filesDiscovered', 'filesAnalyzed', 'filesReused', 'cacheHitRate'];
  const metricValues = Object.fromEntries(metricKeys.map(key => [key, []]));
  for (let sample = 0; sample < samples; sample += 1) {
    const run = await runOnce(cli, workspace, { filesFrom }, indexDir);
    durations.push(run.durationMs);
    if (run.cliDurationMs !== null) cliDurations.push(run.cliDurationMs);
    for (const [phase, ms] of Object.entries(run.phaseDurationMs ?? {})) {
      (phases[phase] ??= []).push(ms);
    }
    for (const key of metricKeys) {
      const value = run.metrics?.[key];
      if (typeof value === 'number') metricValues[key].push(value);
    }
  }
  return {
    samples: durations.length,
    durationMs: summarize(durations),
    cliDurationMs: cliDurations.length > 0 ? summarize(cliDurations) : null,
    phaseDurationMs: Object.fromEntries(Object.entries(phases).map(([phase, values]) => [phase, summarize(values)])),
    metrics: Object.fromEntries(metricKeys.map(key => [key, summarize(metricValues[key])])),
    cacheHitRate: metricValues.cacheHitRate.length > 0
      ? summarize(metricValues.cacheHitRate.map(value => value * 1000)).p50 / 1000
      : null,
  };
}

export async function benchVarsense(args, root = projectRoot) {
  const fixtureRoot = path.join(root, '.quality-bench', 'varsense', 'fixture', args.fixture);
  await mkdir(fixtureRoot, { recursive: true });
  const built = await buildFixture(args.fixture, fixtureRoot);
  const indexDir = path.join(root, '.quality-bench', 'varsense', 'index');
  /* El CLI resuelve --files-from relativo al workspace: el manifiesto vive
   * dentro del fixture (.txt no entra en los patrones de análisis). */
  const manifestName = '.scope.txt';
  const manifestPath = path.join(fixtureRoot, manifestName);
  const scopedCount = Math.max(1, Math.round(built.files * SCOPED_FRACTION));
  await writeFile(manifestPath, `${built.relative.slice(0, scopedCount).join('\n')}\n`, 'utf8');
  await rm(indexDir, { recursive: true, force: true });

  const modes = {};
  modes['cold-scoped'] = await measureMode(args.varsenseCli, fixtureRoot, null, manifestPath, args.samples);
  modes['warm-scoped'] = await measureMode(args.varsenseCli, fixtureRoot, indexDir, manifestPath, args.samples);
  modes['cold-full'] = await measureMode(args.varsenseCli, fixtureRoot, null, null, args.samples);
  modes['warm-full'] = await measureMode(args.varsenseCli, fixtureRoot, indexDir, null, args.samples);

  let toolVersion = 'unknown';
  try { toolVersion = JSON.parse(await readFile(path.join(root, 'tools', 'varsense', 'package.json'), 'utf8')).version; } catch { /* versión no disponible */ }

  const benchmark = {
    schemaVersion: 1,
    tool: { name: 'varsense', version: toolVersion, cli: path.relative(root, args.varsenseCli) },
    fixture: { size: args.fixture, files: built.files, scoped: scopedCount, hash: await fixtureHash(fixtureRoot) },
    generatedAt: new Date().toISOString(),
    samples: args.samples,
    modes,
  };

  let budgets = null;
  if (args.budgetsJson !== null) {
    try { budgets = JSON.parse(args.budgetsJson); }
    catch {
      process.stderr.write('[bench-varsense] --budgets-json no contiene JSON válido\n');
      process.exitCode = 2;
      return benchmark;
    }
  } else if (args.budgets === 'effective') {
    budgets = await readEffectiveBudgets(root);
  }
  if (budgets) {
    /* [108A-1 Fase 3] El presupuesto aplica al modo del gate (warm-scoped):
     * la fase de análisis scoped con índice persistente debe quedar ≤6 s
     * (stageTimeBudgets.varsense). */
    const profileForBudgets = {
      stages: [{ stage: 'varsense', samples: modes['warm-scoped'].samples, p95: modes['warm-scoped'].durationMs.p95 }],
    };
    benchmark.budget = {
      source: args.budgetsJson !== null ? 'override' : 'config-efectiva',
      active: true,
      violations: evaluateStageBudgets(profileForBudgets, budgets),
      insufficient: insufficientBudgetStages(profileForBudgets, budgets),
    };
  }
  return benchmark;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const benchmark = await benchVarsense(args);
  const outputPath = path.resolve(args.json ?? path.join(projectRoot, '.quality-bench', 'varsense', 'benchmark.json'));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(benchmark, null, 2)}\n`, 'utf8');
  const warm = benchmark.modes['warm-scoped'];
  console.log(`[bench-varsense] fixture ${benchmark.fixture.size} (${benchmark.fixture.files} archivos, ${benchmark.fixture.scoped} scoped) · varsense ${benchmark.tool.version} · ${benchmark.samples} muestras`);
  console.log(`[bench-varsense] warm-scoped p50 ${warm.durationMs.p50}ms · p95 ${warm.durationMs.p95}ms`);
  if (warm.phaseDurationMs) {
    for (const [phase, summary] of Object.entries(warm.phaseDurationMs)) {
      console.log(`[bench-varsense]   ${phase.padEnd(16)} p50 ${summary.p50}ms · p95 ${summary.p95}ms`);
    }
  }
  if (benchmark.budget?.violations.length > 0) {
    for (const violation of benchmark.budget.violations) {
      process.stderr.write(`[bench-varsense] REGRESIÓN ${violation.stage}: p95 ${violation.p95}ms > presupuesto ${violation.budgetMs}ms (${violation.samples} muestras)\n`);
    }
    process.exitCode = 1;
  } else if (benchmark.budget?.insufficient.length > 0) {
    for (const item of benchmark.budget.insufficient) {
      process.stderr.write(`[bench-varsense] SIN EVIDENCIA ${item.stage}: ${item.samples} muestra(s), se requieren 5\n`);
    }
  }
  process.stdout.write(`[bench-varsense] Detalle: ${path.relative(projectRoot, outputPath)}\n`);
}

const isEntryPoint = typeof process.argv[1] === 'string'
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) await main();
