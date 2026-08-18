import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expandLocalDependencies, filterDirectoryEntries, loadInjectedScope, matches, resolveExplicitProfiles, resolveFullDecision } from '../scope.mjs';

test('scope usa globs deterministas y normaliza separadores', () => {
  assert.equal(matches('frontend/src/router.ts', 'frontend/**/*.ts'), true);
  assert.equal(matches('frontend/router.ts', 'frontend/**/*.ts'), true);
  assert.equal(matches('frontend/src/router.test.ts', 'frontend/**/*.css'), false);
  assert.equal(matches('src/styles/app.css', '.css'), true);
  assert.equal(matches('scripts/quality/cache.mjs', 'scripts/quality/'), true);
  assert.equal(matches('frontend/src/router.ts', 'backend/**/*.ts'), false);
  assert.equal(matches('frontend\\src\\router.ts', 'frontend/**/*.ts'), true);
});

test('resolveExplicitProfiles aplica CLI sobre entorno y allowlist estricta', () => {
  const available = { docs: ['.md'], rust: ['.rs'] };
  const cli = resolveExplicitProfiles({ profiles: ['docs'] }, available, {
    GLORY_QUALITY_PROFILE: 'rust',
  });
  assert.equal(cli.explicit, true);
  assert.equal(cli.source, 'cli');
  assert.deepEqual([...cli.profiles], ['docs']);

  const env = resolveExplicitProfiles({ profiles: [] }, available, {
    GLORY_QUALITY_PROFILE: 'rust,docs,rust',
  });
  assert.equal(env.source, 'env');
  assert.deepEqual([...env.profiles], ['rust', 'docs']);
  assert.throws(
    () => resolveExplicitProfiles({ profiles: ['unknown'] }, available, {}),
    /Perfil no permitido: unknown/,
  );
  assert.throws(
    () => resolveExplicitProfiles({ profiles: ['auth'] }, { ...available, auth: ['auth'] }, {}),
    /Perfil sin etapa ejecutable: auth/,
  );
});

