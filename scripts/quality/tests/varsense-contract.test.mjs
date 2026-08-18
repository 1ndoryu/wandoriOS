import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildVarsenseInvocation,
  VARSENSE_SCOPE_LIMITATION_CODE,
  VARSENSE_SCOPE_MISSING_MANIFEST_CODE,
} from '../adapters/varsense-contract.mjs';

test('VarSense usa una sola invocación all y comparte el reportRoot del gate', () => {
  const invocation = buildVarsenseInvocation({
    projectRoot: 'C:/repo',
    reportRoot: 'C:/repo/.quality-reports/branches/main/T-1',
    tools: { varsense: { cliPath: 'C:/repo/.quality-tools/varsense/dist/cli/index.js', version: '2.2.0' } },
  }, { executionFull: true });
  assert.equal(invocation.args[1], 'all');
  assert.equal(invocation.args.includes('--files-from'), false);
  assert.equal(invocation.reportPath.replace(/\\/g, '/'), 'C:/repo/.quality-reports/branches/main/T-1/varsense-all.json');
  assert.deepEqual(invocation.scope, {
    requestedScopedAnalysis: false,
    applied: true,
    manifestPath: null,
    persistentIndex: null,
    limitation: null,
  });
});

test('VarSense deja constancia de scope solicitado no aplicable cuando la capacidad no está fijada', () => {
  const invocation = buildVarsenseInvocation({
    projectRoot: 'C:/repo',
    reportRoot: 'C:/reports/T-1',
    tools: { varsense: { cliPath: 'varsense.js', version: '2.2.0' } },
  }, { executionFull: false, changedFilesPath: 'C:/reports/T-1/changed-files.txt' });
  assert.equal(invocation.args[1], 'all');
  assert.equal(invocation.scope.requestedScopedAnalysis, true);
  assert.equal(invocation.scope.applied, false);
  assert.equal(invocation.scope.manifestPath, 'C:/reports/T-1/changed-files.txt');
  assert.equal(invocation.scope.limitation, VARSENSE_SCOPE_LIMITATION_CODE('2.2.0'));
  assert.equal(invocation.scope.persistentIndex, null);
});

test('VarSense activa files-from solo con capacidad declarada', () => {
  const invocation = buildVarsenseInvocation({
    projectRoot: 'C:/repo',
    reportRoot: 'C:/reports/T-1',
    tools: {
      varsense: {
        cliPath: 'varsense.js',
        version: '2.2.0',
        capabilities: { filesFrom: true },
      },
    },
  }, { executionFull: false, changedFilesPath: 'C:/reports/T-1/changed-files.txt' });
  assert.deepEqual(invocation.args.slice(-2), ['--files-from', 'C:/reports/T-1/changed-files.txt']);
  assert.equal(invocation.scope.applied, true);
  assert.equal(invocation.scope.limitation, null);
});

test('VarSense no declara capacidad aplicada si falta el manifiesto', () => {
  const invocation = buildVarsenseInvocation({
    projectRoot: 'C:/repo',
    reportRoot: 'C:/reports/T-1',
    tools: {
      varsense: {
        cliPath: 'varsense.js',
        version: '2.2.0',
        capabilities: { filesFrom: true },
      },
    },
  }, { executionFull: false });
  assert.equal(invocation.args.includes('--files-from'), false);
  assert.equal(invocation.scope.applied, false);
  assert.equal(invocation.scope.limitation, VARSENSE_SCOPE_MISSING_MANIFEST_CODE('2.2.0'));
});

test('VarSense activa --index-dir solo con la capacidad persistentIndex declarada', () => {
  const invocation = buildVarsenseInvocation({
    projectRoot: 'C:/repo',
    reportRoot: 'C:/repo/.quality-reports/branches/main/T-1',
    cacheRoot: 'C:/repo/.quality-reports/branches/main/cache',
    tools: {
      varsense: {
        cliPath: 'varsense.js',
        version: '2.2.0',
        capabilities: { persistentIndex: true },
      },
    },
  }, { executionFull: true });
  assert.deepEqual(invocation.args.slice(-2).map(value => value.replace(/\\/g, '/')), ['--index-dir', 'C:/repo/.quality-reports/branches/main/cache/varsense']);
  assert.deepEqual(
    { ...invocation.scope.persistentIndex, indexDir: invocation.scope.persistentIndex.indexDir.replace(/\\/g, '/') },
    { enabled: true, indexDir: 'C:/repo/.quality-reports/branches/main/cache/varsense' },
  );
});

test('VarSense omite --index-dir sin la capacidad declarada (checkout fijado previo)', () => {
  const invocation = buildVarsenseInvocation({
    projectRoot: 'C:/repo',
    reportRoot: 'C:/repo/.quality-reports/branches/main/T-1',
    cacheRoot: 'C:/repo/.quality-reports/branches/main/cache',
    tools: { varsense: { cliPath: 'varsense.js', version: '2.2.0' } },
  }, { executionFull: true });
  assert.equal(invocation.args.includes('--index-dir'), false);
  assert.equal(invocation.scope.persistentIndex, null);
});
