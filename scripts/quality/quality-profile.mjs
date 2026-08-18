#!/usr/bin/env node
/* [028A-8 Fase 4] Diagnóstico `quality:profile`: lee los últimos reportes del
 * gate (latest.json por tarea en la rama actual) y calcula p50/p95 de duración
 * por etapa y del total, sin ejecutar ninguna validación pesada. Es el alias
 * temporal de `sentinel profile <TareaId>` mientras no exista el runtime
 * global; la decisión de gate nunca pasa por aquí.
 *
 * [028A-8 Fase 1] Presupuestos conectados al comando (P1 de la auditoría):
 *   --budgets           sin valor → carga la config efectiva del proyecto
 *                       (quality.config.json → stageTimeBudgets)
 *   --budgets-json <j>  override explícito e inequívoco
 *   --budgets=<j>       idem, sintaxis compacta
 * La invocación natural `--budgets` ya no termina en silencio con exit 0:
 * ante regresión confirmada (muestras suficientes y p95 > presupuesto) emite
 * exit 1 y un reporte estructurado en el JSON del perfil.
 *
 * [028A-8 Fase 1] --project-root <dir> perfila otro checkout (worktree/CI)
 * sin depender del cwd; también se usa como base de la config efectiva. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { branchReportRoot, resolveBranchIdentity } from './branch-identity.mjs';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* [028A-8] Percentil nearest-rank: p50/p95 de una lista de duraciones ya
 * ordenada ascendentemente. En muestras pequeñas el p95 tiende al máximo,
 * que es exactamente lo que los presupuestos de calidad quieren vigilar. */
export function percentile(sortedAsc, ratio) {
  if (sortedAsc.length === 0) return null;
  const index = Math.min(sortedAsc.length - 1, Math.max(0, Math.ceil(ratio * sortedAsc.length) - 1));
  return sortedAsc[index];
}

export function summarize(values) {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return { samples: 0, p50: null, p95: null, min: null, max: null, mean: null };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return {
    samples: sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: Math.round(mean * 10) / 10,
  };
}

function parseArgs(argv) {
  const parsed = { taskId: null, limit: 20, json: null, budgets: null, budgetsJson: null, projectRoot: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task-id') parsed.taskId = argv[++index] ?? null;
    else if (arg === '--limit') parsed.limit = Number(argv[++index]) || 20;
    else if (arg === '--json') parsed.json = argv[++index] ?? null;
    else if (arg === '--project-root') parsed.projectRoot = argv[++index] ?? null;
    else if (arg === '--budgets') parsed.budgets = 'effective';
    else if (arg === '--budgets-json') parsed.budgetsJson = argv[++index] ?? null;
    else if (arg.startsWith('--budgets=')) parsed.budgetsJson = arg.slice('--budgets='.length);
    else throw new Error(`Opción no reconocida: ${arg}`);
  }
  return parsed;
}

/* [028A-8 Fase 1] Etapas con presupuesto declarado pero evidencia insuficiente
 * (0 < muestras < minSamples): el perfil NO declara regresión, pero tampoco
 * oculta la falta de evidencia. Muestra el estado “sin evidencia” en el
 * reporte estructurado en vez de descartarlo en silencio. */
export function insufficientBudgetStages(profile, budgets, minSamples = 5) {
  if (!budgets || typeof budgets !== 'object') return [];
  const insufficient = [];
  for (const [stage, budgetMs] of Object.entries(budgets)) {
    if (!Number.isInteger(budgetMs) || budgetMs < 1) continue;
    const found = profile.stages.find(item => item.stage === stage);
    if (!found || found.samples === 0 || found.samples >= minSamples) continue;
    insufficient.push({ stage, budgetMs, samples: found.samples, p95: found.p95 });
  }
  return insufficient;
}

