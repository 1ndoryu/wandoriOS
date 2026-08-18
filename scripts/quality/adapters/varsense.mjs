import { normalizeEntries, resultFromFindings } from './common.mjs';
import { runStructuredTool } from './structured-tool.mjs';
import { buildVarsenseInvocation } from './varsense-contract.mjs';

async function runCommand(context, scope) {
  const invocation = buildVarsenseInvocation(context, scope);
  const result = await runStructuredTool(context, {
    name: 'varsense', executable: process.execPath, args: invocation.args, reportPath: invocation.reportPath,
    timeoutMs: context.qualityConfig.timeoutsMs.varsense,
    expectedSchemaVersion: context.tools.varsense.outputSchemaVersion,
  });
  return { ...result, scope: invocation.scope };
}

export async function runVarsense(context, scope) {
  const startedAt = Date.now();
  const current = await runCommand(context, scope);
  if (current.failure) return { ...current.failure, metadata: { varsenseScope: current.scope } };
  /* [028A-8 Fase 0/4] Las métricas del CLI (filesDiscovered/analyzed/reused,
   * cacheHitRate, peakRssMb) viajan en la etapa del reporte: el gate muestra
   * cuántos archivos reutilizó y qué memoria consumió sin leer logs. */
  const metrics = current.report?.metrics ?? null;
  return {
    ...resultFromFindings('varsense', normalizeEntries(current.report.entries), Date.now() - startedAt, current.logPath),
    metadata: { varsenseScope: current.scope },
    metrics,
  };
}
