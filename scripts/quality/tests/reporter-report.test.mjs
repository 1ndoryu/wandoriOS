import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compactLines, createReport } from '../reporter.mjs';

test('el reporte expone OVERRIDE (concedida/denegada) y el detalle de etapa con métricas (028A-16/028A-8)', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-override-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-OVR'), { recursive: true });
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-OVR'),
        qualityConfig: { maxFindings: 3, maxReminders: 4 },
        tools: {},
        heavyOverride: { source: 'flag', granted: true, reason: 'validar fase' },
      },
      { taskId: 'T-OVR', ci: false, full: false },
      { base: 'HEAD', full: false, files: [], profiles: [] },
      [{
        stage: 'varsense', status: 'pass', cache: 'miss', cacheReason: 'fingerprint-mismatch', durationMs: 1500,
        metrics: { filesAnalyzed: 16, filesReused: 364, cacheHitRate: 1, peakRssMb: 89.5 },
        findings: [], summary: '0 errores',
      }],
      [],
      Date.now(),
    );
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    assert.equal(json.heavyOverride.source, 'flag');
    assert.equal(json.heavyOverride.granted, true);
    assert.equal(json.heavyOverride.reason, 'validar fase');
    assert.equal(json.stages[0].cacheReason, 'fingerprint-mismatch');
    assert.equal(json.stages[0].metrics.filesReused, 364);
    const markdown = await readFile(result.markdownPath, 'utf8');
    assert.match(markdown, /OVERRIDE/);
    assert.match(markdown, /concedida/);
    assert.match(markdown, /reusados 364/);
    assert.match(markdown, /invalidación: fingerprint-mismatch/);
    const metrics = JSON.parse(await readFile(result.metricsPath, 'utf8'));
    assert.equal(metrics.stages[0].cache, 'miss');
    assert.equal(metrics.stages[0].cacheReason, 'fingerprint-mismatch');
    assert.equal(metrics.stages[0].metrics.filesReused, 364);
    assert.equal(metrics.stages[0].durationMs, 1500);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('el reporte refleja el mantenimiento de índices (podados/cooldown/error) (028A-8 Fase 4)', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-index-'));
  try {
    const base = async indexMaintenance => {
      await mkdir(path.join(projectRoot, '.quality-reports', 'T-IDX'), { recursive: true });
      return createReport(
        { projectRoot, reportRoot: path.join(projectRoot, '.quality-reports', 'T-IDX'), qualityConfig: { maxFindings: 3 }, tools: {}, indexMaintenance },
        { taskId: 'T-IDX', ci: false, full: false },
        { base: 'HEAD', full: false, files: [], profiles: [] },
        [{ stage: 'sentinel', status: 'pass', durationMs: 1, findings: [], summary: '0 errores' }],
        [],
        Date.now(),
      );
    };
    const pruned = await base({ status: 'pass', removed: [{ branchKey: 'b-1', index: 'varsense', reason: 'age' }], remainingBytes: 100 });
    const json = JSON.parse(await readFile(pruned.jsonPath, 'utf8'));
    assert.equal(json.indexMaintenance.removed.length, 1);
    assert.match(await readFile(pruned.markdownPath, 'utf8'), /Índices: \*\*1 podados\*\*/);
    const cooldown = await base({ status: 'pass', skipped: 'cooldown' });
    assert.match(await readFile(cooldown.markdownPath, 'utf8'), /Índices: supervisados hace menos de la ventana/);
    const broken = await base({ status: 'error', message: 'disk lleno' });
    assert.match(await readFile(broken.markdownPath, 'utf8'), /Índices: \*\*error no bloqueante\*\*/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('createReport representa cancelación con exit code 130', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-cancelled-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-CANCEL'), { recursive: true });
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-CANCEL'),
        qualityConfig: { maxFindings: 3 },
        tools: {},
      },
      { taskId: 'T-CANCEL', ci: false, full: false },
      { base: 'HEAD', full: false, files: [], profiles: [] },
      [{ stage: 'sentinel', status: 'error', state: 'cancelled', durationMs: 1, findings: [], summary: 'cancelled' }],
      [],
      Date.now(),
    );
    assert.equal(result.report.decision.label, 'CANCELLED');
    assert.equal(result.report.decision.exitCode, 130);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('createReport serializa la identidad de política en JSON y Markdown', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-policy-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-2'), { recursive: true });
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-2'),
        qualityConfig: { maxFindings: 3 },
        tools: {},
        policyIdentity: {
          projectRoot,
          policyPath: path.join(projectRoot, 'sentinel.config.json'),
          policyHash: 'policy-hash-test',
          runtimeVersion: '0.4.0',
          decision: { status: 'policy', mode: 'enforce', action: 'enforce', blocked: false, reason: 'política v2 válida' },
          reason: 'política v2 válida',
          recommendedCommand: 'npm run task:check -- T-2',
        },
      },
      { taskId: 'T-2', ci: false, full: true },
      { base: 'HEAD', full: true, executionFull: false, profileOverride: true, files: [], profiles: ['docs'] },
      [{ stage: 'sentinel', status: 'pass', durationMs: 1, findings: [], summary: '0 errores' }],
      [],
      Date.now(),
    );
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    const markdown = await readFile(result.markdownPath, 'utf8');
    assert.equal(json.policy.policyHash, 'policy-hash-test');
    assert.equal(json.mode, 'local-light');
    assert.equal(json.scope.full, true);
    assert.equal(json.scope.executionFull, false);
    assert.match(markdown, /policy-hash-test/);
    assert.match(markdown, /política v2 válida/);
    /* [028A-8] El reporte expone el motivo del alcance efectivo. */
    assert.equal(json.scope.effectiveFull, false);
    assert.equal(json.scope.fullReason, null);
    assert.match(markdown, /Alcance/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('createReport refleja un full diferido con effectiveFull=false y motivo', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-deferred-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-DEFER'), { recursive: true });
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-DEFER'),
        qualityConfig: { maxFindings: 3 },
        tools: {},
      },
      { taskId: 'T-DEFER', ci: false, full: false },
      {
        base: 'HEAD',
        full: true,
        requestedFull: true,
        automaticFull: true,
        effectiveFull: false,
        fullReason: 'heavy-deferred',
        heavyDeferred: true,
        files: ['scripts/quality/scope.mjs'],
        profiles: [],
      },
      [{ stage: 'sentinel', status: 'pass', durationMs: 1, findings: [], summary: '0 errores' }],
      [],
      Date.now(),
    );
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    assert.equal(json.scope.full, true);
    assert.equal(json.scope.effectiveFull, false);
    assert.equal(json.scope.fullReason, 'heavy-deferred');
    assert.equal(json.scope.heavyDeferred, true);
    const compact = compactLines(result, { projectRoot, qualityConfig: { maxFindings: 3 } });
    assert.match(compact.join('\n'), /heavy-deferred/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
