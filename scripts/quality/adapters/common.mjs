import { readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { redact, truncate } from '../redaction.mjs';

const SEVERITIES = new Set(['information', 'hint', 'info', 'critical', 'error', 'warning']);

export function normalizeSeverity(value) {
  if (value === 'information' || value === 'hint' || value === 'info') return 'info';
  if (value === 'critical' || value === 'error') return 'error';
  return 'warning';
}

export function npmInvocation(args) {
  /* [028A-6 Fase 3] Bajo `npm run` el ejecutor es npm_execpath; bajo `node
   * ...` directo (p. ej. stage-process.mjs del gate agnóstico) se usa el npm
   * del PATH. Ambos caminos resuelven el mismo npm. */
  if (process.env.npm_execpath) {
    return { executable: process.execPath, args: [process.env.npm_execpath, ...args] };
  }
  return { executable: process.platform === 'win32' ? 'npm.cmd' : 'npm', args };
}

export function conciseFailure(output, fallback) {
  const lines = redact(output).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.slice(-4).join(' | ') || fallback;
}

export function normalizeEntries(entries = []) {
  return entries.flatMap(entry => (entry.findings ?? []).map(finding => ({
    ruleId: String(finding.ruleId ?? 'unknown'),
    severity: normalizeSeverity(finding.severity),
    file: (entry.ruta ?? entry.file ?? finding.file) ? String(entry.ruta ?? entry.file ?? finding.file).replace(/\\/g, '/') : undefined,
    line: Number.isInteger(finding.range?.start?.line) ? finding.range.start.line + 1 : undefined,
    message: redact(finding.message ?? 'Hallazgo sin mensaje'),
    help: finding.suggestion || finding.remediation ? redact(finding.suggestion ?? finding.remediation) : undefined,
    confidence: finding.confidence,
  })));
}

export async function readToolReport(reportPath) {
  let report;
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { throw new Error(`JSON inválido en ${reportPath}: ${error.message}`); }
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('el reporte debe ser un objeto');
  }
  if (!Array.isArray(report.entries)) {
    throw new Error('el reporte debe contener entries como lista');
  }
  for (const entry of report.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Array.isArray(entry.findings)) {
      throw new Error('cada entrada del reporte debe contener findings como lista');
    }
    for (const finding of entry.findings) {
      if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
        throw new Error('cada finding debe ser un objeto');
      }
      if (typeof finding.ruleId !== 'string' || finding.ruleId.length === 0 || typeof finding.message !== 'string') {
        throw new Error('cada finding debe contener ruleId y message');
      }
      if (!SEVERITIES.has(finding.severity)) {
        throw new Error('severity de finding desconocida');
      }
    }
  }
  return report;
}

export async function writeStageLog(context, stage, content) {
  const target = path.join(context.logsRoot, `${stage}.log`);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, truncate(content), 'utf8');
  await rename(temporary, target);
  return target;
}

export function toolFailure(stage, execution, logPath, state = execution.timedOut ? 'timeout' : execution.cancelled ? 'cancelled' : 'tool-error') {
  const timedOut = state === 'timeout';
  const cancelled = state === 'cancelled';
  const invalidOutput = state === 'invalid-output';
  return {
    stage,
    status: 'error',
    state,
    durationMs: execution.durationMs,
    findings: [{
      ruleId: timedOut ? 'quality-timeout' : cancelled ? 'quality-cancelled' : invalidOutput ? 'quality-invalid-output' : 'quality-tool-error',
      severity: 'error',
      message: timedOut
        ? `${stage} excedió el timeout`
        : cancelled
          ? `${stage} fue cancelado`
          : invalidOutput
            ? `${stage} produjo una salida estructuralmente inválida`
            : `${stage} terminó con código ${execution.code}`,
    }],
    summary: timedOut ? 'timeout' : cancelled ? 'cancelled' : invalidOutput ? 'invalid-output' : `error ${execution.code}`,
    logPath,
  };
}

export function resultFromFindings(stage, findings, durationMs, logPath) {
  const errors = findings.filter(item => item.severity === 'error').length;
  const warnings = findings.filter(item => item.severity === 'warning').length;
  const infos = findings.filter(item => item.severity === 'info').length;
  return {
    stage,
    status: errors > 0 ? 'fail' : 'pass',
    state: errors > 0 || findings.length > 0 ? 'findings' : 'pass',
    durationMs,
    findings,
    summary: `${errors} errores, ${warnings} warnings, ${infos} info`,
    logPath,
  };
}
