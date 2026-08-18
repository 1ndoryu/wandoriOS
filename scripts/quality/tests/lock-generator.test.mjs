import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkLock, generateLock, parseLockArgs, writeLock } from '../lock-generator.mjs';

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-lock-generator-'));
  const toolRoot = path.join(root, '.quality-tools', 'sentinel');
  await mkdir(path.join(toolRoot, 'out'), { recursive: true });
  await writeFile(path.join(toolRoot, 'out', 'cli.js'), "process.stdout.write('0.4.0\\n');\n", 'utf8');
  await writeFile(path.join(toolRoot, 'README.md'), 'fixture\n', 'utf8');
  execFileSync('git', ['init', '-q'], { cwd: toolRoot });
  execFileSync('git', ['add', '.'], { cwd: toolRoot });
  execFileSync('git', ['-c', 'user.email=lock@test', '-c', 'user.name=lock', 'commit', '-qm', 'fixture'], { cwd: toolRoot });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: toolRoot, encoding: 'utf8' }).trim();
  await writeFile(path.join(root, 'quality-tools.json'), JSON.stringify({
    schemaVersion: 1,
    installRoot: '.quality-tools',
    tools: {
      sentinel: {
        repository: 'fixture',
        commit,
        version: '0.4.0',
        outputSchemaVersion: '1',
        cli: 'out/cli.js',
      },
    },
  }), 'utf8');
  return { root, toolRoot };
}

async function createCapabilityFixture() {
  const fixture = await createFixture();
  const manifestPath = path.join(fixture.root, 'quality-tools.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.tools.sentinel.capabilities = { filesFrom: true };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return fixture;
}

test('parsea modos de lock y exige --lock para --write en doctor', () => {
  assert.deepEqual(parseLockArgs(['--check', '--json']), { mode: 'check', cwd: process.cwd(), json: true });
  assert.deepEqual(parseLockArgs(['--write', '--cwd', 'fixture']), { mode: 'write', cwd: 'fixture', json: false });
});

test('generateLock conserva capacidades declaradas en el lock', async () => {
  const fixture = await createCapabilityFixture();
  try {
    const result = await generateLock(fixture.root);
    assert.deepEqual(result.lock.analyzers.sentinel.capabilities, { filesFrom: true });
    await writeFile(path.join(fixture.root, 'sentinel.lock.json'), `${JSON.stringify(result.lock, null, 2)}\n`, 'utf8');
    assert.equal((await checkLock(fixture.root)).ok, true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('generateLock inspecciona el analyzer y construye un lock válido', async () => {
  const fixture = await createFixture();
  try {
    const result = await generateLock(fixture.root);
    assert.equal(result.lock.schemaVersion, 1);
    assert.equal(result.lock.runtime.status, 'project-adapter');
    assert.equal(result.lock.analyzers.sentinel.version, '0.4.0');
    assert.match(result.lock.analyzers.sentinel.sha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('--check no escribe y detecta lock ausente o desactualizado', async () => {
  const fixture = await createFixture();
  try {
    const missing = await checkLock(fixture.root);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason, 'missing');
    const generated = await writeLock(fixture.root);
    const before = await readFile(generated.lockPath, 'utf8');
    const metadataBefore = await stat(generated.lockPath);
    const checked = await checkLock(fixture.root);
    assert.equal(checked.ok, true);
    assert.equal(await readFile(generated.lockPath, 'utf8'), before);
    assert.equal((await stat(generated.lockPath)).mtimeMs, metadataBefore.mtimeMs);
    const changed = JSON.parse(before);
    changed.analyzers.sentinel.sha256 = 'e'.repeat(64);
    await writeFile(generated.lockPath, `${JSON.stringify(changed, null, 2)}\n`, 'utf8');
    const mismatch = await checkLock(fixture.root);
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.reason, 'mismatch');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('--write conserva backup previo y reemplaza de forma atómica', async () => {
  const fixture = await createFixture();
  try {
    const first = await writeLock(fixture.root);
    const firstContent = await readFile(first.lockPath, 'utf8');
    const second = await writeLock(fixture.root);
    assert.equal(second.backupCreated, true);
    assert.equal(await readFile(second.backupPath, 'utf8'), firstContent);
    assert.match(await readFile(second.lockPath, 'utf8'), /"generatedAt"/);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('--write rechaza un backup symlink antes de copiar', async () => {
  const fixture = await createFixture();
  try {
    const first = await writeLock(fixture.root);
    const outside = path.join(path.dirname(fixture.root), 'outside-lock-backup.txt');
    await writeFile(outside, 'outside\n', 'utf8');
    await rm(first.backupPath, { force: true });
    await symlink(outside, first.backupPath);
    await assert.rejects(() => writeLock(fixture.root), /sentinel\.lock\.json\.bak: no se puede reemplazar un symlink/);
    assert.equal(await readFile(outside, 'utf8'), 'outside\n');
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('generateLock rechaza checkout modificado antes de escribir', async () => {
  const fixture = await createFixture();
  try {
    await writeFile(path.join(fixture.toolRoot, 'README.md'), 'tampered\n', 'utf8');
    await assert.rejects(() => generateLock(fixture.root), /checkout modificado/);
    assert.equal(await readFile(path.join(fixture.root, 'quality-tools.json'), 'utf8') !== '', true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