/* [028A-8 Fase 1] Presupuestos efectivos declarados en quality.config.json
 * → stageTimeBudgets (p. ej. varsense: 6000). Sin la sección o sin valores
 * enteros positivos no hay presupuesto efectivo y el perfil no declara
 * regresión (muestras insuficientes tampoco: ver evaluateStageBudgets). */
export async function readEffectiveBudgets(root) {
  try {
    const raw = JSON.parse(await readFile(path.join(root, 'quality.config.json'), 'utf8'));
    const budgets = raw?.stageTimeBudgets;
    if (!budgets || typeof budgets !== 'object') return null;
    const effective = Object.fromEntries(
      Object.entries(budgets).filter(([, ms]) => Number.isInteger(ms) && ms >= 1),
    );
    return Object.keys(effective).length > 0 ? effective : null;
  } catch {
    return null;
  }
}

/* [028A-8 Fase 0] Presupuesto de tiempo por etapa que falla SOLO ante
 * regresión confirmada: exige muestras suficientes (>= minSamples) y que el
 * p95 supere el presupuesto. Una variación aislada de la máquina con pocas
 * ejecuciones nunca declara regresión. No es parte del gate: es diagnóstico. */
export function evaluateStageBudgets(profile, budgets, minSamples = 5) {
  if (!budgets || typeof budgets !== 'object') return [];
  const violations = [];
  for (const [stage, budgetMs] of Object.entries(budgets)) {
    if (!Number.isInteger(budgetMs) || budgetMs < 1) continue;
    const found = profile.stages.find(item => item.stage === stage);
    if (!found) continue;
    if (found.samples < minSamples) continue;
    if (found.p95 !== null && found.p95 > budgetMs) {
      violations.push({ stage, budgetMs, p95: found.p95, samples: found.samples });
    }
  }
  return violations;
}

/* [028A-8] Colecta latest.json de cada tarea bajo el branch; opcionalmente se
 * filtra por task ID y se limita a los reportes más recientes por generatedAt. */
export async function collectReports(branchRoot, taskId, limit) {
  const entries = [];
  const taskDirs = taskId ? [taskId] : (await readdir(branchRoot, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
  for (const dir of taskDirs) {
    try {
      const report = JSON.parse(await readFile(path.join(branchRoot, dir, 'latest.json'), 'utf8'));
      if (!Array.isArray(report.stages) || !Number.isFinite(report.durationMs)) continue;
      entries.push({ taskId: dir, generatedAt: report.generatedAt ?? '', report });
    } catch { /* Reporte ausente o inválido: se omite sin bloquear. */ }
  }
  entries.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : a.generatedAt > b.generatedAt ? -1 : 0));
  return entries.slice(0, limit);
}

export function buildProfile(entries) {
  const totals = entries.map(entry => entry.report.durationMs);
  const byStage = new Map();
  for (const { taskId, report } of entries) {
    for (const stage of report.stages ?? []) {
      if (!Number.isFinite(stage.durationMs)) continue;
      const key = String(stage.stage ?? 'unknown');
      if (!byStage.has(key)) byStage.set(key, []);
      /* [028A-8 Fase 4] Paréntesis explícitos: `??` liga más que `?:`, así que
       * `stage.cache ?? stage.cached ? ...` se evalúa como
       * `(stage.cache ?? stage.cached) ? ...` y un 'miss' string (truthy)
       * contaría como hit. El cache explícito gana; si falta, cae a `cached`. */
      const cache = stage.cache === 'hit' ? 'hit' : stage.cache === 'miss' ? 'miss' : (stage.cached ? 'hit' : 'miss');
      byStage.get(key).push({ taskId, durationMs: stage.durationMs, cache });
    }
  }
  const stages = [...byStage.entries()].map(([name, samples]) => ({
    stage: name,
    samples: samples.length,
    ...summarize(samples.map(item => item.durationMs)),
    cacheHits: samples.filter(item => item.cache === 'hit').length,
  })).sort((a, b) => a.stage.localeCompare(b.stage));
  return { generatedAt: new Date().toISOString(), reports: entries.length, total: summarize(totals), stages };
}

