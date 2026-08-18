/* [108A-1 Fase 3] Tests del benchmark de VarSense: fixture determinista,
 * benchmark JSON versionado con p50/p95 por modo, presupuesto efectivo con
 * exit != 0 ante regresión confirmada y evidencia insuficiente visible. */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { benchVarsense, buildFixture } from '../bench-varsense.mjs';

const execFileAsync = promisify(execFile);
const BENCH_SCRIPT = path.join(process.cwd(), 'scripts', 'quality', 'bench-varsense.mjs');
const PINNED_CLI = path.join(process.cwd(), 'tools', 'varsense', 'dist', 'cli', 'index.js');

test('buildFixture genera un fixture determinista con extensión variada (108A-1 F3)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'varsense-fixture-'));
  try {
    const built = await buildFixture('tiny', root);
    assert.equal(built.files, 2);
    assert.ok(built.relative.includes('file-000.css'), 'índice 0 es CSS (variable index)');
    assert.ok(built.relative.includes('file-001.ts'), 'índice 1 es TS');
    const second = await buildFixture('tiny', root);
    assert.deepStrictEqual(second.relative, built.relative, 'fixture reproducible');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('benchVarsense emite benchmark JSON versionado con modos y fases (108A-1 F3)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'varsense-bench-'));
  try {
    const args = { samples: 1, fixture: 'tiny', varsenseCli: PINNED_CLI, json: null, budgets: null, budgetsJson: null };
    const benchmark = await benchVarsense(args, root);
    assert.equal(benchmark.schemaVersion, 1);
    assert.equal(benchmark.fixture.size, 'tiny');
    assert.equal(benchmark.fixture.files, 2);
    assert.equal(benchmark.samples, 1);
    for (const mode of ['cold-scoped', 'warm-scoped', 'cold-full', 'warm-full']) {
      const entry = benchmark.modes[mode];
      assert.ok(entry, `modo ${mode} presente`);
      assert.ok(Number.isFinite(entry.durationMs.p50), `${mode} p50 numérico`);
      assert.ok(entry.metrics.filesDiscovered.p50 >= 1, `${mode} descubre archivos`);
    }
    assert.ok(Number.isFinite(benchmark.modes['warm-scoped'].metrics.peakRssMb.p50), 'RSS pico medido');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('presupuesto efectivo: warm-scoped dentro de presupuesto termina exit 0; regresión confirmada exit 1 (108A-1 F3)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'varsense-bench-budget-'));
  try {
    await writeFile(path.join(root, 'quality.config.json'), JSON.stringify({ stageTimeBudgets: { varsense: 6000 } }), 'utf8');
    const args = { samples: 5, fixture: 'tiny', varsenseCli: PINNED_CLI, json: null, budgets: 'effective', budgetsJson: null };
    const ok = await benchVarsense(args, root);
    assert.deepStrictEqual(ok.budget.violations, [], 'scoped real está muy por debajo de 6 s');
    assert.equal(ok.budget.source, 'config-efectiva');

    const tight = { ...args, budgetsJson: '{"varsense": 1}' };
    const regression = await benchVarsense(tight, root);
    assert.ok(regression.budget.violations.some(v => v.stage === 'varsense'), 'presupuesto de 1 ms declara regresión confirmada');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('bench-varsense CLI e2e: proceso real escribe benchmark y respeta exit codes (108A-1 F3)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'varsense-bench-e2e-'));
  const outputPath = path.join(root, 'benchmark.json');
  try {
    const run = async extra => {
      try {
        /* 5 muestras: suficiente para que minSamples permita declarar
         * regresión (con 1 muestra el bench reporta SIN EVIDENCIA, exit 0). */
        const result = await execFileAsync(process.execPath, [BENCH_SCRIPT, '--fixture', 'tiny', '--samples', '5', '--json', outputPath, '--varsense-cli', PINNED_CLI, ...extra], { cwd: process.cwd(), windowsHide: true, timeout: 120_000 });
        return { code: 0, stdout: result.stdout, stderr: result.stderr };
      } catch (error) {
        return { code: error.code ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
      }
    };
    const ok = await run(['--budgets']);
    assert.equal(ok.code, 0, `bench sin regresión exit 0; stderr=${ok.stderr}`);
    const benchmark = JSON.parse(await readFile(outputPath, 'utf8'));
    assert.equal(benchmark.schemaVersion, 1);
    assert.ok(benchmark.budget.active, 'presupuesto efectivo activo');
    const regression = await run(['--budgets-json', '{"varsense": 1}']);
    assert.equal(regression.code, 1, 'regresión confirmada exit 1');
    assert.match(regression.stderr, /REGRESIÓN varsense/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
