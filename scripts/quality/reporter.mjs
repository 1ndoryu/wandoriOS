import path from 'node:path';
import { writeAtomic } from './atomic-file.mjs';
import { sanitize } from './redaction.mjs';

function finalDecision(stages) {
  if (stages.some(stage => stage.state === 'cancelled')) return { exitCode: 130, label: 'CANCELLED' };
  if (stages.some(stage => stage.status === 'error')) return { exitCode: 2, label: 'SETUP ERROR' };
  if (stages.some(stage => stage.status === 'fail')) return { exitCode: 1, label: 'FAIL' };
  return { exitCode: 0, label: 'PASS' };
}

/* [038A-1] Duración por etapa legible: ms por debajo de 1s, segundos con 1 decimal en adelante. */
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/* [028A-8] Alcance honesto: requested/automatic/effective quedan separados en
 * el JSON; el texto compacto muestra el motivo cuando el fingerprint no
 * coincide con la ejecución efectiva (p. ej. full diferido por el guard). */
function formatScope(scope) {
  const fingerprint = scope.full ? 'full' : 'incremental';
  const execution = (scope.effectiveFull ?? scope.executionFull ?? scope.full) ? 'full' : 'incremental';
  const base = fingerprint === execution ? fingerprint : `${fingerprint} · ejecución ${execution}`;
  const reason = scope.fullReason && scope.fullReason !== 'incremental' ? ` (${scope.fullReason})` : '';
  return `${base}${reason}`;
}

