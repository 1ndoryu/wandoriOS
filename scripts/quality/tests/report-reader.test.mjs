import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LEGACY_REPORT_COMPATIBILITY, readQualityReport } from '../report-reader.mjs';

const branch = {
  branchKeyVersion: 1,
  canonicalRef: 'main',
  branchKey: 'main--0d6e4079e36703eb',
  commit: '0123456789abcdef0123456789abcdef01234567',
  shortCommit: '0123456789ab',
  source: 'test',
};

function report(taskId, branchValue = branch, decision = 'PASS') {
  return { schemaVersion: 1, taskId, branch: branchValue, decision: { label: decision }, stages: [] };
}

test('el reporte canónico gana y se valida con metadata exacta', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-'));
  try {
    await mkdir(path.join(root, '.quality-reports', 'branches', branch.branchKey, '028A-6'), { recursive: true });
    await mkdir(path.join(root, '.quality-reports', '028A-6'), { recursive: true });
    await writeFile(path.join(root, '.quality-reports', 'branches', branch.branchKey, '028A-6', 'latest.json'), JSON.stringify(report('028A-6', branch, 'PASS')));
    await writeFile(path.join(root, '.quality-reports', '028A-6', 'latest.json'), JSON.stringify(report('028A-6', null, 'FAIL')));
    const result = await readQualityReport({ projectRoot: root, taskId: '028A-6', branch });
    assert.equal(result.status, 'canonical');
    assert.equal(result.report.decision.label, 'PASS');  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('JSON canónico corrupto no hace fallback al reporte legacy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-'));
  try {
    await mkdir(path.join(root, '.quality-reports', 'branches', branch.branchKey, '028A-6'), { recursive: true });
    await mkdir(path.join(root, '.quality-reports', '028A-6'), { recursive: true });
    await writeFile(path.join(root, '.quality-reports', 'branches', branch.branchKey, '028A-6', 'latest.json'), '{invalid');
    await writeFile(path.join(root, '.quality-reports', '028A-6', 'latest.json'), JSON.stringify(report('028A-6', branch)));
    await assert.rejects(
      readQualityReport({ projectRoot: root, taskId: '028A-6', branch }),
      /JSON inválido/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test('legacy solo se acepta con metadata exacta y sin metadata queda ambiguo', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-'));
  try {
    await mkdir(path.join(root, '.quality-reports', '028A-6'), { recursive: true });
    await writeFile(path.join(root, '.quality-reports', '028A-6', 'latest.json'), JSON.stringify(report('028A-6', null)));
    const ambiguous = await readQualityReport({ projectRoot: root, taskId: '028A-6', branch });
    assert.equal(ambiguous.status, 'legacy-ambiguous');
    assert.deepEqual(ambiguous.compatibility, LEGACY_REPORT_COMPATIBILITY);
    assert.equal(ambiguous.warning, LEGACY_REPORT_COMPATIBILITY.warning);
    await writeFile(path.join(root, '.quality-reports', '028A-6', 'latest.json'), JSON.stringify(report('028A-6', branch)));
    const compatible = await readQualityReport({ projectRoot: root, taskId: '028A-6', branch });
    assert.equal(compatible.status, 'legacy-compatible');
    assert.equal(compatible.compatibility.mode, 'legacy-read-only');
    assert.equal(compatible.compatibility.maxRuntimeVersions, 2);
    assert.equal(compatible.compatibility.retireAfterCompatibilityVersion, 3);
    assert.equal(compatible.warning, LEGACY_REPORT_COMPATIBILITY.warning);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reader rechaza symlink en el namespace de reportes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-outside-'));
  try {
    await mkdir(path.join(root, '.quality-reports', 'branches'), { recursive: true });
    await symlink(outside, path.join(root, '.quality-reports', 'branches', branch.branchKey), 'junction');
    await assert.rejects(
      readQualityReport({ projectRoot: root, taskId: '028A-6', branch }),
      /no puede ser symlink|fuera de .quality-reports/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('reader rechaza la raíz .quality-reports symlink aunque falte el reporte', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'quality-reader-outside-'));
  try {
    await symlink(outside, path.join(root, '.quality-reports'), 'junction');
    await assert.rejects(
      readQualityReport({ projectRoot: root, taskId: '028A-6', branch }),
      /\.quality-reports no puede ser symlink|fuera del workspace/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
