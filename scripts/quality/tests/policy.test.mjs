import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  defaultGuardPolicy,
  discoverPolicy,
  loadPolicy,
  migrateLegacyConfig,
  validatePolicy,
} from '../policy.mjs';
import { resolveLegacyRoot } from '../sentinel-doctor.mjs';

function validPolicy() {
  return {
    schemaVersion: 2,
    mode: 'enforce',
    gate: { command: ['sentinel', 'check', '--'], taskIdRequired: true },
    guard: { directCommands: defaultGuardPolicy() },
    runtime: { minimumVersion: '0.4.0', protocolVersion: 1, lockFile: 'sentinel.lock.json' },
    analyzers: {
      sentinel: { enabled: true, profile: 'project-default', config: 'sentinel.config.json' },
      varsense: { enabled: true, profile: 'project-default', config: 'varsense.config.json' },
    },
  };
}

test('valida una política v2 y rechaza claves desconocidas o rutas inseguras', () => {
  assert.doesNotThrow(() => validatePolicy(validPolicy()));
  assert.throws(() => validatePolicy({ ...validPolicy(), unexpected: true }), /claves desconocidas/);
  assert.throws(() => validatePolicy({ ...validPolicy(), runtime: { ...validPolicy().runtime, lockFile: '../outside.json' } }), /no puede salir/);
  assert.throws(() => validatePolicy({ ...validPolicy(), mode: 'invalid' }), /mode inválido/);
});

test('valida la rama principal declarada sin asumir main', () => {
  assert.doesNotThrow(() => validatePolicy({ ...validPolicy(), project: { primaryBranch: 'wandorius' } }));
  assert.doesNotThrow(() => validatePolicy({ ...validPolicy(), project: { primaryBranch: 'sites/client-a' } }));
  for (const primaryBranch of ['main branch', '../escape', 'feature//broken', 'release.lock', 'feature/@{bad}']) {
    assert.throws(
      () => validatePolicy({ ...validPolicy(), project: { primaryBranch } }),
      /project\.primaryBranch debe ser un nombre de rama Git válido|project\.primaryBranch: nombre inválido/,
      primaryBranch,
    );
  }
});

test('mapea la configuración legacy a una política v2 sin perder el analizador v1', () => {
  const migrated = migrateLegacyConfig({
    sentinelConfig: { includePatterns: ['**/*.ts'], rules: { 'catch-vacio': { severidad: 'error' } } },
    qualityConfig: {
      schemaVersion: 1,
      maxConcurrentStages: 1,
      timeoutsMs: { sentinel: 120000 },
      heavyRun: { cooldownMinutes: 180 },
      reportRetention: { maxAgeDays: 7 },
      fullPatterns: ['scripts/quality/'],
      profiles: { docs: ['.md'] },
    },
    varsenseConfig: {
      includePatterns: ['frontend/src/**/*.css'],
      tokenDetection: { duplicate: { enabled: true, severity: 'warning' } },
    },
    toolManifest: {
      schemaVersion: 1,
      installRoot: '.quality-tools',
      tools: {
        sentinel: { version: '0.4.0', commit: 'sentinel-commit', outputSchemaVersion: '1' },
        varsense: { version: '2.2.0', commit: 'varsense-commit', outputSchemaVersion: '1' },
      },
    },
  });
  assert.equal(migrated.policy.schemaVersion, 2);
  assert.equal(migrated.policy.gate.command[0], 'npm');
  assert.equal(migrated.policy.analyzers.sentinel.config.rules['catch-vacio'].severidad, 'error');
  assert.equal(migrated.policy.runtime.protocolVersion, 1);
  assert.equal(migrated.legacy.qualityConfig.maxConcurrentStages, 1);
  assert.equal(migrated.legacy.varsenseConfig.tokenDetection.duplicate.enabled, true);
  assert.equal(migrated.legacy.toolManifest.tools.sentinel.version, '0.4.0');
  assert.deepEqual(migrated.mapped.scheduler.heavyRun, { cooldownMinutes: 180 });
  assert.deepEqual(migrated.mapped.scope.profiles, { docs: ['.md'] });
  assert.equal(migrated.mapped.analyzers.varsense.config.includePatterns[0], 'frontend/src/**/*.css');
});

test('rechaza claves desconocidas o manifests incompletos antes de crear el preview', () => {
  const validTools = {
    schemaVersion: 1,
    installRoot: '.quality-tools',
    tools: {
      sentinel: { version: '0.4.0', commit: 'a', outputSchemaVersion: '1' },
      varsense: { version: '2.2.0', commit: 'b', outputSchemaVersion: '1' },
    },
  };
  assert.throws(() => migrateLegacyConfig({
    sentinelConfig: { includePatterns: ['..\\\\outside.json'], oldRule: true },
    qualityConfig: {},
    varsenseConfig: {},
    toolManifest: validTools,
  }), /sentinel.config.json v1: claves desconocidas/);
  assert.throws(() => migrateLegacyConfig({
    sentinelConfig: {},
    qualityConfig: { unknown: true },
    varsenseConfig: {},
    toolManifest: validTools,
  }), /quality.config.json: claves desconocidas/);
  assert.throws(() => migrateLegacyConfig({
    sentinelConfig: {},
    qualityConfig: {},
    varsenseConfig: {},
    toolManifest: { ...validTools, tools: { sentinel: validTools.tools.sentinel } },
  }), /exactamente sentinel y varsense/);
  assert.throws(() => migrateLegacyConfig({
    sentinelConfig: {},
    qualityConfig: {},
    varsenseConfig: {},
    toolManifest: {
      ...validTools,
      tools: {
        ...validTools.tools,
        sentinel: {
          ...validTools.tools.sentinel,
          patch: { path: '..\\\\outside.patch', sha256: 'a'.repeat(64) },
        },
      },
    },
  }), /patch.path: debe ser una ruta relativa/);
  assert.throws(() => migrateLegacyConfig({
    sentinelConfig: {},
    qualityConfig: {},
    varsenseConfig: {},
    toolManifest: {
      ...validTools,
      tools: {
        ...validTools.tools,
        varsense: {
          ...validTools.tools.varsense,
          patch: { path: 'scripts/patch', sha256: 'not-a-hash' },
        },
      },
    },
  }), /patch.sha256: debe ser SHA-256/);
});