test('filterDirectoryEntries excluye directorios (gitlinks de submódulos) del scope (028A-6 Fase 4)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-scope-filter-'));
  try {
    await mkdir(path.join(root, 'tools', 'sentinel'), { recursive: true });
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'tools', 'sentinel', 'package.json'), '{}\n', 'utf8');
    await writeFile(path.join(root, 'src', 'main.ts'), 'export const value = 1;\n', 'utf8');
    /* filterDirectoryEntries conserva el orden de entrada; el sort final lo aplica detectScope. */
    const files = await filterDirectoryEntries(root, ['tools/sentinel', 'src/main.ts', 'deleted.rs']);
    assert.deepEqual(files, ['src/main.ts', 'deleted.rs']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scope incluye dependencias locales en el fingerprint incremental', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-scope-'));
  try {
    await writeFile(path.join(root, 'entry.ts'), "import { value } from './dependency';\nexport { value };\n", 'utf8');
    await writeFile(path.join(root, 'dependency.ts'), 'export const value = 1;\n', 'utf8');
    assert.deepEqual(await expandLocalDependencies(root, ['entry.ts']), ['dependency.ts', 'entry.ts']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loadInjectedScope replica el transporte local-light sin tocar git (028A-8 Fase 0)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-injected-'));
  try {
    const reportRoot = path.join(root, '.quality-reports', 'branch-key', '028A-16');
    await mkdir(reportRoot, { recursive: true });
    await writeFile(path.join(root, 'entry.ts'), "import { value } from './dependency';\nexport { value };\n", 'utf8');
    await writeFile(path.join(root, 'dependency.ts'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(root, 'deleted.ts'), 'export const gone = true;\n', 'utf8');
    const manifestPath = path.join(root, 'fixture.json');
    /* Forma real del fixture de bench: el borrado vive SOLO en deletedFiles
     * (no en files); el fingerprint debe sembrarlo igual que un git delete. */
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      files: ['entry.ts'],
      deletedFiles: ['deleted.ts'],
      profiles: ['frontend', 'css'],
      requestedFull: false,
      automaticFull: false,
      effectiveFull: false,
    }), 'utf8');
    const context = { projectRoot: root, reportRoot };
    const scope = await loadInjectedScope(context, { scopeManifest: manifestPath });
    /* El borrado simulado se excluye del transporte plano (igual que git D). */
    const transport = await readFile(path.join(reportRoot, 'changed-files.txt'), 'utf8');
    assert.equal(transport.includes('deleted.ts'), false);
    assert.equal(transport.includes('entry.ts'), true);
    /* Fingerprint por dependencias locales, como detectScope local-light: el
     * borrado simulado queda sembrado (expandLocalDependencies ordena). */
    assert.deepEqual(scope.fingerprintFiles, ['deleted.ts', 'dependency.ts', 'entry.ts']);
    assert.deepEqual(scope.profiles, new Set(['frontend', 'css']));
    assert.equal(scope.effectiveFull, false);
    assert.equal(scope.executionFull, false);
    /* Manifiesto persistido con el fingerprint calculado. */
    const persisted = JSON.parse(await readFile(path.join(reportRoot, 'scope-manifest.json'), 'utf8'));
    assert.deepEqual(persisted.deletedFiles, ['deleted.ts']);
    assert.deepEqual(persisted.fingerprintFiles, ['deleted.ts', 'dependency.ts', 'entry.ts']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loadInjectedScope rechaza manifiestos o rutas fuera del workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-injected-safe-'));
  try {
    const reportRoot = path.join(root, 'reports');
    await mkdir(reportRoot, { recursive: true });
    const context = { projectRoot: root, reportRoot };
    /* Manifiesto fuera del workspace. */
    await assert.rejects(
      loadInjectedScope(context, { scopeManifest: path.join(os.tmpdir(), 'outside.json') }),
      /fuera del workspace/,
    );
    /* Manifiesto inválido (JSON roto). */
    const broken = path.join(root, 'broken.json');
    await writeFile(broken, '{no-json', 'utf8');
    await assert.rejects(loadInjectedScope(context, { scopeManifest: broken }), /scope-manifest inválido/);
    /* Ruta que escapa del workspace dentro del manifiesto. */
    const evil = path.join(root, 'evil.json');
    await writeFile(evil, JSON.stringify({ files: ['../outside.ts'], deletedFiles: [] }), 'utf8');
    await assert.rejects(loadInjectedScope(context, { scopeManifest: evil }), /fuera del workspace/);
    const absolute = path.join(root, 'absolute.json');
    await writeFile(absolute, JSON.stringify({ files: ['/etc/passwd'], deletedFiles: [] }), 'utf8');
    await assert.rejects(loadInjectedScope(context, { scopeManifest: absolute }), /fuera del workspace/);
    /* Manifiesto symlink que apunta fuera del workspace. */
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.json`);
    await writeFile(outside, JSON.stringify({ files: ['entry.ts'], deletedFiles: [] }), 'utf8');
    const linked = path.join(root, 'linked.json');
    await symlink(outside, linked, 'file');
    await assert.rejects(loadInjectedScope(context, { scopeManifest: linked }), /no puede ser symlink/);
    await rm(outside, { force: true });
    /* Manifiesto inexistente. */
    await assert.rejects(
      loadInjectedScope(context, { scopeManifest: path.join(root, 'nope.json') }),
      /no existe/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loadInjectedScope replica el deferimiento del guard en manifiestos full (028A-8)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-injected-defer-'));
  try {
    const reportRoot = path.join(root, 'reports');
    await mkdir(reportRoot, { recursive: true });
    await writeFile(path.join(root, 'entry.ts'), 'export const value = 1;\n', 'utf8');
    const manifestPath = path.join(root, 'full.json');
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      files: ['entry.ts'],
      deletedFiles: [],
      requestedFull: true,
      automaticFull: true,
      effectiveFull: true,
      fullReason: 'requested',
    }), 'utf8');
    const context = { projectRoot: root, reportRoot };
    /* Sin deferir: full efectivo. */
    const full = await loadInjectedScope(context, { scopeManifest: manifestPath });
    assert.equal(full.effectiveFull, true);
    assert.equal(full.fullReason, 'requested');
    /* Tras la denegación del guard: efectivo local-light, fingerprint full. */
    const deferred = await loadInjectedScope(context, {
      scopeManifest: manifestPath,
      heavyDeferred: { reason: 'guard', nextAllowedAt: null },
    });
    assert.equal(deferred.effectiveFull, false);
    assert.equal(deferred.executionFull, false);
    assert.equal(deferred.heavyDeferred, true);
    assert.equal(deferred.fullReason, 'heavy-deferred');
    const persisted = JSON.parse(await readFile(path.join(reportRoot, 'scope-manifest.json'), 'utf8'));
    assert.equal(persisted.effectiveFull, false);
    assert.equal(persisted.fullReason, 'heavy-deferred');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('resolveFullDecision separa requested/automatic/deferred/effective (028A-8)', () => {
  /* Full pedido y permitido: fingerprint full y ejecución full. */
  assert.deepEqual(
    resolveFullDecision({ requested: true, automatic: false, deferred: false, explicit: false }),
    { full: true, effectiveFull: true, executionFull: true },
  );
  /* AutomaticFull sin --full: el fingerprint es full aunque nadie lo pidió. */
  assert.deepEqual(
    resolveFullDecision({ requested: false, automatic: true, deferred: false, explicit: false }),
    { full: true, effectiveFull: true, executionFull: true },
  );
  /* Full diferido por el guard: effectiveFull=false real, no simulado. */
  assert.deepEqual(
    resolveFullDecision({ requested: true, automatic: true, deferred: true, explicit: false }),
    { full: true, effectiveFull: false, executionFull: false },
  );
  /* Perfil explícito con full pedido: fingerprint full, ejecución filtrada. */
  assert.deepEqual(
    resolveFullDecision({ requested: true, automatic: false, deferred: false, explicit: true }),
    { full: true, effectiveFull: true, executionFull: false },
  );
  /* Cambio incremental ordinario. */
  assert.deepEqual(
    resolveFullDecision({ requested: false, automatic: false, deferred: false, explicit: false }),
    { full: false, effectiveFull: false, executionFull: false },
  );
});
