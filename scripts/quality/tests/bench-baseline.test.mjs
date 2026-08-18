import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateRuns, formatBaseline, normalizeGateResult } from '../bench-baseline.mjs';

function run(taskId, durationMs, stages) {
  return { taskId, durationMs, stages };
}

test('aggregateRuns calcula p50/p95 por etapa y total (028A-8 Fase 0)', () => {
  const runs = [
    run('T', 300, [{ stage: 'sentinel', durationMs: 100 }, { stage: 'varsense', durationMs: 200 }]),
    run('T', 900, [{ stage: 'sentinel', durationMs: 400 }, { stage: 'varsense', durationMs: 500 }]),
  ];
  const aggregate = aggregateRuns(runs);
  assert.equal(aggregate.runs, 2);
  assert.equal(aggregate.total.p50, 300);
  assert.equal(aggregate.total.p95, 900);
  const sentinel = aggregate.stages.find(item => item.stage === 'sentinel');
  assert.equal(sentinel.p50, 100);
  assert.equal(sentinel.p95, 400);
  assert.equal(sentinel.samples, 2);
});

test('aggregateRuns excluye ejecuciones fallidas y las cuenta aparte', () => {
  const aggregate = aggregateRuns([
    run('T', 500, [{ stage: 'sentinel', durationMs: 100 }]),
    { failed: true, exitCode: 1, stderr: 'error', taskId: 'T', fresh: false },
  ]);
  assert.equal(aggregate.runs, 1);
  assert.equal(aggregate.failed, 1);
  assert.equal(aggregate.total.p50, 500);
  assert.equal(aggregate.stages[0].samples, 1);
});

test('aggregateRuns ignora duraciones no finitas y etapas sin muestras', () => {
  const aggregate = aggregateRuns([
    run('T', 500, [{ stage: 'sentinel', durationMs: Number.NaN }, { stage: 'docs', durationMs: null }]),
  ]);
  assert.equal(aggregate.stages.find(item => item.stage === 'sentinel').samples, 0);
  assert.equal(aggregate.stages.find(item => item.stage === 'sentinel').p50, null);
  assert.equal(aggregate.runs, 1);
});

test('formatBaseline imprime p50/p95 por modo y etapa', () => {
  const baseline = {
    taskId: '028A-16',
    clean: { runs: 1, total: { p50: 100, p95: 200 }, stages: [{ stage: 'sentinel', p50: 50, p95: 90, samples: 1 }] },
    incremental: { runs: 1, total: { p50: 20, p95: 30 }, stages: [] },
  };
  const lines = formatBaseline(baseline);
  assert.match(lines[0], /028A-16/);
  assert.match(lines[1], /clean: total p50 100ms · p95 200ms/);
  assert.ok(lines.some(line => line.includes('sentinel') && line.includes('p50 50ms')));
});

test('formatBaseline etiqueta fixtures sintéticos sin undefined (028A-8 Fase 0)', () => {
  const baseline = {
    taskId: '028A-16',
    fixture: { id: 'small', changeTypes: ['ts', 'css'], files: 2, deletedFiles: 0 },
    clean: { runs: 0, total: { p50: null, p95: null }, stages: [] },
    incremental: { runs: 0, total: { p50: null, p95: null }, stages: [] },
  };
  const lines = formatBaseline(baseline);
  assert.match(lines[0], /small — ts,css · 2 archivos/);
  assert.equal(lines[0].includes('undefined'), false);
});

test('normalizeGateResult resuelve code 0 en éxito y el exit code real en rechazo (028A-8)', () => {
  /* Regresión 1e2628bd: execFile resuelve sin campo `code`; la comprobación
   * `result.code !== 0` marcaba fallida toda ejecución exitosa. */
  const resolved = normalizeGateResult({ stdout: 'ok', stderr: '' }, null);
  assert.equal(resolved.code, 0);
  assert.equal(resolved.stdout, 'ok');
  const rejected = normalizeGateResult(null, { code: 2, stderr: 'boom' });
  assert.equal(rejected.code, 2);
  assert.equal(rejected.stderr, 'boom');
  const withoutCode = normalizeGateResult(null, { message: 'ENOENT' });
  assert.equal(withoutCode.code, 1);
});
