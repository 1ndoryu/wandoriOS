import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageDefinitions } from '../stage-definitions.mjs';

const context = {};
const adapter = {
  schemaVersion: 1,
  adapter: { id: 'fixture', version: '0.1.0', protocolVersion: 1, capabilities: [], environment: { mode: 'runner-default', allowlisted: ['CI'] }, output: { schemaVersion: '1', exitCodes: { pass: 0, findings: 1, toolError: 2, cancelled: 130 } } },
  transport: { executable: 'node', entrypoint: 'scripts/quality/stage-process.mjs', arguments: ['--stage', '{stage}', '--report', '{reportPath}', '--task-id', '{taskId}'] },
  stages: { sentinel: {}, varsense: {}, rust: {}, frontend: {}, docs: {} },
  profiles: { css: ['varsense'], frontend: ['varsense', 'frontend'], rust: ['rust'], docs: ['docs'] },
};
for (const definition of Object.values(adapter.stages)) definition.timeoutMs = 1000;

test('perfil explícito restringe etapas aunque el alcance sea full', () => {
  const names = stageDefinitions(context, { full: true, executionFull: false, profileOverride: true, profiles: new Set(['docs']) }, '028A-6', adapter).map(stage => stage.name);
  assert.deepEqual(names, ['sentinel', 'docs']);
});

test('sin perfil explícito, full conserva todas las etapas', () => {
  const names = stageDefinitions(context, { full: true, executionFull: true, profileOverride: false, profiles: new Set() }, '028A-6', adapter).map(stage => stage.name);
  assert.deepEqual(names, ['sentinel', 'varsense', 'rust', 'frontend', 'docs']);
});

test('un perfil frontend incluye varsense, pero no rust/docs', () => {
  const names = stageDefinitions(context, { full: false, profileOverride: true, profiles: new Set(['frontend']) }, '028A-6', adapter).map(stage => stage.name);
  assert.deepEqual(names, ['sentinel', 'varsense', 'frontend']);
});

test('[138A-1] los perfiles de clasificación no seleccionan etapas ni rompen el transporte', () => {
  const names = stageDefinitions(
    context,
    { full: false, executionFull: false, profileOverride: false, profiles: new Set(['frontend', 'desktop', 'docs']) },
    '138A-1',
    adapter,
  ).map(stage => stage.name);
  assert.deepEqual(names, ['sentinel', 'varsense', 'frontend', 'docs']);
});

test('el camino legacy sigue siendo compatible mientras migra', () => {
  const names = stageDefinitions(context, { full: false, profileOverride: true, profiles: new Set(['docs']) }, '028A-6').map(stage => stage.name);
  assert.deepEqual(names, ['sentinel', 'docs']);
});

test('el camino real carga quality-adapter.json y aplica su perfil', () => {
  const names = stageDefinitions({ projectRoot: process.cwd() }, { full: false, profileOverride: true, profiles: new Set(['docs']) }, 'SNT-15').map(stage => stage.name);
  assert.deepEqual(names, ['sentinel', 'docs']);
});

test('un manifest inválido falla cerrado antes de construir stages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stage-definitions-'));
  try {
    await writeFile(path.join(root, 'quality-adapter.json'), JSON.stringify({ schemaVersion: 99 }));
    assert.throws(() => stageDefinitions({ projectRoot: root }, { full: false, profiles: new Set() }, 'SNT-15'), /Manifest de adapter inválido|schemaVersion/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('la ruta real rechaza un manifest enlazado fuera del workspace', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stage-definitions-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'stage-definitions-outside-'));
  try {
    await writeFile(path.join(outside, 'quality-adapter.json'), JSON.stringify(adapter));
    try { await symlink(path.join(outside, 'quality-adapter.json'), path.join(root, 'quality-adapter.json'), process.platform === 'win32' ? 'file' : undefined); }
    catch (error) { t.skip(`symlink fixture unavailable: ${error.message}`); return; }
    assert.throws(() => stageDefinitions({ projectRoot: root }, { full: false, profiles: new Set() }, 'SNT-15'), /Manifest de adapter inválido|symlink|ruta real fuera/);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('una etapa declarada sin factory falla cerrado', () => {
  const invalid = { ...adapter, stages: { ...adapter.stages, imaginary: { timeoutMs: 1000 } }, profiles: { docs: ['imaginary'] } };
  assert.throws(() => stageDefinitions(context, { full: false, profileOverride: true, profiles: new Set(['docs']) }, 'SNT-15', invalid), /sin implementación/);
});
