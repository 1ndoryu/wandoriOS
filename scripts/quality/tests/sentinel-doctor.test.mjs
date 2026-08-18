import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main, resolveSentinelCli } from '../sentinel-doctor.mjs';

async function makeManifest(root, cli = 'fake-doctor.mjs') {
  await writeFile(path.join(root, 'quality-tools.json'), JSON.stringify({
    schemaVersion: 1,
    installRoot: '.quality-tools',
    tools: { sentinel: { sourcePath: '.', cli, version: '0.7.0' } },
  }));
}

test('quality doctor resuelve el CLI fijado por sourcePath', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-doctor-cli-'));
  try {
    await makeManifest(root);
    await writeFile(path.join(root, 'fake-doctor.mjs'), 'process.stdout.write("{}\\n");\n');
    assert.equal(await resolveSentinelCli(root), path.join(root, 'fake-doctor.mjs'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quality doctor falla cerrado si el CLI fijado no existe', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-doctor-missing-'));
  try {
    await makeManifest(root, 'missing.mjs');
    await assert.rejects(() => resolveSentinelCli(root), /No se encontró el CLI fijado/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('quality doctor propaga el exit code del CLI canónico', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-doctor-error-'));
  const previousExitCode = process.exitCode;
  try {
    await makeManifest(root);
    await writeFile(path.join(root, 'fake-doctor.mjs'), 'process.stdout.write("{\\"ready\\":false}\\n"); process.exitCode = 7;\n');
    process.exitCode = undefined;
    await main(['--json', '--cwd', root]);
    assert.equal(process.exitCode, 7);
  } finally {
    process.exitCode = previousExitCode;
    await rm(root, { recursive: true, force: true });
  }
});
