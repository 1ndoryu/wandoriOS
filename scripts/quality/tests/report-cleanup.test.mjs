import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main } from '../report-cleanup.mjs';

test('report cleanup exige confirmación para borrar y dry-run por defecto', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-report-cli-'));
  try {
    await writeFile(path.join(projectRoot, 'quality.config.json'), JSON.stringify({ reportRetention: { maxAgeDays: 7, maxWorkspaceMiB: 1, maxBranchMiB: 1 } }));
    await assert.rejects(
      main(['--cleanup'], { projectRoot }),
      /requiere --cleanup --yes/,
    );
    const result = await main(['--dry-run'], {
      projectRoot,
      branchIdentity: {
        branchKeyVersion: 1,
        canonicalRef: 'test/cleanup',
        branchKey: 'test_2Fcleanup--1111111111111111',
        commit: '0123456789abcdef0123456789abcdef01234567',
        shortCommit: '0123456789ab',
        source: 'test',
      },
    });
    assert.equal(result.dryRun, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
