import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createReport } from '../reporter.mjs';
import { runReportRetentionBestEffort } from '../report-retention-stage.mjs';

const branch = {
  branchKeyVersion: 1,
  canonicalRef: 'main',
  branchKey: 'main--1111111111111111',
  commit: '0123456789abcdef0123456789abcdef01234567',
  shortCommit: '0123456789ab',
  source: 'test',
};

test('retención best-effort registra fallo sin convertirlo en fallo del reporte', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-retention-stage-'));
  const reportRoot = path.join(projectRoot, '.quality-reports', branch.branchKey, '028A-6');
  try {
    await mkdir(reportRoot, { recursive: true });
    const retention = await runReportRetentionBestEffort({
      projectRoot,
      currentBranchKey: branch.branchKey,
      currentTaskId: '028A-6',
      config: {},
      prune: async () => { throw new Error('filesystem ocupado'); },
    });
    const reportResult = await createReport(
      {
        projectRoot,
        reportRoot,
        qualityConfig: { maxFindings: 3 },
        tools: {},
        branch,
        reportRetention: retention,
        policyIdentity: {
          projectRoot,
          policyPath: null,
          policyHash: 'test-policy',
          runtimeVersion: 'test',
          decision: { status: 'policy', mode: 'enforce', action: 'enforce', blocked: false, reason: 'fixture' },
          reason: 'fixture',
          recommendedCommand: 'npm run task:check -- 028A-6',
        },
      },
      { taskId: '028A-6', ci: false, full: false },
      { base: 'HEAD', full: false, files: [], profiles: [] },
      [{ stage: 'fixture', status: 'pass', durationMs: 1, findings: [], summary: 'fixture pass' }],
      [],
      Date.now(),
    );
    const persisted = JSON.parse(await readFile(reportResult.jsonPath, 'utf8'));
    assert.deepEqual(retention, { status: 'error', message: 'filesystem ocupado' });
    assert.equal(reportResult.report.decision.label, 'PASS');
    assert.equal(reportResult.report.decision.exitCode, 0);
    assert.equal(persisted.reportRetention.status, 'error');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('retención best-effort conserva el resultado de poda exitosa', async () => {
  const expected = { status: 'pass', removed: [], overQuota: false };
  const result = await runReportRetentionBestEffort({
    projectRoot: 'C:/fixture',
    currentBranchKey: 'main--1111111111111111',
    currentTaskId: '028A-6',
    config: {},
    prune: async () => expected,
  });
  assert.equal(result, expected);
});