const SEVERITY_ORDER = new Map([['error', 0], ['warning', 1], ['info', 2]]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/* [028A-17] Ubicación legible de un hallazgo: ruta relativa al workspace
 * (nunca absoluta), con línea y columna cuando el analyzer las manda.
 * El JSON conserva `file` tal cual llega del adapter; solo el texto del
 * reporte (Markdown y terminal) se normaliza para que el agente pueda abrir
 * el archivo de inmediato. */
function formatFindingLocation(finding, projectRoot) {
  if (!finding?.file) return '';
  let file = String(finding.file).replace(/\\/gu, '/');
  if (projectRoot) {
    const relative = path.relative(projectRoot, finding.file).replace(/\\/gu, '/');
    /* Solo se usa la relativa si no escapa del workspace: ni `..` (el padre
     * mismo) ni `../…`, ni una ruta absoluta de otro disco. Si escapa, se
     * conserva la ruta original (fuera del workspace el relativo no aporta). */
    const escapes = relative === '..' || relative.startsWith('../') || path.isAbsolute(relative);
    if (!escapes) file = relative;
  }
  let location = file;
  if (Number.isInteger(finding.line)) location += `:${finding.line}`;
  /* La columna solo tiene sentido tras la línea; sin línea, `archivo:5`
   * parecería una línea y confundiría. */
  if (Number.isInteger(finding.line) && Number.isInteger(finding.column)) location += `:${finding.column}`;
  return location;
}

/* Orden estable para comparar artifacts entre ejecuciones. No usa
 * localeCompare: el locale del agente/CI no debe cambiar el JSON publicado. */
function compareFindings(left, right) {
  const severity = (SEVERITY_ORDER.get(left.severity) ?? 99) - (SEVERITY_ORDER.get(right.severity) ?? 99);
  if (severity !== 0) return severity;
  for (const [leftValue, rightValue] of [
    [left.ruleId ?? '', right.ruleId ?? ''],
    [left.file ?? '', right.file ?? ''],
  ]) {
    const result = compareText(String(leftValue), String(rightValue));
    if (result !== 0) return result;
  }
  const line = Number(left.line ?? 0) - Number(right.line ?? 0);
  if (line !== 0) return line;
  return compareText(String(left.message ?? ''), String(right.message ?? ''));
}

function markdown(report) {
  const lines = [
    `# Quality report ${report.taskId}`,
    '',
    `- Estado: **${report.decision.label}**`,
    `- Alcance: ${formatScope(report.scope)} (${report.scope.files.length} archivos)`,
    `- Duración: ${report.durationMs}ms (${formatDuration(report.durationMs)})`,
    `- Política: ${report.policy.policyHash} · ${report.policy.decision?.action ?? 'unknown'} · ${report.policy.reason}`,
    ...(report.reportRetention?.status === 'error' ? [`- Retención: **error no bloqueante** — ${report.reportRetention.message}`] : []),
    ...(report.reportRetention?.overQuota ? [`- Retención: **overQuota** — ${report.reportRetention.currentBranchBytes} bytes en la rama activa`] : []),
    ...(report.targetMaintenance?.status === 'error' ? [`- Targets: **error de cuota/mantenimiento** — ${report.targetMaintenance.message ?? 'revisa activeDetails/failed'}`] : []),
    ...(report.targetMaintenance?.removed?.length ? [`- Targets: **${report.targetMaintenance.removed.length} podados** (${report.targetMaintenance.removed.map(item => `${item.name}:${item.reason}`).join(', ')}) — ${report.targetMaintenance.totalBytes} bytes restantes`] : []),
    ...(report.targetMaintenance?.quotaExceeded ? [`- Targets: **CUOTA EXCEDIDA** — quedan ${report.targetMaintenance.totalBytes} bytes porque los targets activos están protegidos; detén/coordina los procesos antes de continuar.`] : []),
    ...(report.targetMaintenance?.skipped === 'cooldown' ? ['- Targets: cuota supervisada; retención por edad en ventana'] : []),
    ...(report.indexMaintenance?.status === 'error' ? [`- Índices: **error no bloqueante** — ${report.indexMaintenance.message}`] : []),
    ...(report.indexMaintenance?.removed?.length ? [`- Índices: **${report.indexMaintenance.removed.length} podados** (${report.indexMaintenance.removed.map(item => `${item.branchKey}/${item.index}:${item.reason}`).join(', ')}) — ${report.indexMaintenance.remainingBytes} bytes restantes`] : []),
    ...(report.indexMaintenance?.skipped === 'cooldown' ? ['- Índices: supervisados hace menos de la ventana'] : []),
    ...(report.heavyGuard ? [`- Full diferido: **${report.heavyGuard.reason}** — ${report.heavyGuard.nextAllowedAt ?? report.heavyGuard.message ?? 'reintento bloqueado'}`] : []),
    ...(report.taskTakeover ? [`- Toma de tarea: **${report.taskTakeover.takenBy}** (${report.taskTakeover.id}) desde ${report.taskTakeover.takenAt} — expira ${report.taskTakeover.expiresAt}`] : []),
    ...(report.heavyOverride ? [`- Excepción pesada: **OVERRIDE** — ${report.heavyOverride.granted ? 'concedida' : 'denegada'} · source ${report.heavyOverride.source}${report.heavyOverride.reason ? ` · motivo: ${report.heavyOverride.reason}` : ''}`] : []),
    '',
    '## Etapas',
    '',
    ...report.stages.map(stage => `- **${stage.stage}:** ${stage.status}${stage.cached ? ' (cache)' : ''} — ${formatDuration(stage.durationMs)} — ${stage.summary}${formatStageDetail(stage)}`),
  ];
  if (report.findings.length > 0) {
    lines.push('', '## Hallazgos', '');
    const projectRoot = report.policy?.projectRoot ?? null;
    for (const item of report.findings) {
      const location = formatFindingLocation(item, projectRoot);
      /* Sin ubicación no se pintan backticks vacíos (`` ` ` `` feo en MD):
       * la línea queda como severidad + regla + mensaje. */
      const located = location ? `\`${location}\` ` : '';
      lines.push(`- [${item.severity}] ${located}${item.ruleId}: ${item.message}`);
    }
  }
  lines.push('', '## Recordatorios', '', ...report.reminders.map(item => `- ${item}`), '');
  lines.push('- Detalle de timing por etapa: `metrics.json` (duración, cache hit/miss, invalidación y métricas del analizador)');
  return lines.join('\n');
}

export async function createReport(context, args, scope, stages, reminders, startedAt) {
  /* [108A-1 Fase 0][098A-1 F0] Fase de escritura del reporte: se cronometra
   * desde el inicio de createReport hasta terminar de escribir metrics.json
   * (JSON + Markdown + métricas). Es medición pura; no afecta la decisión. */
  const reportStartedAt = Date.now();
  const decision = finalDecision(stages);
  const findings = stages.flatMap(stage => stage.findings).sort(compareFindings);
  const deferred = context.heavyDeferred ?? null;
  const report = sanitize({
    schemaVersion: 1,
    taskId: args.taskId,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    mode: args.ci ? 'ci' : (scope.effectiveFull ?? scope.executionFull ?? scope.full) ? 'full' : 'local-light',
    heavyGuard: deferred,
    branch: context.branch ?? null,
    reportRetention: context.reportRetention ?? null,
    targetMaintenance: context.targetMaintenance ?? null,
    indexMaintenance: context.indexMaintenance ?? null,
    heavyOverride: context.heavyOverride ?? null,
    taskTakeover: context.taskTakeover ?? null,
    policy: context.policyIdentity ?? {
      projectRoot: context.projectRoot,
      policyPath: null,
      policyHash: 'unavailable',
      runtimeVersion: null,
      decision: { status: 'invalid-policy', mode: 'observe', action: 'error', blocked: false, reason: 'identidad de política no disponible' },
      reason: 'identidad de política no disponible',
      recommendedCommand: `npm run task:check -- ${args.taskId}`,
    },
    scope: {
      base: scope.base,
      full: scope.full,
      requestedFull: scope.requestedFull ?? scope.full,
      automaticFull: scope.automaticFull ?? false,
      effectiveFull: scope.effectiveFull ?? scope.executionFull ?? scope.full,
      fullReason: scope.fullReason ?? null,
      heavyDeferred: scope.heavyDeferred ?? false,
      executionFull: scope.executionFull ?? scope.full,
      files: scope.files,
      deletedFiles: scope.deletedFiles ?? [],
      profiles: [...scope.profiles],
    },
    tools: Object.fromEntries(Object.entries(context.tools).map(([name, tool]) => [name, {
      version: tool.version, commit: tool.commit, outputSchemaVersion: tool.outputSchemaVersion,
    }])),
    stages,
    findings,
    reminders,
    decision,
    nextCommand: deferred
      ? `npm run task:check -- ${args.taskId} --full --allow-heavy`
      : decision.exitCode === 0 ? 'git status --short' : `npm run task:check -- ${args.taskId}`,
  });
  const jsonPath = path.join(context.reportRoot, 'latest.json');
  const markdownPath = path.join(context.reportRoot, 'latest.md');
  const metricsPath = path.join(context.reportRoot, 'metrics.json');
  await writeAtomic(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomic(markdownPath, markdown(report));
  /* [028A-8 Fase 4] Detalle de timing por etapa en `metrics.json` aparte del
   * reporte: durationMs, cache hit/miss, razón de invalidación y métricas del
   * analizador (filesAnalyzed/filesReused/cacheHitRate/peakRssMb). Es la
   * materia prima de `quality:profile`/`sentinel profile` y de la publicación
   * histórica de CI, sin inflar latest.json ni el stdout. */
  /* [108A-1 Fase 0][098A-1 F0] phaseDurationMs separa las fases del cierre
   * que no son etapas: preflight, mantenimiento previo/posterior, etapas y
   * escritura de reportes. preflightMs/maintenanceBeforeMs/maintenanceAfterMs/
   * stageMs los mide task-check.mjs; reportWriteMs se mide aquí. Solo se
   * cronometra: no cambia PASS/FAIL/ERROR ni el exit code. */
  const metrics = sanitize({
    schemaVersion: 1,
    taskId: args.taskId,
    generatedAt: report.generatedAt,
    durationMs: report.durationMs,
    mode: report.mode,
    branch: context.branch ?? null,
    phaseDurationMs: {
      ...(context.phaseDurationMs ?? {}),
      reportWriteMs: Date.now() - reportStartedAt,
    },
    stages: stages.map(stage => ({
      stage: stage.stage,
      status: stage.status,
      state: stage.state ?? null,
      durationMs: Number.isFinite(stage.durationMs) ? stage.durationMs : null,
      cache: stage.cache ?? (stage.cached ? 'hit' : 'miss'),
      cacheReason: stage.cacheReason ?? null,
      summary: stage.summary ?? '',
      metrics: stage.metrics && typeof stage.metrics === 'object' ? stage.metrics : null,
    })),
  });
  await writeAtomic(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
  return { report, jsonPath, markdownPath, metricsPath };
}

/* [028A-8 Fase 0/4] Detalle por etapa en Markdown: razón de invalidación de
 * caché y métricas del analizador (reusados/analizados, cache hit, RSS) sin
 * repetir texto del summary. Nunca expone rutas absolutas ni secretos. */
function formatStageDetail(stage) {
  const parts = [];
  if (stage.cache === 'miss' && stage.cacheReason && stage.cacheReason !== 'match') parts.push(`invalidación: ${stage.cacheReason}`);
  const metrics = stage.metrics;
  if (metrics && typeof metrics === 'object') {
    if (Number.isInteger(metrics.filesReused)) parts.push(`reusados ${metrics.filesReused}`);
    if (Number.isInteger(metrics.filesAnalyzed)) parts.push(`analizados ${metrics.filesAnalyzed}`);
    if (typeof metrics.cacheHitRate === 'number') parts.push(`hit ${metrics.cacheHitRate.toFixed(2)}`);
    if (typeof metrics.peakRssMb === 'number') parts.push(`rss ${Math.round(metrics.peakRssMb)}MB`);
  }
  return parts.length > 0 ? ` — ${parts.join(' · ')}` : '';
}

export function compactLines(reportResult, context) {
  const { report } = reportResult;
  const lines = [
    `[quality] ${report.taskId} — ${report.decision.label}`,
    `[quality] Scope: ${formatScope(report.scope)} · ${report.scope.files.length} archivos`,
  ];
  for (const stage of report.stages) {
    lines.push(`[quality] ${stage.stage.padEnd(9)} ${stage.status.toUpperCase()}${stage.cached ? ' (cached)' : ''} · ${formatDuration(stage.durationMs)} · ${stage.summary}${formatStageDetail(stage)}`);
  }
  for (const finding of report.findings.slice(0, context.qualityConfig.maxFindings)) {
    const location = formatFindingLocation(finding, context.projectRoot);
    const prefix = location ? `${location} · ` : '';
    lines.push(`[quality] ${finding.severity.toUpperCase()} ${prefix}${finding.ruleId}: ${finding.message}`);
  }
  /* [028A-6] Límite defensivo también aquí: el contrato compacto publica como
   * máximo maxFindings hallazgos y maxReminders recordatorios (3/4 por
   * defecto), aunque el origen pase listas más largas. El reporte JSON/Markdown
   * completo conserva el detalle total. */
  for (const reminder of report.reminders.slice(0, context.qualityConfig.maxReminders)) {
    lines.push(`[quality] REMEMBER ${reminder}`);
  }
  if (report.heavyOverride) {
    lines.push(`[quality] OVERRIDE ${report.heavyOverride.source} ${report.heavyOverride.granted ? 'concedida' : 'denegada'}${report.heavyOverride.reason ? ` motivo=${report.heavyOverride.reason}` : ''}`);
  }
  lines.push(`[quality] Report: ${path.relative(context.projectRoot, reportResult.markdownPath)}`);
  lines.push(`[quality] Next: ${report.nextCommand}`);
  return lines;
}

export function printCompact(reportResult, context) {
  for (const line of compactLines(reportResult, context)) console.log(line);
}