test('doctor no inventa una migración para un proyecto sin política', async () => {
  assert.throws(() => resolveLegacyRoot({ projectRoot: null }), /No se encontró una raíz/);
  assert.throws(() => migrateLegacyConfig({ sentinelConfig: {}, qualityConfig: {}, toolManifest: {} }), /configuración legacy incompleta/);
});

test('rechaza una política symlink para no cargar configuración fuera del workspace', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-link-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-outside-'));
  try {
    await writeFile(path.join(outside, 'sentinel.config.json'), JSON.stringify(validPolicy()), 'utf8');
    await symlink(path.join(outside, 'sentinel.config.json'), path.join(root, 'sentinel.config.json'), 'file');
    const loaded = await loadPolicy(root);
    assert.equal(loaded.status, 'invalid-policy');
    assert.match(loaded.error, /no puede ser symlink/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('resuelve físicamente un startPath junction antes de buscar la política', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-junction-'));
  const physical = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-physical-'));
  try {
    await mkdir(path.join(root, 'nested'), { recursive: true });
    await writeFile(path.join(root, 'sentinel.config.json'), JSON.stringify(validPolicy()), 'utf8');
    const linked = path.join(physical, 'linked');
    await symlink(root, linked, 'junction');
    const discovered = await discoverPolicy(path.join(linked, 'nested'));
    assert.equal(discovered.projectRoot, root);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(physical, { recursive: true, force: true });
  }
});

test('usa solo sentinel.config.json como fuente canónica y no infiere reglas auxiliares', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-canonical-'));
  try {
    await mkdir(path.join(root, 'scripts', 'quality'), { recursive: true });
    await writeFile(path.join(root, 'AGENTS.md'), '# reglas auxiliares que no son política\\n', 'utf8');
    await writeFile(path.join(root, 'quality.config.json'), JSON.stringify({ mode: 'enforce', guard: { directCommands: {} } }), 'utf8');
    await writeFile(path.join(root, 'scripts', 'quality', 'policy.mjs'), 'export const fake = true;\\n', 'utf8');
    assert.equal((await loadPolicy(root)).status, 'no-policy');

    await writeFile(path.join(root, 'sentinel.config.json'), JSON.stringify(validPolicy()), 'utf8');
    const first = await loadPolicy(path.join(root, 'nested'));
    await writeFile(path.join(root, 'AGENTS.md'), '# cambio auxiliar no canónico\\n', 'utf8');
    await writeFile(path.join(root, 'quality.config.json'), JSON.stringify({ mode: 'observe' }), 'utf8');
    await writeFile(path.join(root, 'scripts', 'quality', 'policy.mjs'), 'export const changed = true;\\n', 'utf8');
    const second = await loadPolicy(path.join(root, 'nested'));
    assert.equal(first.status, 'policy');
    assert.equal(second.status, 'policy');
    assert.equal(first.policyPath, path.join(root, 'sentinel.config.json'));
    assert.equal(second.policyHash, first.policyHash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('descubre la política en un ancestro y diferencia no-policy de legacy-v1', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-'));
  try {
    const nested = path.join(root, 'frontend', 'src');
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(root, 'sentinel.config.json'), JSON.stringify({ includePatterns: [] }), 'utf8');
    const discovered = await discoverPolicy(nested);
    assert.equal(discovered.projectRoot, root);
    assert.equal((await loadPolicy(nested)).status, 'legacy-v1');
    assert.equal((await loadPolicy(path.join(os.tmpdir(), 'no-policy-here'))).status, 'no-policy');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cambiar la política en el mismo proceso no conserva estado de rama anterior', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sentinel-policy-switch-'));
  try {
    const policy = validPolicy();
    const policyPath = path.join(root, 'sentinel.config.json');
    await writeFile(policyPath, JSON.stringify(policy), 'utf8');
    const first = await loadPolicy(root);
    assert.equal(first.status, 'policy');
    assert.equal(first.policy.mode, 'enforce');

    /* Simula el checkout de otra rama dentro del mismo proceso: la política
     * cambia de contenido y el loader debe releerla del disco, sin caché de
     * módulo ni hash residual. [028A-6] Descubrimiento fresco por comando. */
    await writeFile(policyPath, JSON.stringify({ ...policy, mode: 'observe' }), 'utf8');
    const second = await loadPolicy(root);
    assert.equal(second.status, 'policy');
    assert.equal(second.policy.mode, 'observe');
    assert.notEqual(second.policyHash, first.policyHash);

    await rm(policyPath);
    const third = await loadPolicy(root);
    assert.equal(third.status, 'no-policy');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
