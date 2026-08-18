import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertRuntimeLockHash,
  gitArchiveSha256,
  runtimeLockHash,
  verifyInstalledAnalyzers,
  validateLock,
  untrustedCheckoutChanges,
} from '../lockfile.mjs';

const manifest = {
  schemaVersion: 1,
  installRoot: '.quality-tools',
  tools: {
    sentinel: { version: '0.4.0', outputSchemaVersion: '1', commit: 'a'.repeat(40), patch: { path: 'sentinel.patch', sha256: 'e'.repeat(64) } },
    varsense: { version: '2.2.0', outputSchemaVersion: '1', commit: 'b'.repeat(40) },
  },
};

function validLock() {
  const runtime = { status: 'project-adapter', version: '1.0.0-local', commit: 'repo-scripts' };
  runtime.identitySha256 = runtimeLockHash(runtime.status, runtime.version, runtime.commit);
  runtime.artifactSha256 = null;
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-03T00:00:00.000Z',
    runtime,
    analyzers: {
      sentinel: { version: '0.4.0', protocolVersion: 1, commit: 'a'.repeat(40), sha256: 'c'.repeat(64), patchSha256: 'e'.repeat(64) },
      varsense: { version: '2.2.0', protocolVersion: 1, commit: 'b'.repeat(40), sha256: 'd'.repeat(64), patchSha256: null },
    },
  };
}

test('ignora únicamente metadata administrativa del instalador', () => {
  assert.deepEqual(untrustedCheckoutChanges(['?? .quality-install.json', ' M README.md'].join('\n')), [' M README.md']);
  assert.deepEqual(untrustedCheckoutChanges(['?? .quality-install.json', ' M README.md', '?? extra.txt'].join(String.fromCharCode(0))), [' M README.md', '?? extra.txt']);
});

test('valida lockfile y hash de runtime', () => {
  const lock = validLock();
  assert.doesNotThrow(() => validateLock(lock, manifest));
  assert.doesNotThrow(() => assertRuntimeLockHash(lock.runtime));
  assert.throws(() => assertRuntimeLockHash({ ...lock.runtime, identitySha256: '0'.repeat(64) }), /runtime.identitySha256/);
  const missingArtifact = { ...lock, runtime: { ...lock.runtime } };
  delete missingArtifact.runtime.artifactSha256;
  assert.throws(() => validateLock(missingArtifact, manifest), /artifactSha256 debe ser null/);
  assert.throws(() => validateLock({ ...lock, runtime: { ...lock.runtime, artifactSha256: undefined } }, manifest), /artifactSha256: SHA-256 inválido/);
  assert.throws(() => validateLock({ ...lock, runtime: { ...lock.runtime, status: 'installed', artifactSha256: null } }, manifest), /runtime instalado debe declarar artifactSha256/);
});

test('rechaza divergencia entre lockfile y quality-tools', () => {
  const lock = validLock();
  assert.throws(() => validateLock({ ...lock, analyzers: { ...lock.analyzers, sentinel: { ...lock.analyzers.sentinel, version: '9.9.9' } } }, manifest), /version no coincide/);
  assert.throws(() => validateLock({ ...lock, analyzers: { ...lock.analyzers, varsense: { ...lock.analyzers.varsense, sha256: 'bad' } } }, manifest), /SHA-256 inválido/);
  assert.throws(() => validateLock({ ...lock, analyzers: { ...lock.analyzers, sentinel: { ...lock.analyzers.sentinel, patchSha256: null } } }, manifest), /patchSha256 no coincide/);
  assert.throws(() => validateLock({ ...lock, runtime: { ...lock.runtime, status: 'not-installed', commit: 'repo-scripts' } }, manifest), /not-installed/);
});

test('valida capacidades declaradas del analyzer contra el lock', () => {
  const lock = validLock();
  const manifestWithCapability = {
    ...manifest,
    tools: {
      ...manifest.tools,
      varsense: { ...manifest.tools.varsense, capabilities: { filesFrom: true } },
    },
  };
  const lockWithCapability = {
    ...lock,
    analyzers: {
      ...lock.analyzers,
      varsense: { ...lock.analyzers.varsense, capabilities: { filesFrom: true } },
    },
  };
  assert.doesNotThrow(() => validateLock(lockWithCapability, manifestWithCapability));
  assert.throws(() => validateLock(lock, manifestWithCapability), /capabilities no coincide/);
  assert.throws(() => validateLock({ ...lockWithCapability, analyzers: { ...lockWithCapability.analyzers, varsense: { ...lockWithCapability.analyzers.varsense, capabilities: { filesFrom: false } } } }, manifestWithCapability), /capabilities no coincide/);
});

