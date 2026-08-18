import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { branchReportRoot, resolveBranchIdentity } from '../branch-identity.mjs';
import { evaluateStageBudgets, insufficientBudgetStages, percentile, readEffectiveBudgets, summarize } from '../quality-profile.mjs';

const execFileAsync = promisify(execFile);
const PROFILE_SCRIPT = path.join(process.cwd(), 'scripts', 'quality', 'quality-profile.mjs');

test('percentile calcula p50 y p95 nearest-rank sin mutar la entrada', () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile([...values].sort((a, b) => a - b), 0.5), 5);
  assert.equal(percentile([...values].sort((a, b) => a - b), 0.95), 10);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([7], 0.5), 7);
  assert.equal(percentile([100, 400], 0.95), 400);
});

test('summarize agrupa p50/p95/min/max/mean y descarta no finitos', () => {
  const summary = summarize([100, 200, 300, 400, 500, Number.NaN, Number.POSITIVE_INFINITY]);
  assert.equal(summary.samples, 5);
  assert.equal(summary.p50, 300);
  assert.equal(summary.p95, 500);
  assert.equal(summary.min, 100);
  assert.equal(summary.max, 500);
  assert.equal(summary.mean, 300);
  assert.deepEqual(summarize([]), { samples: 0, p50: null, p95: null, min: null, max: null, mean: null });
});

test('evaluateStageBudgets solo declara regresión con muestras y p95 suficientes (028A-8 Fase 0)', () => {
  const profile = {
    stages: [
      { stage: 'varsense', samples: 8, p50: 9000, p95: 12000 },
      { stage: 'sentinel', samples: 2, p95: 5000 },
      { stage: 'docs', samples: 6, p95: 10 },
    ],
  };
  const budgets = { varsense: 10000, sentinel: 3000, docs: 100 };
  const violations = evaluateStageBudgets(profile, budgets, 5);
  assert.deepEqual(violations, [{ stage: 'varsense', budgetMs: 10000, p95: 12000, samples: 8 }]);
  assert.equal(evaluateStageBudgets(profile, {}, 5).length, 0, 'sin presupuestos no hay regresión');
  assert.equal(evaluateStageBudgets(profile, null, 5).length, 0);
});

test('evaluateStageBudgets ignora etapas sin muestras suficientes (variación aislada)', () => {
  const profile = { stages: [{ stage: 'sentinel', samples: 3, p95: 99999 }] };
  assert.deepEqual(evaluateStageBudgets(profile, { sentinel: 100 }, 5), []);
  assert.deepEqual(evaluateStageBudgets(profile, { sentinel: 100 }, 2), [{ stage: 'sentinel', budgetMs: 100, p95: 99999, samples: 3 }]);
});

test('insufficientBudgetStages lista la evidencia insuficiente sin declarar regresión (028A-8 Fase 1)', () => {
  const profile = {
    stages: [
      { stage: 'varsense', samples: 3, p95: 99999 },
      { stage: 'sentinel', samples: 0, p95: null },
      { stage: 'docs', samples: 8, p95: 500 },
    ],
  };
  const budgets = { varsense: 6000, sentinel: 3000, docs: 1000 };
  assert.deepEqual(insufficientBudgetStages(profile, budgets, 5), [
    { stage: 'varsense', budgetMs: 6000, samples: 3, p95: 99999 },
  ]);
  assert.deepEqual(insufficientBudgetStages(profile, {}, 5), [], 'sin presupuestos no hay evidencia pendiente');
  assert.deepEqual(insufficientBudgetStages(profile, null, 5), []);
});

test('quality-profile lee reportes reales y calcula p50/p95 por etapa (028A-8 Fase 4)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-profile-'));
  try {
    const branchRoot = path.join(root, 'wandorius--test');
    await mkdir(path.join(branchRoot, 'T-1'), { recursive: true });
    await mkdir(path.join(branchRoot, 'T-2'), { recursive: true });
    const report = (taskId, sentinelMs, varsenseMs, totalMs, cache) => JSON.stringify({
      taskId,
      generatedAt: '2026-08-05T00:00:00.000Z',
      durationMs: totalMs,
      stages: [
        { stage: 'sentinel', status: 'pass', durationMs: sentinelMs, findings: [], summary: 'ok', cache },
        { stage: 'varsense', status: 'pass', durationMs: varsenseMs, findings: [], summary: 'ok', cache },
      ],
    });
    await writeFile(path.join(branchRoot, 'T-1', 'latest.json'), report('T-1', 100, 200, 300, 'hit'), 'utf8');
    await writeFile(path.join(branchRoot, 'T-2', 'latest.json'), report('T-2', 400, 500, 900, 'miss'), 'utf8');
    const { collectReports, buildProfile } = await import('../quality-profile.mjs');
    const entries = await collectReports(branchRoot, null, 20);
    assert.equal(entries.length, 2);
    const profile = buildProfile(entries);
    assert.equal(profile.reports, 2);
    assert.equal(profile.total.p50, 300);
    assert.equal(profile.total.p95, 900);
    const sentinel = profile.stages.find(stage => stage.stage === 'sentinel');
    assert.equal(sentinel.p50, 100);
    assert.equal(sentinel.p95, 400);
    assert.equal(sentinel.cacheHits, 1, 'un miss no puede contar como hit (precedencia ?? vs ?:)');
    const varsense = profile.stages.find(stage => stage.stage === 'varsense');
    assert.equal(varsense.p50, 200);
    assert.equal(varsense.p95, 500);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('readEffectiveBudgets carga stageTimeBudgets de quality.config.json y filtra valores inválidos (028A-8 Fase 1)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-budgets-'));
  try {
    await writeFile(path.join(root, 'quality.config.json'), JSON.stringify({ stageTimeBudgets: { varsense: 6000, sentinel: 'x', nada: -1 } }), 'utf8');
    assert.deepEqual(await readEffectiveBudgets(root), { varsense: 6000 });
    await rm(path.join(root, 'quality.config.json'));
    assert.equal(await readEffectiveBudgets(root), null, 'sin quality.config.json no hay presupuesto efectivo');
    await writeFile(path.join(root, 'quality.config.json'), JSON.stringify({ performanceBudgets: {} }), 'utf8');
    assert.equal(await readEffectiveBudgets(root), null, 'sin stageTimeBudgets no hay presupuesto efectivo');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/* [028A-8 Fase 1] Helpers del E2E: un repo git aislado con rama propia y
 * reportes de fixture; el perfil se ejecuta como proceso real con
 * --project-root para no tocar el checkout del consumidor. */
async function git(root, args) {
  await execFileAsync('git', args, { cwd: root, windowsHide: true });
}

async function makeProfileRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-profile-e2e-'));
  await git(root, ['init', '-b', 'wandorius-f1']);
  await git(root, ['config', 'user.email', 'e2e@test.local']);
  await git(root, ['config', 'user.name', 'e2e']);
  await writeFile(path.join(root, 'seed.txt'), 'seed\n', 'utf8');
  await git(root, ['add', '-A']);
  await git(root, ['commit', '-m', 'seed']);
  await writeFile(path.join(root, 'quality.config.json'), `${JSON.stringify({ stageTimeBudgets: { varsense: 6000, sentinel: 3000 } })}\n`, 'utf8');
  const identity = await resolveBranchIdentity(root);
  const branchRoot = branchReportRoot(root, identity);
  return { root, branchRoot };
}

