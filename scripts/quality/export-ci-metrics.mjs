import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAtomic } from './atomic-file.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/* [028A-8 Fase 4] Export de métricas históricas para CI: agrega todos los
 * `metrics.json` bajo el árbol de ramas de `.quality-reports` en un único
 * archivo compacto que solo contiene timing/cache/estado (ya redactado por
 * el reporter en origen). No incluye código fuente ni rutas absolutas: el
 * branch key y las rutas ya fueron redactados al escribirse metrics.json. */
export async function collectMetrics(branchesRoot) {
  const runs = [];
  const branches = await readdir(branchesRoot, { withFileTypes: true }).catch(() => []);
  for (const branch of branches) {
    if (!branch.isDirectory()) continue;
    const branchPath = path.join(branchesRoot, branch.name);
    const tasks = await readdir(branchPath, { withFileTypes: true }).catch(() => []);
    for (const task of tasks) {
      if (!task.isDirectory()) continue;
      const metricsPath = path.join(branchPath, task.name, 'metrics.json');
      try {
        const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
        if (metrics?.schemaVersion !== 1) continue;
        runs.push({
          taskId: metrics.taskId,
          branch: metrics.branch?.canonicalRef ?? branch.name,
          shortCommit: metrics.branch?.shortCommit ?? null,
          generatedAt: metrics.generatedAt,
          mode: metrics.mode,
          durationMs: metrics.durationMs,
          stages: metrics.stages?.map(stage => ({
            stage: stage.stage,
            status: stage.status,
            durationMs: stage.durationMs,
            cache: stage.cache,
            cacheReason: stage.cacheReason,
            metrics: stage.metrics && typeof stage.metrics === 'object' ? stage.metrics : null,
          })) ?? [],
        });
      } catch { /* metrics.json ausente o inválido: se omite. */ }
    }
  }
  return runs.sort((left, right) => String(left.generatedAt).localeCompare(String(right.generatedAt)));
}

export function buildExportPayload(runs, exportedAt = new Date().toISOString()) {
  return { schemaVersion: 1, exportedAt, runs };
}

async function main() {
  /* [108A-6] El gate canónico (`sentinel check --stages` vía gate:check)
   * publica en `.quality-reports/check/<taskId>/`; el legacy
   * (`task:check`) en `.quality-reports/branches/`. Se agregan ambos
   * namespaces para que la métrica histórica de CI sobreviva la
   * transición (deduplicando por taskId + generatedAt). */
  const branchesRoot = path.join(projectRoot, '.quality-reports', 'branches');
  const checkRoot = path.join(projectRoot, '.quality-reports', 'check');
  const runs = [...await collectMetrics(branchesRoot), ...await collectMetrics(checkRoot)]
    .filter((run, index, all) => all.findIndex(other => other.taskId === run.taskId && other.generatedAt === run.generatedAt) === index);
  const payload = buildExportPayload(runs);
  const outputPath = path.join(projectRoot, '.quality-reports', 'ci-metrics.json');
  await writeAtomic(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`[ci-metrics] ${runs.length} ejecuciones exportadas a ${path.relative(projectRoot, outputPath)}\n`);
}

/* [028A-8 Fase 4] Guarda de entrada: importar las funciones de agregación
 * desde un test no debe leer reportes ni escribir ci-metrics.json. */
const isEntryPoint = typeof process.argv[1] === 'string'
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntryPoint) await main();
