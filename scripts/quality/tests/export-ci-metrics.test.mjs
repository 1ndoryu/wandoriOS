import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildExportPayload, collectMetrics } from '../export-ci-metrics.mjs';

function metricsJson(taskId, generatedAt, mode, stages) {
  return JSON.stringify({
    schemaVersion: 1,
    taskId,
    generatedAt,
    durationMs: 5000,
    mode,
    branch: { branchKeyVersion: 1, canonicalRef: 'wandorius', branchKey: 'wandorius--abc', shortCommit: 'abc1234', commit: 'abc1234', source: 'git' },
    stages,
  });
}

test('collectMetrics agrega todos los metrics.json y ordena por generatedAt (028A-8 Fase 4)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-ci-metrics-'));
  try {
    const branchRoot = path.join(root, 'wandorius--abc');
    await mkdir(path.join(branchRoot, 'T-1'), { recursive: true });
    await mkdir(path.join(branchRoot, 'T-2'), { recursive: true });
    await mkdir(path.join(branchRoot, 'T-3'), { recursive: true });
    await writeFile(path.join(branchRoot, 'T-1', 'metrics.json'), metricsJson('T-1', '2026-08-05T10:00:00.000Z', 'local-light', [
      { stage: 'sentinel', status: 'pass', durationMs: 200, cache: 'hit', cacheReason: 'match', metrics: { filesReused: 10 } },
    ]), 'utf8');
    await writeFile(path.join(branchRoot, 'T-2', 'metrics.json'), metricsJson('T-2', '2026-08-05T11:00:00.000Z', 'ci', [
      { stage: 'varsense', status: 'pass', durationMs: 300, cache: 'miss', cacheReason: 'fingerprint-mismatch', metrics: { filesAnalyzed: 16 } },
    ]), 'utf8');
    /* Sin metrics.json: se omite sin error. */
    await writeFile(path.join(branchRoot, 'T-3', 'other.json'), '{}', 'utf8');
    const runs = await collectMetrics(root);
    assert.equal(runs.length, 2);
    assert.deepEqual(runs.map(run => run.taskId), ['T-1', 'T-2'], 'orden cronológico');
    assert.equal(runs[1].branch, 'wandorius');
    assert.equal(runs[1].mode, 'ci');
    assert.equal(runs[0].stages[0].cache, 'hit');
    assert.equal(runs[1].stages[0].metrics.filesAnalyzed, 16);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('buildExportPayload envuelve runs con schemaVersion y fecha de exportación', () => {
  const payload = buildExportPayload([{ taskId: 'T-1' }], '2026-08-05T12:00:00.000Z');
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.exportedAt, '2026-08-05T12:00:00.000Z');
  assert.equal(payload.runs.length, 1);
});

test('collectMetrics tolera branches sin directorio', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-ci-metrics-empty-'));
  try {
    const runs = await collectMetrics(path.join(root, 'no-existe'));
    assert.deepEqual(runs, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
