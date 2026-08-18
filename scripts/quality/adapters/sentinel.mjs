import path from 'node:path';
import { normalizeEntries, resultFromFindings } from './common.mjs';
import { runStructuredTool } from './structured-tool.mjs';

export async function runSentinel(context, scope) {
  const reportPath = path.join(context.reportRoot, 'sentinel.json');
  const args = [
    context.tools.sentinel.cliPath,
    'analyze',
    '--workspace', context.projectRoot,
    '--config', await sentinelConfigPath(context),
    '--format', 'json',
    '--output', reportPath,
  ];
  /* [028A-6] `full` describe el fingerprint; `executionFull` describe si
   * Sentinel puede analizar todo el workspace. Un perfil explícito mantiene
   * fingerprint full sin ampliar accidentalmente el análisis. */
  if (!(scope.executionFull ?? scope.full) || scope.profileOverride) args.push('--files-from', scope.changedFilesPath);

  const result = await runStructuredTool(context, {
    name: 'sentinel', executable: process.execPath, args, reportPath,
    timeoutMs: context.qualityConfig.timeoutsMs.sentinel,
    expectedSchemaVersion: context.tools.sentinel.outputSchemaVersion,
  });
  if (result.failure) return result.failure;
  return resultFromFindings('sentinel', normalizeEntries(result.report.entries), result.execution.durationMs, result.logPath);
}

/* [028A-6 Fase 3] En v2, la config del analizador vive en
 * analyzers.sentinel.config: si es un objeto, se escribe a un archivo
 * temporal estable dentro del reportRoot para pasarla al CLI (el CLI lee un
 * path, no un objeto); si es string, se resuelve relativo al workspace. En
 * v1 (reglas sueltas en la raíz) se pasa el propio sentinel.config.json. */
async function sentinelConfigPath(context) {
  const rootPath = path.join(context.projectRoot, 'sentinel.config.json');
  const raw = JSON.parse(await import('node:fs/promises').then(fs => fs.readFile(rootPath, 'utf8')));
  const inner = raw?.schemaVersion === 2 ? raw.analyzers?.sentinel?.config : undefined;
  if (inner === undefined) return rootPath;
  if (typeof inner === 'string') return path.resolve(context.projectRoot, inner);
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const target = path.join(context.reportRoot, 'sentinel-analyzer-config.json');
    await import('node:fs/promises').then(fs => fs.writeFile(target, `${JSON.stringify(inner, null, 2)}\n`, 'utf8'));
    return target;
  }
  return rootPath;
}