test('acepta la capacidad persistentIndex en manifest y lock', () => {
  const lock = validLock();
  const manifestWithCapability = {
    ...manifest,
    tools: {
      ...manifest.tools,
      varsense: { ...manifest.tools.varsense, capabilities: { filesFrom: true, persistentIndex: true } },
    },
  };
  const lockWithCapability = {
    ...lock,
    analyzers: {
      ...lock.analyzers,
      varsense: { ...lock.analyzers.varsense, capabilities: { filesFrom: true, persistentIndex: true } },
    },
  };
  assert.doesNotThrow(() => validateLock(lockWithCapability, manifestWithCapability));
  assert.throws(() => validateLock({ ...lockWithCapability, analyzers: { ...lockWithCapability.analyzers, varsense: { ...lockWithCapability.analyzers.varsense, capabilities: { persistentIndex: 'yes' } } } }, manifestWithCapability), /persistentIndex debe ser booleano/);
  assert.throws(() => validateLock({ ...lockWithCapability, analyzers: { ...lockWithCapability.analyzers, varsense: { ...lockWithCapability.analyzers.varsense, capabilities: { filesFrom: true, persistentIndex: true, extra: true } } } }, manifestWithCapability), /claves desconocidas/);
});

test('rechaza analyzer desconocido o campos extra', () => {
  const lock = validLock();
  assert.throws(() => validateLock({ ...lock, analyzers: { ...lock.analyzers, other: lock.analyzers.sentinel } }, manifest), /no coincide/);
  assert.throws(() => validateLock({ ...lock, extra: true }, manifest), /claves desconocidas/);
});

test('rechaza un checkout modificado antes de usar el hash del lockfile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-lock-modified-'));
  try {
    const toolRoot = path.join(root, 'sentinel');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(toolRoot, { recursive: true });
    await writeFile(path.join(toolRoot, 'file.txt'), 'changed\n', 'utf8');
    await writeFile(path.join(toolRoot, 'cli.js'), "process.stdout.write('0.4.0');\n", 'utf8');
    const { spawnSync } = await import('node:child_process');
    spawnSync('git', ['init', '-q'], { cwd: toolRoot });
    spawnSync('git', ['add', 'file.txt', 'cli.js'], { cwd: toolRoot });
    spawnSync('git', ['-c', 'user.email=lock@test', '-c', 'user.name=lock', 'commit', '-qm', 'fixture'], { cwd: toolRoot });
    await writeFile(path.join(toolRoot, 'file.txt'), 'tampered\n', 'utf8');
    const localManifest = { installRoot: '.', tools: { sentinel: { version: '0.4.0', outputSchemaVersion: '1', commit: 'x'.repeat(40), cli: 'cli.js' } } };
    const lock = { analyzers: { sentinel: { version: '0.4.0', commit: 'x'.repeat(40), sha256: 'a'.repeat(64) } } };
    await assert.rejects(() => verifyInstalledAnalyzers(root, localManifest, lock), /checkout modificado/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rechaza un patch raíz manipulado antes de confiar en el checkout', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-lock-patch-root-'));
  try {
    const toolRoot = path.join(root, '.quality-tools', 'sentinel');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.join(toolRoot, 'out'), { recursive: true });
    await writeFile(path.join(toolRoot, 'out', 'cli.js'), "process.stdout.write('0.4.0');\n", 'utf8');
    await writeFile(path.join(toolRoot, 'README.md'), 'base\n', 'utf8');
    const { spawnSync } = await import('node:child_process');
    spawnSync('git', ['init', '-q'], { cwd: toolRoot });
    spawnSync('git', ['add', '.'], { cwd: toolRoot });
    spawnSync('git', ['-c', 'user.email=lock@test', '-c', 'user.name=lock', 'commit', '-qm', 'fixture'], { cwd: toolRoot });
    await writeFile(path.join(toolRoot, 'README.md'), 'changed\n', 'utf8');
    const patch = 'diff --git a/README.md b/README.md\n';
    await writeFile(path.join(root, 'declared.patch'), patch, 'utf8');
    const localManifest = {
      installRoot: '.quality-tools',
      tools: { sentinel: { version: '0.4.0', outputSchemaVersion: '1', commit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: toolRoot, encoding: 'utf8' }).stdout.trim(), cli: 'out/cli.js', patch: { path: 'declared.patch', sha256: '0'.repeat(64) } } },
    };
    const lock = { analyzers: { sentinel: { version: '0.4.0', commit: localManifest.tools.sentinel.commit, sha256: 'a'.repeat(64), patchSha256: '0'.repeat(64) } } };
    await assert.rejects(() => verifyInstalledAnalyzers(root, localManifest, lock), /SHA-256 del patch declarado/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('gitArchiveSha256 es estable para un checkout Git', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-lock-git-'));
  try {
    await writeFile(path.join(root, 'file.txt'), 'lock fixture\n', 'utf8');
    const { spawnSync } = await import('node:child_process');
    spawnSync('git', ['init', '-q'], { cwd: root });
    spawnSync('git', ['add', 'file.txt'], { cwd: root });
    spawnSync('git', ['-c', 'user.email=lock@test', '-c', 'user.name=lock', 'commit', '-qm', 'fixture'], { cwd: root });
    const first = await gitArchiveSha256(root);
    const second = await gitArchiveSha256(root);
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
