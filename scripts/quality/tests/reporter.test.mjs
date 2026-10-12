import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compactLines, createReport } from '../reporter.mjs';

test('los hallazgos muestran archivo:linea (y columna) relativo en Markdown y compacto', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-loc-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-LOC'), { recursive: true });
    const absolute = path.join(projectRoot, 'frontend', 'src', 'a.css').replace(/\\/gu, '/');
    const findings = [
      { severity: 'error', ruleId: 'r1', file: absolute, line: 157, column: 5, message: 'm1' },
      { severity: 'warning', ruleId: 'r2', file: absolute, line: 12, message: 'm2' },
      { severity: 'info', ruleId: 'r3', message: 'm3' },
    ];
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-LOC'),
        qualityConfig: { maxFindings: 3, maxReminders: 4 },
        tools: {},
      },
      { taskId: 'T-LOC', ci: false, full: false },
      { base: 'HEAD', full: false, files: ['frontend/src/a.css'], profiles: [] },
      [{ stage: 'sentinel', status: 'fail', durationMs: 1, findings, summary: '1 error' }],
      [],
      Date.now(),
    );
    const markdown = await readFile(result.markdownPath, 'utf8');
    /* Ruta RELATIVA al workspace (nunca absoluta) con línea y columna. */
    assert.match(markdown, /frontend\/src\/a\.css:157:5/);
    assert.doesNotMatch(markdown, /C:/);
    /* Sin archivo: no se inventa ubicación ni se pintan backticks vacíos. */
    assert.match(markdown, /- \[info\] r3: m3/);
    assert.doesNotMatch(markdown, /\[info\] `` /);
    /* Sin columna la línea no se confunde con una columna (cierra el
     * backtick justo tras la línea). */
    assert.match(markdown, /frontend\/src\/a\.css:12`/);
    assert.doesNotMatch(markdown, /frontend\/src\/a\.css:12:\d/);
    const compact = compactLines(result, { projectRoot, qualityConfig: { maxFindings: 3 } });
    const joined = compact.join('\n');
    assert.match(joined, /frontend\/src\/a\.css:157:5/);
    assert.match(joined, /frontend\/src\/a\.css:12/);
    assert.doesNotMatch(joined, /C:/);
    /* El JSON conserva la ruta tal cual la emitió el adapter. */
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    assert.equal(json.findings[0].file, absolute);
    assert.equal(json.findings[0].line, 157);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('formatFindingLocation no escapa del workspace con ../ o rutas absolutas', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-escape-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-ESC'), { recursive: true });
    const outside = path.join(projectRoot, '..', 'secret.ts').replace(/\\/gu, '/');
    const findings = [
      { severity: 'error', ruleId: 'r1', file: outside, line: 3, message: 'fuera' },
      { severity: 'warning', ruleId: 'r2', file: '/otro-disk/x.ts', line: 1, message: 'absoluta' },
    ];
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-ESC'),
        qualityConfig: { maxFindings: 3, maxReminders: 4 },
        tools: {},
      },
      { taskId: 'T-ESC', ci: false, full: false },
      { base: 'HEAD', full: false, files: [], profiles: [] },
      [{ stage: 'sentinel', status: 'fail', durationMs: 1, findings, summary: '1 error' }],
      [],
      Date.now(),
    );
    const markdown = await readFile(result.markdownPath, 'utf8');
    /* El hallazgo fuera del workspace conserva su ruta original (no se
     * relativiza a un `..` que apuntaría fuera del repo). */
    assert.match(markdown, /secret\.ts:3/);
    assert.doesNotMatch(markdown, /`\.\.\//);
    /* Nunca se relativiza a algo que escape el proyecto. */
    assert.doesNotMatch(markdown, /`\.\.`/);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('la salida compacta conserva estado, siguiente accion y limite de contexto', () => {
  const reportResult = {
    markdownPath: 'C:/repo/.quality-reports/T-1/latest.md',
    report: {
      taskId: 'T-1',
      decision: { label: 'FAIL' },
      scope: { full: true, executionFull: false, files: ['a.ts'] },
      stages: Array.from({ length: 5 }, (_, index) => ({
        stage: `stage-${index}`,
        status: index === 0 ? 'fail' : 'pass',
        cached: false,
        summary: 'resumen',
      })),
      findings: Array.from({ length: 20 }, (_, index) => ({
        severity: 'error', ruleId: `R${index}`, message: 'hallazgo',
      })),
      reminders: ['uno', 'dos', 'tres', 'cuatro'],
      policy: { policyHash: 'abc123', reason: 'política v2 válida', decision: { action: 'enforce' } },
      nextCommand: 'npm run task:check -- T-1',
    },
  };
  const context = { projectRoot: 'C:/repo', qualityConfig: { maxFindings: 3 } };
  const lines = compactLines(reportResult, context);

  assert.ok(lines.length <= 16);
  assert.match(lines[0], /T-1 — FAIL/);
  assert.match(lines[1], /full · ejecución incremental/);
  assert.equal(lines.filter(line => line.includes('hallazgo')).length, 3);
  assert.match(lines.at(-1), /Next: npm run task:check/);
});

test('la salida compacta respeta maxReminders además de maxFindings', () => {
  const reportResult = {
    markdownPath: 'C:/repo/.quality-reports/T-3/latest.md',
    report: {
      taskId: 'T-3',
      decision: { label: 'PASS' },
      scope: { full: false, files: ['a.ts'] },
      stages: [{ stage: 'sentinel', status: 'pass', summary: 'ok' }],
      findings: [],
      reminders: Array.from({ length: 8 }, (_, index) => `recordatorio-${index}`),
      policy: { policyHash: 'abc', decision: { action: 'enforce' }, reason: 'v2' },
      nextCommand: 'npm run task:check -- T-3',
    },
  };
  const context = { projectRoot: 'C:/repo', qualityConfig: { maxFindings: 3, maxReminders: 4 } };
  const lines = compactLines(reportResult, context);
  const reminders = lines.filter(line => line.includes('REMEMBER'));
  /* [028A-6] El contrato compacto limita los recordatorios a maxReminders (4),
   * aunque el reporte JSON/Markdown conserve el detalle completo. */
  assert.equal(reminders.length, 4);
  assert.match(reminders[0], /recordatorio-0/);
  assert.doesNotMatch(reminders.at(-1), /recordatorio-7/);
});

test('el reporte JSON, Markdown y compacto no exponen secretos de findings ni reminders', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-secret-'));
  try {
    await mkdir(path.join(projectRoot, '.quality-reports', 'T-4'), { recursive: true });
    const secretFinding = {
      severity: 'error',
      ruleId: 'hardcoded-secret',
      message: 'token=sk_test_abcdefghijklmnopqrstuvwxyz encontrado',
    };
    const result = await createReport(
      {
        projectRoot,
        reportRoot: path.join(projectRoot, '.quality-reports', 'T-4'),
        qualityConfig: { maxFindings: 3, maxReminders: 4 },
        tools: {},
        policyIdentity: {
          projectRoot,
          policyPath: null,
          policyHash: 'p',
          runtimeVersion: null,
          decision: { status: 'no-policy', mode: 'observe', action: 'pass-through', blocked: false, reason: 'sin política' },
          reason: 'sin política',
          recommendedCommand: 'npm run task:check -- T-4',
        },
      },
      { taskId: 'T-4', ci: false, full: false },
      { base: 'HEAD', full: false, files: [], profiles: [] },
      [{ stage: 'sentinel', status: 'fail', durationMs: 1, findings: [secretFinding], summary: '1 error' }],
      ['Bearer secret_bearer_token_123456789012'],
      Date.now(),
    );
    const json = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    const markdown = await readFile(result.markdownPath, 'utf8');
    const compact = compactLines(result, { projectRoot, qualityConfig: { maxFindings: 3, maxReminders: 4 } });
    const secrets = ['sk_test_abcdefghijklmnopqrstuvwxyz', 'secret_bearer_token_123456789012'];
    for (const secret of secrets) {
      assert.doesNotMatch(JSON.stringify(json), new RegExp(secret));
      assert.doesNotMatch(markdown, new RegExp(secret));
      assert.doesNotMatch(compact.join('\n'), new RegExp(secret));
    }
    assert.match(JSON.stringify(json), /REDACTED/);
    /* [028A-8 Fase 4] metrics.json acompaña a latest.json con el detalle de
     * timing por etapa y también redacta secretos. */
    const metrics = JSON.parse(await readFile(result.metricsPath, 'utf8'));
    assert.doesNotMatch(JSON.stringify(metrics), new RegExp(secrets.join('|')));
    assert.equal(metrics.stages[0].stage, 'sentinel');
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('el artifact conserva todos los hallazgos y los ordena de forma determinista', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'quality-reporter-order-'));
  try {
    const reportRoot = path.join(projectRoot, '.quality-reports', 'T-ORDER');
    await mkdir(reportRoot, { recursive: true });
    const result = await createReport(
      { projectRoot, reportRoot, qualityConfig: { maxFindings: 2, maxReminders: 1 }, tools: {} },
      { taskId: 'T-ORDER', ci: false, full: false },
      { base: 'HEAD', full: false, files: ['a.ts'], profiles: [] },
      [{
        stage: 'sentinel', status: 'fail', durationMs: 1,
        findings: [
          { severity: 'warning', ruleId: 'z-rule', file: 'z.ts', line: 2, message: 'z' },
          { severity: 'error', ruleId: 'b-rule', file: 'b.ts', line: 4, message: 'b' },
          { severity: 'error', ruleId: 'a-rule', file: 'a.ts', line: 9, message: 'a' },
        ], summary: '2 errores, 1 warning',
      }],
      ['uno', 'dos'],
      Date.now(),
    );
    const persisted = JSON.parse(await readFile(result.jsonPath, 'utf8'));
    assert.deepEqual(persisted.findings.map(finding => finding.ruleId), ['a-rule', 'b-rule', 'z-rule']);
    assert.equal(persisted.findings.length, 3, 'el artifact no debe aplicar el límite de la salida compacta');
    const compact = compactLines(result, { projectRoot, qualityConfig: { maxFindings: 2, maxReminders: 1 } });
    assert.equal(compact.filter(line => line.includes('ERROR') || line.includes('WARNING')).length, 2);
    assert.equal(compact.filter(line => line.includes('REMEMBER')).length, 1);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
