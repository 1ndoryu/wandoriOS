import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { normalizeGateFindings, normalizeDirectFindings, compareFindings } from '../varsense-parity.mjs';

const execFileAsync = promisify(execFile);
const SCRIPTS = path.resolve('scripts', 'quality');

test('varsense-parity: normalización gate vs CLI detecta hallazgos idénticos', () => {
  const gateEntries = [{ findings: [{ ruleId: 'claseHuerfana', severity: 'warning', file: 'a.css', line: 3, message: 'Clase no usada' }] }];
  const directEntries = [{ ruta: 'a.css', findings: [{ ruleId: 'claseHuerfana', severity: 'warning', range: { start: { line: 2 } }, message: 'Clase no usada' }] }];
  const comparison = compareFindings(normalizeGateFindings(gateEntries), normalizeDirectFindings(directEntries));
  assert.equal(comparison.onlyGate.length, 0);
  assert.equal(comparison.onlyDirect.length, 0);
  assert.equal(comparison.matched, true);
});

test('varsense-parity: normalización gate vs CLI detecta diferencias reales', () => {
  const gateEntries = [{ findings: [{ ruleId: 'tokenInvalido', severity: 'error', file: 'b.css', line: 1, message: 'Token desconocido' }] }];
  const directEntries = [{ ruta: 'c.css', findings: [{ ruleId: 'otraRegla', severity: 'error', range: { start: { line: 0 } }, message: 'Otra cosa' }] }];
  const comparison = compareFindings(normalizeGateFindings(gateEntries), normalizeDirectFindings(directEntries));
  assert.equal(comparison.onlyGate.length, 1);
  assert.equal(comparison.onlyDirect.length, 1);
  assert.equal(comparison.matched, false);
});

test('varsense-parity.mjs ejecuta etapa del gate y CLI sobre la tarea real', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'varsense-parity-'));
  try {
    const result = await execFileAsync(process.execPath, [path.join(SCRIPTS, 'varsense-parity.mjs'), '--task-id', '028A-6'], { cwd: process.cwd(), timeout: 15 * 60_000 }).catch(error => error);
    const exitCode = Number.isInteger(result.code) ? result.code : 0;
    assert.ok([0, 1].includes(exitCode), `exit inesperado: ${exitCode} (${result.stderr ?? ''})`);
    const output = result.stdout ?? '';
    assert.match(output, /varsense-parity/);
    const parityPath = path.join(process.cwd(), '.quality-reports', 'parity', 'varsense', '028A-6', 'parity.json');
    const parity = JSON.parse(await readFile(parityPath, 'utf8'));
    assert.equal(parity.taskId, '028A-6');
    assert.equal(typeof parity.matched, 'boolean');
    assert.ok(Number.isInteger(parity.gateFindings));
    assert.ok(Number.isInteger(parity.directFindings));
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