async function seedReports(branchRoot, taskIds, varsenseMs) {
  for (const taskId of taskIds) {
    const dir = path.join(branchRoot, taskId);
    await mkdir(dir, { recursive: true });
    const report = {
      taskId,
      generatedAt: '2026-08-05T00:00:00.000Z',
      durationMs: varsenseMs + 100,
      stages: [
        { stage: 'sentinel', status: 'pass', durationMs: 100, findings: [], summary: 'ok', cache: 'hit' },
        { stage: 'varsense', status: 'pass', durationMs: varsenseMs, findings: [], summary: 'ok', cache: 'hit' },
      ],
    };
    await writeFile(path.join(dir, 'latest.json'), `${JSON.stringify(report)}\n`, 'utf8');
  }
}

async function runProfile(root, args) {
  try {
    const result = await execFileAsync(process.execPath, [PROFILE_SCRIPT, '--project-root', root, ...args], {
      cwd: root,
      windowsHide: true,
      timeout: 30_000,
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

test('quality-profile CLI e2e: --budgets sin valor carga la config efectiva y declara regresión con exit 1 (028A-8 Fase 1)', async () => {
  const { root, branchRoot } = await makeProfileRepo();
  try {
    await seedReports(branchRoot, ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6'], 7000);
    const result = await runProfile(root, ['--limit', '50', '--budgets']);
    assert.equal(result.code, 1, `p95 7000 > presupuesto 6000 debe emitir exit 1; stderr=${result.stderr}`);
    assert.match(result.stderr, /REGRESIÓN varsense/);
    const profile = JSON.parse(await readFile(path.join(branchRoot, 'profile', 'latest.json'), 'utf8'));
    assert.equal(profile.budget.source, 'config-efectiva');
    assert.ok(profile.budget.violations.some(v => v.stage === 'varsense'), 'reporte estructurado del presupuesto');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quality-profile CLI e2e: --budgets-json override inequívoco gana y sin regresión termina exit 0 (028A-8 Fase 1)', async () => {
  const { root, branchRoot } = await makeProfileRepo();
  try {
    await seedReports(branchRoot, ['T-1', 'T-2', 'T-3', 'T-4', 'T-5', 'T-6'], 7000);
    const result = await runProfile(root, ['--limit', '50', '--budgets-json', '{"varsense": 99999}']);
    assert.equal(result.code, 0, `override amplio no declara regresión; stderr=${result.stderr}`);
    const profile = JSON.parse(await readFile(path.join(branchRoot, 'profile', 'latest.json'), 'utf8'));
    assert.equal(profile.budget.source, 'override');
    assert.equal(profile.budget.violations.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quality-profile CLI e2e: presupuestos no declaran regresión con muestras insuficientes y exponen “sin evidencia” (028A-8 Fase 1)', async () => {
  const { root, branchRoot } = await makeProfileRepo();
  try {
    await seedReports(branchRoot, ['T-1'], 7000);
    const result = await runProfile(root, ['--budgets']);
    assert.equal(result.code, 0, `1 muestra < minSamples no declara regresión; stderr=${result.stderr}`);
    assert.match(result.stderr, /SIN EVIDENCIA varsense/, 'la falta de evidencia se expone, no se oculta');
    const profile = JSON.parse(await readFile(path.join(branchRoot, 'profile', 'latest.json'), 'utf8'));
    assert.equal(profile.budget.violations.length, 0);
    assert.ok(profile.budget.insufficient.some(item => item.stage === 'varsense' && item.samples === 1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quality-profile CLI e2e: --budgets-json inválido termina exit 2 sin escribir perfil (028A-8 Fase 1)', async () => {
  const { root, branchRoot } = await makeProfileRepo();
  try {
    await seedReports(branchRoot, ['T-1'], 7000);
    const result = await runProfile(root, ['--budgets-json', '{no-es-json']);
    assert.equal(result.code, 2, `JSON inválido debe terminar exit 2; stdout=${result.stdout}`);
    assert.match(result.stderr, /JSON válido/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
