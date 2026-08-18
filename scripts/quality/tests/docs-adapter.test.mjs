import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDocs } from '../adapters/docs.mjs';

async function makeRoot(roadmapLines = 20, extraFiles = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'quality-docs-'));
  const reportRoot = path.join(root, '.quality-reports', 'T', 'logs');
  await mkdir(reportRoot, { recursive: true });
  const lines = [];
  lines.push('# Roadmap test');
  lines.push('');
  lines.push('## Pendientes');
  lines.push('');
  lines.push('- [ ] 297A-16: tarea de prueba');
  while (lines.length < roadmapLines) lines.push('<!-- relleno -->');
  await writeFile(path.join(root, 'roadmap.md'), `${lines.join('\n')}\n`, 'utf8');
  await mkdir(path.join(root, 'Agente', 'planes'), { recursive: true });
  for (const [name, content] of Object.entries(extraFiles)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return { root, reportRoot, context: { projectRoot: root, reportRoot, logsRoot: reportRoot, qualityConfig: {} } };
}

test('roadmap con menos de 700 líneas pasa la regla de tamaño', async () => {
  const { root, context } = await makeRoot(50);
  try {
    const result = await runDocs(context, '297A-16');
    assert.equal(result.stage, 'docs');
    assert.ok(!result.findings.some(finding => finding.ruleId === 'docs-roadmap-max-lines'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('roadmap que supera las 700 líneas es BLOQUEANTE (error → fail)', async () => {
  const { root, context } = await makeRoot(701);
  try {
    const result = await runDocs(context, '297A-16');
    const maxLines = result.findings.find(finding => finding.ruleId === 'docs-roadmap-max-lines');
    assert.ok(maxLines, 'debe emitir docs-roadmap-max-lines');
    assert.equal(maxLines.severity, 'error', 'el límite de líneas es bloqueante');
    assert.equal(maxLines.file, 'roadmap.md');
    assert.match(maxLines.message, /701/);
    assert.match(maxLines.message, /700/);
    assert.match(maxLines.message, /Agente\/completados/);
    assert.equal(result.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('roadmap exactamente en el límite (700) pasa; 701 falla (off-by-one)', async () => {
  const { root, context } = await makeRoot(700);
  try {
    const atLimit = await runDocs(context, '297A-16');
    assert.ok(!atLimit.findings.some(finding => finding.ruleId === 'docs-roadmap-max-lines'), '700 líneas exactas no deben fallar');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('el conteo de líneas es idéntico con saltos CRLF (Windows)', async () => {
  const { root, context } = await makeRoot(50);
  try {
    const roadmap = await readFile(path.join(root, 'roadmap.md'), 'utf8');
    /* Mismo contenido con CRLF: el conteo wc-like (nº de \n) no cambia. */
    await writeFile(path.join(root, 'roadmap.md'), roadmap.replace(/\n/gu, '\r\n'), 'utf8');
    const result = await runDocs(context, '297A-16');
    assert.ok(!result.findings.some(finding => finding.ruleId === 'docs-roadmap-max-lines'));
    /* Y sobre el límite con CRLF también falla igual. */
    const big = await readFile(path.join(root, 'roadmap.md'), 'utf8');
    const extra = Array.from({ length: 660 }, () => '<!-- relleno -->\r\n').join('');
    await writeFile(path.join(root, 'roadmap.md'), `${big}${extra}`, 'utf8');
    const over = await runDocs(context, '297A-16');
    assert.ok(over.findings.some(finding => finding.ruleId === 'docs-roadmap-max-lines'), 'CRLF sobre el límite también bloquea');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('el límite de líneas es configurable desde quality.config.json', async () => {
  const { root, context } = await makeRoot(60);
  try {
    context.qualityConfig.roadmapMaxLines = 50;
    const result = await runDocs(context, '297A-16');
    const maxLines = result.findings.find(finding => finding.ruleId === 'docs-roadmap-max-lines');
    assert.ok(maxLines, 'con límite 50 un roadmap de 60 debe fallar');
    assert.equal(maxLines.severity, 'error');
    assert.match(maxLines.message, /50 líneas/);
    assert.equal(result.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('roadmap con sección de completadas falla (no debe acumular historia)', async () => {
  const { root, context } = await makeRoot();
  try {
    const roadmap = await readFile(path.join(root, 'roadmap.md'), 'utf8');
    await writeFile(path.join(root, 'roadmap.md'), `${roadmap}\n## Completadas\n\n- [x] 297A-15: terminada\n`, 'utf8');
    const result = await runDocs(context, '297A-16');
    assert.ok(result.findings.some(finding => finding.ruleId === 'docs-roadmap-completed'));
    assert.equal(result.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('taskId ausente del roadmap falla con docs-task-missing', async () => {
  const { root, context } = await makeRoot();
  try {
    const result = await runDocs(context, '999A-99');
    assert.ok(result.findings.some(finding => finding.ruleId === 'docs-task-missing'));
    assert.equal(result.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('un plan sin checklist en Agente/planes falla con docs-plan-no-checklist', async () => {
  const { root, context } = await makeRoot(30, {
    'Agente/planes/plan-sin-checklist-2026-08-05.md': '# Plan sin checklist\n\nTexto sin casillas.\n',
  });
  try {
    const result = await runDocs(context, '297A-16');
    assert.ok(result.findings.some(finding => finding.ruleId === 'docs-plan-no-checklist'));
    assert.equal(result.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('una referencia canónica inexistente en el roadmap falla con docs-link-missing', async () => {
  const { root, context } = await makeRoot();
  try {
    const roadmap = await readFile(path.join(root, 'roadmap.md'), 'utf8');
    await writeFile(path.join(root, 'roadmap.md'), `${roadmap}\nFuente: \`Agente/planes/plan-inexistente-2026-08-05.md\`\n`, 'utf8');
    const result = await runDocs(context, '297A-16');
    assert.ok(result.findings.some(finding => finding.ruleId === 'docs-link-missing'));
    assert.equal(result.status, 'fail');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
