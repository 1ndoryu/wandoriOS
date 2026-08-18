import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fingerprint, probeCachedPass, readCachedPass, writeCachedPass } from '../cache.mjs';

test('cache de calidad distingue pass, cambios de archivo y formato', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-cache-'));
  try {
    await writeFile(path.join(projectRoot, 'input.ts'), 'export const value = 1;\n', 'utf8');
    const context = {
      projectRoot,
      qualityConfig: { schemaVersion: 1, lockWaitMs: 0 },
      toolManifest: { schemaVersion: 1, tools: {} },
      policy: { policyHash: 'policy-a' },
      lock: { schemaVersion: 1, analyzers: { sentinel: { sha256: 'lock-a' } } },
    };
    const scope = { files: ['input.ts'], fingerprintFiles: ['input.ts'] };
    const first = await fingerprint(context, scope, 'frontend');
    await writeCachedPass(context, 'frontend', first, { status: 'pass', durationMs: 3 });
    const cached = await readCachedPass(context, 'frontend', first);
    assert.equal(cached.cached, true);
    assert.equal(cached.status, 'pass');

    await writeFile(path.join(projectRoot, 'input.ts'), 'export const value = 2;\n', 'utf8');
    const second = await fingerprint(context, scope, 'frontend');
    assert.notEqual(second, first);
    assert.equal(await readCachedPass(context, 'frontend', second), null);
    assert.match(await readFile(path.join(projectRoot, '.quality-reports', 'cache', 'frontend.json'), 'utf8'), /fingerprint/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('cache separa el modo local del gate CI', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-cache-mode-'));
  try {
    await writeFile(path.join(projectRoot, 'input.ts'), 'export const value = 1;\n', 'utf8');
    const base = {
      projectRoot,
      qualityConfig: { schemaVersion: 1, lockWaitMs: 0 },
      toolManifest: { schemaVersion: 1, tools: {} },
      policy: { policyHash: 'policy-a' },
      lock: { schemaVersion: 1, analyzers: { sentinel: { sha256: 'lock-a' } } },
    };
    const scope = { files: ['input.ts'], fingerprintFiles: ['input.ts'] };
    const local = await fingerprint({ ...base, ci: false, full: false }, scope, 'frontend');
    const full = await fingerprint({ ...base, ci: false, full: true }, scope, 'frontend');
    const ci = await fingerprint({ ...base, ci: true, full: false }, scope, 'frontend');
    assert.notEqual(local, full);
    assert.notEqual(local, ci);
    const changedPolicy = await fingerprint({ ...base, policy: { policyHash: 'policy-b' } }, scope, 'frontend');
    assert.notEqual(local, changedPolicy);
    const changedLock = await fingerprint({ ...base, lock: { schemaVersion: 1, analyzers: { sentinel: { sha256: 'lock-b' } } } }, scope, 'frontend');
    assert.notEqual(local, changedLock);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('probeCachedPass distingue no-entry, fingerprint-mismatch y match (028A-8 Fase 4)', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-cache-probe-'));
  try {
    await writeFile(path.join(projectRoot, 'input.ts'), 'export const value = 1;\n', 'utf8');
    const context = {
      projectRoot,
      qualityConfig: { schemaVersion: 1, lockWaitMs: 0 },
      toolManifest: { schemaVersion: 1, tools: {} },
      policy: { policyHash: 'policy-a' },
      lock: { schemaVersion: 1, analyzers: { sentinel: { sha256: 'lock-a' } } },
    };
    const scope = { files: ['input.ts'], fingerprintFiles: ['input.ts'] };
    const first = await fingerprint(context, scope, 'frontend');
    assert.deepEqual(await probeCachedPass(context, 'frontend', first), { hit: false, reason: 'no-entry' });
    await writeCachedPass(context, 'frontend', first, { status: 'pass', durationMs: 3 });
    const matched = await probeCachedPass(context, 'frontend', first);
    assert.equal(matched.hit, true);
    assert.equal(matched.reason, 'match');

    await writeFile(path.join(projectRoot, 'input.ts'), 'export const value = 2;\n', 'utf8');
    const second = await fingerprint(context, scope, 'frontend');
    assert.deepEqual(await probeCachedPass(context, 'frontend', second), { hit: false, reason: 'fingerprint-mismatch' });
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('cache usa el alcance efectivo del guard, no solo context.full (028A-8)', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-cache-effective-'));
  try {
    await writeFile(path.join(projectRoot, 'input.ts'), 'export const value = 1;\n', 'utf8');
    const base = {
      projectRoot,
      qualityConfig: { schemaVersion: 1, lockWaitMs: 0 },
      toolManifest: { schemaVersion: 1, tools: {} },
      policy: { policyHash: 'policy-a' },
      lock: { schemaVersion: 1, analyzers: { sentinel: { sha256: 'lock-a' } } },
    };
    const scope = { files: ['input.ts'], fingerprintFiles: ['input.ts'] };
    /* AutomaticFull permitido: context.full=false pero effectiveFull=true. */
    const automaticFull = await fingerprint({ ...base, ci: false, full: false }, { ...scope, effectiveFull: true }, 'frontend');
    const plainLocal = await fingerprint({ ...base, ci: false, full: false }, { ...scope, effectiveFull: false }, 'frontend');
    assert.notEqual(automaticFull, plainLocal, 'un automaticFull no puede reutilizar un PASS local-light');
    /* Full diferido: context.full=false y effectiveFull=false coinciden en
     * local-light y no contaminan el fingerprint de un full permitido. */
    const deferred = await fingerprint({ ...base, ci: false, full: false }, { ...scope, effectiveFull: false, requestedFull: true }, 'frontend');
    assert.equal(deferred, plainLocal);
    assert.notEqual(deferred, automaticFull);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
