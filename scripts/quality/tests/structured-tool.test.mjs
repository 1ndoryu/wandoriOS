import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runStructuredTool } from '../adapters/structured-tool.mjs';

test('structured adapter describe un reporte versionado', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'structured-adapter-'));
  const context = {
    projectRoot: root,
    reportRoot: root,
    logsRoot: root,
    qualityConfig: { maxFindings: 3 },
  };
  const result = await runStructuredTool(context, {
    name: 'structured-test',
    executable: process.execPath,
    args: ['-e', 'process.stdout.write("ok")'],
    reportPath: path.join(root, 'missing-structured-report.json'),
    expectedSchemaVersion: '1',
    timeoutMs: 2000,
  });
  try {
    assert.equal(result.failure.stage, 'structured-test');
    assert.equal(result.failure.status, 'error');
    assert.equal(result.failure.state, 'invalid-output');
    assert.equal(result.failure.findings[0].ruleId, 'quality-invalid-output');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('structured adapter conserva cancelled como estado distinto de tool-error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'structured-cancelled-'));
  try {
    const result = await runStructuredTool({ projectRoot: root, reportRoot: root, logsRoot: root, isCancelled: () => true }, {
      name: 'cancelled', executable: process.execPath,
      args: ['-e', 'setTimeout(() => process.exit(0), 50)'], reportPath: path.join(root, 'cancelled.json'),
      expectedSchemaVersion: '1', timeoutMs: 2000,
    });
    assert.equal(result.failure.state, 'cancelled');
    assert.equal(result.failure.findings[0].ruleId, 'quality-cancelled');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('structured adapter distingue tool-error, timeout e reporte válido', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'structured-states-'));
  const context = { projectRoot: root, reportRoot: root, logsRoot: root, qualityConfig: {} };
  try {
    const toolError = await runStructuredTool(context, {
      name: 'tool-error', executable: process.execPath,
      args: ['-e', 'process.exit(2)'], reportPath: path.join(root, 'error.json'),
      expectedSchemaVersion: '1', timeoutMs: 2000,
    });
    assert.equal(toolError.failure.state, 'tool-error');

    const timeout = await runStructuredTool(context, {
      name: 'timeout', executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'], reportPath: path.join(root, 'timeout.json'),
      expectedSchemaVersion: '1', timeoutMs: 50,
    });
    assert.equal(timeout.failure.state, 'timeout');

    await writeFile(path.join(root, 'valid.json'), JSON.stringify({ schemaVersion: 1, entries: [] }), 'utf8');
    const valid = await runStructuredTool(context, {
      name: 'valid', executable: process.execPath,
      args: ['-e', ''], reportPath: path.join(root, 'valid.json'),
      expectedSchemaVersion: '1', timeoutMs: 2000,
    });
    assert.equal(valid.report.entries.length, 0);

    await writeFile(path.join(root, 'bad-finding.json'), JSON.stringify({
      schemaVersion: 1,
      entries: [{ findings: [{ ruleId: 'x', severity: 'unknown', message: 'bad' }] }],
    }), 'utf8');
    const invalidFinding = await runStructuredTool(context, {
      name: 'invalid-finding', executable: process.execPath,
      args: ['-e', ''], reportPath: path.join(root, 'bad-finding.json'),
      expectedSchemaVersion: '1', timeoutMs: 2000,
    });
    assert.equal(invalidFinding.failure.state, 'invalid-output');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
