import assert from 'node:assert/strict';
import { readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const SCRIPTS = path.resolve('scripts', 'quality');
const REPORT_FIXTURES = path.resolve('.quality-reports', 'adapter-tests');
function requireProcessResult(result, label, allowedCodes) {
  if (result instanceof Error) {
    assert.ok(Number.isInteger(result.code), `${label}: transporte sin exit code: ${result.message}`);
    assert.ok(allowedCodes.includes(result.code), `${label}: exit inesperado ${result.code}; stderr=${result.stderr ?? ''}`);
    return result;
  }
  return { ...result, code: 0 };
}

test('stages.mjs genera el contrato declarativo con las etapas del manifest', async () => {
  const { readAdapterManifest, adapterStageNames } = await import('../adapter-manifest.mjs');
  const { EXECUTABLE_PROFILES } = await import('../profile-contract.mjs');
  const adapter = await readAdapterManifest(process.cwd());
  const { preflight } = await import('../preflight.mjs');
  const { detectScope } = await import('../scope.mjs');
  const { stageDefinitions } = await import('../stage-definitions.mjs');
  const context = await preflight({ taskId: '028A-6', cwd: process.cwd() });
  const scope = await detectScope(context, {});
  /* [138A-1] Mismo filtro que stages.mjs/stage-definitions.mjs: los perfiles de
   * clasificación (desktop/mobile/workspace/auth/commerce) no seleccionan
   * etapas y el adapter es fail-closed ante perfiles no declarados. */
  const stageProfiles = [...scope.profiles].filter(profile => EXECUTABLE_PROFILES.has(profile));
  const expected = adapterStageNames(adapter, stageProfiles, scope.executionFull ?? scope.full);
  const definitions = stageDefinitions(context, scope, '028A-6', adapter).map(item => item.name);
  const reportRoot = path.join(REPORT_FIXTURES, 'stages');
  try {
    const output = path.join(reportRoot, 'stages.json');
    const result = requireProcessResult(await execFileAsync(process.execPath, [path.join(SCRIPTS, 'stages.mjs'), '--task-id', '028A-6', '--output', output, '--report-root', reportRoot], { cwd: process.cwd(), timeout: 60_000 }).catch(error => error), 'stages', [0]);
    assert.equal(result.code, 0);
    const declarations = JSON.parse(await readFile(output, 'utf8'));
    assert.ok(Array.isArray(declarations) && declarations.length > 0);
    const names = declarations.map(item => item.name);
    assert.deepEqual(names, expected.filter(name => definitions.includes(name)));
    assert.ok(declarations.every(item => item.args.includes(path.join(SCRIPTS, 'stage-process.mjs'))), 'cada etapa apunta al wrapper');
  } finally { await rm(REPORT_FIXTURES, { recursive: true, force: true }); }
});

test('stages.mjs conserva el perfil explícito para el proceso hijo', async () => {
  const reportRoot = path.join(REPORT_FIXTURES, 'profile-forwarding');
  try {
    const output = path.join(reportRoot, 'stages.json');
    const result = requireProcessResult(await execFileAsync(process.execPath, [
      path.join(SCRIPTS, 'stages.mjs'),
      '--task-id', '028A-6',
      '--profile', 'docs',
      '--output', output,
      '--report-root', reportRoot,
    ], { cwd: process.cwd(), timeout: 60_000 }).catch(error => error), 'stages profile', [0]);
    assert.equal(result.code, 0, 'stages profile debe terminar en 0');
    const declarations = JSON.parse(await readFile(output, 'utf8'));
    assert.ok(declarations.length > 0);
    assert.ok(declarations.every(item => item.args.includes('--profile') && item.args.includes('docs')));
  } finally { await rm(reportRoot, { recursive: true, force: true }); }
});

test('stages.mjs conserva los selectores full y CI para el proceso hijo', async () => {
  for (const selector of ['--full', '--ci']) {
    const reportRoot = path.join(REPORT_FIXTURES, `selector-${selector.slice(2)}`);
    try {
      const output = path.join(reportRoot, 'stages.json');
      const result = requireProcessResult(await execFileAsync(process.execPath, [
        path.join(SCRIPTS, 'stages.mjs'),
        '--task-id', '028A-6',
        selector,
        '--output', output,
        '--report-root', reportRoot,
      ], { cwd: process.cwd(), timeout: 60_000 }).catch(error => error), `stages ${selector}`, [0]);
      assert.equal(result.code, 0, `stages ${selector} debe terminar en 0`);
      const declarations = JSON.parse(await readFile(output, 'utf8'));
      assert.ok(declarations.length > 0);
      assert.ok(declarations.every(item => item.args.includes(selector)));
    } finally { await rm(reportRoot, { recursive: true, force: true }); }
  }
});

test('stage-process.mjs escribe el contrato estructurado y replica el exit code', async () => {
  const report = path.join(REPORT_FIXTURES, 'wrapper', 'docs.json');
  try {
    const spawned = requireProcessResult(await execFileAsync(process.execPath, [path.join(SCRIPTS, 'stage-process.mjs'), '--stage', 'docs', '--report', report, '--task-id', '028A-6'], { cwd: process.cwd(), timeout: 120_000 }).catch(error => error), 'stage-process', [0, 1]);
    const parsed = JSON.parse(await readFile(report, 'utf8'));
    assert.equal(parsed.schemaVersion, '1');
    assert.ok(Array.isArray(parsed.entries), 'entries presente');
    assert.equal(parsed.stage, 'docs');
    assert.ok(Number.isFinite(Number(parsed.durationMs)));
    assert.ok([0, 1].includes(spawned.code));
  } finally { await rm(REPORT_FIXTURES, { recursive: true, force: true }); }
});

test('stage-process rechaza una etapa no declarada', async () => {
  const report = path.join(REPORT_FIXTURES, 'wrapper', 'unknown.json');
  const result = requireProcessResult(await execFileAsync(process.execPath, [path.join(SCRIPTS, 'stage-process.mjs'), '--stage', 'unknown', '--report', report, '--task-id', '028A-6'], { cwd: process.cwd(), timeout: 30_000 }).catch(error => error), 'stage-process unknown', [2]);
  assert.equal(result.code, 2);
  await rm(REPORT_FIXTURES, { recursive: true, force: true });
});

test('observe-compare.mjs compara decisiones y produce compare.json cuando el analyzer está provisionado', async t => {
  const sentinelCli = path.join(process.cwd(), 'tools', 'sentinel', 'out', 'cli', 'index.js');
  try { await mkdir(path.dirname(sentinelCli)); await readFile(sentinelCli, 'utf8'); } catch { t.skip('requiere CLI Sentinel compilado y checkout limpio'); return; }
  const taskId = '028A-6';
  const runId = `observe-${process.pid}-${Date.now()}`;
  try {
    const result = requireProcessResult(await execFileAsync(process.execPath, [path.join(SCRIPTS, 'observe-compare.mjs'), '--task-id', taskId, '--run-id', runId], { cwd: process.cwd(), timeout: 30 * 60_000 }).catch(error => error), 'observe-compare', [0, 1]);
    assert.ok([0, 1].includes(result.code));
    assert.match(result.stdout ?? '', /Decisión:/);
    const comparePath = path.join(process.cwd(), '.quality-reports', 'observe', runId, 'compare.json');
    const compare = JSON.parse(await readFile(comparePath, 'utf8'));
    assert.equal(compare.taskId, taskId);
    assert.equal(compare.runId, runId);
    assert.equal(typeof compare.matched, 'boolean');
    assert.ok(Array.isArray(compare.actual.findings));
    assert.ok(Array.isArray(compare.sentinel.findings));
  } finally { await rm(path.join(process.cwd(), '.quality-reports', 'observe', runId), { recursive: true, force: true }); }
});