function renderCompact(profile) {
  const lines = [`[profile] Reportes: ${profile.reports} · Total p50 ${profile.total.p50}ms · p95 ${profile.total.p95}ms`];
  for (const stage of profile.stages) {
    lines.push(`[profile] ${stage.stage.padEnd(9)} p50 ${stage.p50}ms · p95 ${stage.p95}ms · hit ${stage.cacheHits}/${stage.samples}`);
  }
  if (profile.budget?.active) {
    const source = profile.budget.source === 'override' ? 'override explícito' : 'config efectiva';
    lines.push(`[profile] Presupuestos: ${source} · ${profile.budget.violations.length} regresión(es)`);
  }
  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.projectRoot ?? projectRoot);
  const identity = await resolveBranchIdentity(root);
  const branchRoot = branchReportRoot(root, identity);
  const entries = await collectReports(branchRoot, args.taskId, args.limit);
  if (entries.length === 0) {
    process.stderr.write(`[profile] Sin reportes en ${branchRoot}${args.taskId ? `/${args.taskId}` : ''}. Ejecuta primero el gate con una tarea.\n`);
    process.exitCode = 2;
    return;
  }
  const profile = buildProfile(entries);
  /* [028A-8 Fase 1] Presupuestos efectivos: `--budgets` (sin valor) carga la
   * config del proyecto; el override explícito e inequívoco va por
   * `--budgets-json <json>` o `--budgets=<json>`. La invocación natural
   * `--budgets` ya no deja budgets=null y termina exit 0 en silencio. */
  let budgets = null;
  if (args.budgetsJson !== null) {
    try { budgets = JSON.parse(args.budgetsJson); }
    catch {
      process.stderr.write('[profile] --budgets-json no contiene JSON válido; presupuestos ignorados\n');
      process.exitCode = 2;
      return;
    }
  } else if (args.budgets === 'effective') {
    budgets = await readEffectiveBudgets(root);
  }
  if (budgets) {
    profile.budget = {
      source: args.budgetsJson !== null ? 'override' : 'config-efectiva',
      active: true,
      violations: evaluateStageBudgets(profile, budgets),
      /* [028A-8 Fase 1] Sin ocultar la falta de evidencia: etapas presupuestadas
       * con muestras insuficientes se listan aquí en vez de descartarse en
       * silencio; no declaran regresión. */
      insufficient: insufficientBudgetStages(profile, budgets),
    };
  }
  const outputPath = path.resolve(args.json ?? path.join(branchRoot, 'profile', 'latest.json'));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  for (const line of renderCompact(profile)) console.log(line);
  /* [028A-8 Fase 0] Regresión confirmada: solo con muestras suficientes y p95
   * por encima del presupuesto. Exit 1 informa, no bloquea el gate. El reporte
   * estructurado del presupuesto queda en el JSON del perfil (budget). */
  if (profile.budget?.violations.length > 0) {
    for (const violation of profile.budget.violations) {
      process.stderr.write(`[profile] REGRESIÓN ${violation.stage}: p95 ${violation.p95}ms > presupuesto ${violation.budgetMs}ms (${violation.samples} muestras)\n`);
    }
    process.exitCode = 1;
  }
  if (profile.budget?.insufficient.length > 0) {
    for (const item of profile.budget.insufficient) {
      process.stderr.write(`[profile] SIN EVIDENCIA ${item.stage}: ${item.samples} muestra(s), se requieren 5; sin regresión declarada\n`);
    }
  }
  process.stdout.write(`[profile] Detalle: ${path.relative(root, outputPath)}\n`);
}

/* [028A-8] Guarda de entrada: importar las funciones puras desde un test no
 * debe escribir perfiles ni leer reportes (efecto lateral). */
const isEntryPoint = typeof process.argv[1] === 'string'
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) await main();
