import assert from 'node:assert/strict';
import { access, lstat, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main } from '../sentinel-doctor.mjs';

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

test('doctor migrate dry-run no escribe y conserva los tres contratos legacy', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-doctor-migration-'));
  const sources = {
    sentinel: JSON.stringify({ includePatterns: ['**/*.ts'], rules: { 'catch-vacio': { severidad: 'error' } } }),
    quality: JSON.stringify({ schemaVersion: 1, maxConcurrentStages: 1, heavyRun: { cooldownMinutes: 180 } }),
    varsense: JSON.stringify({ includePatterns: ['frontend/**/*.css'], tokenDetection: { duplicate: { enabled: true } } }),
    tools: JSON.stringify({ schemaVersion: 1, installRoot: '.quality-tools', tools: {
      sentinel: { version: '0.4.0', commit: 'sentinel-commit', outputSchemaVersion: '1' },
      varsense: { version: '2.2.0', commit: 'varsense-commit', outputSchemaVersion: '1' },
    } }),
  };
  const paths = {
    sentinel: path.join(root, 'sentinel.config.json'),
    quality: path.join(root, 'quality.config.json'),
    varsense: path.join(root, 'varsense.config.json'),
    tools: path.join(root, 'quality-tools.json'),
  };
  try {
    await Promise.all([
      writeFile(paths.sentinel, sources.sentinel),
      writeFile(paths.quality, sources.quality),
      writeFile(paths.varsense, sources.varsense),
      writeFile(paths.tools, sources.tools),
    ]);
    await main(['--migrate', '--dry-run', '--json', '--cwd', root]);
    assert.equal(await readFile(paths.sentinel, 'utf8'), sources.sentinel);
    assert.equal(await readFile(paths.quality, 'utf8'), sources.quality);
    assert.equal(await readFile(paths.varsense, 'utf8'), sources.varsense);
    assert.equal(await readFile(paths.tools, 'utf8'), sources.tools);
    assert.equal(await exists(path.join(root, 'sentinel.config.v2.preview.json')), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('doctor rechaza contratos legacy enlazados fuera del workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-doctor-link-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sentinel-doctor-link-outside-'));
  try {
    await writeFile(path.join(root, 'sentinel.config.json'), JSON.stringify({ includePatterns: [] }));
    await writeFile(path.join(root, 'quality.config.json'), '{}');
    await writeFile(path.join(root, 'quality-tools.json'), JSON.stringify({ schemaVersion: 1, installRoot: '.quality-tools', tools: {
      sentinel: { version: '0.4.0', commit: 'a' }, varsense: { version: '2.2.0', commit: 'b' },
    }}));
    await writeFile(path.join(outside, 'varsense.config.json'), '{}');
    await symlink(path.join(outside, 'varsense.config.json'), path.join(root, 'varsense.config.json'), 'file');
    await assert.rejects(
      () => main(['--migrate', '--dry-run', '--json', '--cwd', root]),
      /varsense.config.json: no puede ser symlink/,
    );
    const metadata = await lstat(path.join(root, 'varsense.config.json'));
    assert.equal(metadata.isSymbolicLink(), true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
