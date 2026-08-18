import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { normalizeDirectFindings } from '../varsense-parity.mjs';

const FIXTURES = path.join(process.cwd(), 'scripts', 'quality', 'tests', 'fixtures');

function completeKey(finding) {
  return [String(finding.ruleId ?? 'unknown'), String(finding.file ?? ''), String(finding.line ?? ''), String(finding.severity ?? 'warning'), String(finding.message ?? '')].join(':');
}

test('SNT-16b: dos proyectos agnósticos conservan decisión y hallazgo completo', async () => {
  const nodeReport = JSON.parse(await readFile(path.join(FIXTURES, 'snt-16b-node-report.json'), 'utf8'));
  const rustReport = JSON.parse(await readFile(path.join(FIXTURES, 'snt-16b-rust-report.json'), 'utf8'));
  const nodeFindings = nodeReport.stages.flatMap(stage => stage.findings).map(finding => ({ ruleId: finding.ruleId, severity: finding.severity, file: finding.file, line: finding.line, message: finding.message }));
  const rustFindings = normalizeDirectFindings(rustReport.entries);
  assert.equal(nodeReport.decision.label, 'FAIL');
  assert.equal(nodeFindings.length, 1);
  assert.deepEqual(nodeFindings, rustFindings);
  assert.equal(completeKey(nodeFindings[0]), completeKey(rustFindings[0]));
});

test('SNT-16b: diferencia de mensaje/severidad no se considera paridad', () => {
  const envelope = { ruleId: 'fixture-rule', severity: 'warning', file: 'src/a.ts', line: 2, message: 'same location' };
  const legacy = { ruleId: 'fixture-rule', severity: 'error', file: 'src/a.ts', line: 2, message: 'changed severity' };
  assert.notEqual(completeKey(envelope), completeKey(legacy));
});
