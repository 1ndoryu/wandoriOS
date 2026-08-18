import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readAdapterManifest, validateAdapterManifest, adapterStageNames, materializeTransportArguments, resolveWorkspacePath, adapterEnvironmentAllowlist, assertTaskId, assertImplementedStages, manifestStageNames } from '../adapter-manifest.mjs';

const manifest = {
  schemaVersion: 1,
  adapter: { id: 'fixture', version: '0.1.0', protocolVersion: 1, capabilities: ['structured-stage-process'], environment: { mode: 'runner-default', allowlisted: ['CI'] }, output: { schemaVersion: '1', exitCodes: { pass: 0, findings: 1, toolError: 2, cancelled: 130 } } },
  transport: { executable: 'node', entrypoint: 'scripts/quality/stage-process.mjs', arguments: ['--stage', '{stage}', '--report', '{reportPath}', '--task-id', '{taskId}'] },
  stages: { sentinel: { timeoutMs: 1000 }, varsense: { timeoutMs: 1000 }, rust: { timeoutMs: 1000 }, frontend: { timeoutMs: 1000 }, docs: { timeoutMs: 1000 } },
  profiles: { frontend: ['varsense', 'frontend'] },
};

test('lee y valida el manifest del adapter del proyecto', async () => {
  const loaded = await readAdapterManifest(process.cwd());
  assert.equal(loaded.adapter.id, 'wandorius-quality');
  assert.deepEqual(manifestStageNames(loaded), ['sentinel', 'varsense', 'rust', 'frontend', 'docs']);
  assert.deepEqual(adapterStageNames(loaded, ['frontend'], false), ['sentinel', 'varsense', 'frontend']);
});

test('materializa argv sin shell y conserva placeholders conocidos', () => {
  assert.deepEqual(materializeTransportArguments(manifest, { stage: 'docs', reportPath: 'report.json', taskId: 'T-1' }), ['--stage', 'docs', '--report', 'report.json', '--task-id', 'T-1']);
  assert.throws(() => materializeTransportArguments(manifest, { stage: 'docs', reportPath: '', taskId: 'T-1' }), /Falta valor/);
});

test('rechaza placeholders, estados de salida, perfiles y etapas desconocidas', () => {
  assert.throws(() => validateAdapterManifest({ ...manifest, transport: { ...manifest.transport, arguments: ['--eval', '{shell}'] } }), /placeholder no permitido/);
  assert.throws(() => validateAdapterManifest({ ...manifest, adapter: { ...manifest.adapter, output: { ...manifest.adapter.output, exitCodes: { ...manifest.adapter.output.exitCodes, pass: 1 } } } }), /exitCodes.pass/);
  assert.throws(() => adapterStageNames(manifest, ['missing'], false), /Perfil de adapter desconocido/);
  assert.throws(() => validateAdapterManifest({ ...manifest, profiles: { frontend: ['unknown'] } }), /etapa desconocida/);
  assert.throws(() => validateAdapterManifest({ ...manifest, stages: { ...manifest.stages, docs: { timeoutMs: 1000, typo: true } } }), /claves desconocidas/);
});

test('rechaza rutas y task IDs fuera del contrato', () => {
  assert.throws(() => resolveWorkspacePath('C:/workspace', '../outside.json', 'report'), /fuera del workspace/);
  assert.throws(() => resolveWorkspacePath('C:/workspace', 'tmp/report.json', 'report', { allowReportRoot: true }), /\.quality-reports/);
  assert.equal(resolveWorkspacePath('C:/workspace', '.quality-reports/task/report.json', 'report', { allowReportRoot: true }), 'C:\\workspace\\.quality-reports\\task\\report.json');
  assert.throws(() => assertTaskId('../escape'), /identificador inválido/);
  assert.equal(assertTaskId('SNT-12'), 'SNT-12');
});

test('rechaza nombres sensibles y normaliza el allowlist efectivo', () => {
  assert.deepEqual(adapterEnvironmentAllowlist(manifest), ['CI']);
  assert.deepEqual(adapterEnvironmentAllowlist(manifest, ['PATH']), ['PATH', 'CI']);
  assert.deepEqual(adapterEnvironmentAllowlist({ ...manifest, adapter: { ...manifest.adapter, environment: { mode: 'runner-default', allowlisted: ['ci', 'PATH'] } } }, ['Path']), ['Path', 'ci']);
  assert.throws(() => validateAdapterManifest({ ...manifest, adapter: { ...manifest.adapter, environment: { mode: 'runner-default', allowlisted: ['DATABASE_URL'] } } }), /variables sensibles/);
  assert.throws(() => adapterEnvironmentAllowlist(manifest, ['API_TOKEN']), /variables sensibles/);
  assert.throws(() => adapterEnvironmentAllowlist({ ...manifest, adapter: { ...manifest.adapter, environment: { mode: 'invalid', allowlisted: ['CI'] } } }), /environment.mode/);
});

test('el allowlist del manifest es efectivo y las etapas declaradas deben estar implementadas', () => {
  assert.deepEqual([...new Set(['sentinel', 'frontend'])].filter(stage => assertImplementedStages(manifest, ['sentinel', 'frontend'], ['sentinel', 'frontend'])), ['sentinel', 'frontend']);
  assert.throws(() => assertImplementedStages(manifest, ['sentinel', 'rust'], ['sentinel']), /sin implementación/);
});

test('manifestStageNames valida el contrato antes de leer stages', () => {
  assert.throws(() => manifestStageNames({ stages: { sentinel: {} } }), /schemaVersion/);
});

test('readAdapterManifest rechaza un manifest enlazado fuera del workspace', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'adapter-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'adapter-outside-'));
  try {
    await writeFile(path.join(outside, 'quality-adapter.json'), '{}');
    try { await symlink(path.join(outside, 'quality-adapter.json'), path.join(root, 'quality-adapter.json'), process.platform === 'win32' ? 'file' : undefined); }
    catch (error) { t.skip(`symlink fixture unavailable: ${error.message}`); return; }
    await assert.rejects(() => readAdapterManifest(root), /symlink|ruta real fuera|quality-adapter/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('rechaza un symlink existente que escapa del workspace', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'adapter-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'adapter-outside-'));
  try {
    await mkdir(path.join(root, '.quality-reports'), { recursive: true });
    try { await symlink(outside, path.join(root, '.quality-reports', 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
    catch (error) { t.skip(`symlink fixture unavailable: ${error.message}`); return; }
    assert.throws(() => resolveWorkspacePath(root, '.quality-reports/escape/report.json', 'report', { allowReportRoot: true }), /symlink|ruta real fuera/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});
