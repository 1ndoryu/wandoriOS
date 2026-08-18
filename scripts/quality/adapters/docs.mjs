import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { writeStageLog } from './common.mjs';

async function exists(target) {
  try { await access(target); return true; } catch { return false; }
}

/* [028A-17] Límite de tamaño del roadmap: cuando roadmap.md crece, se vuelve
 * difícil de mantener y los agentes pierden la visión del siguiente bloque.
 * La regla es BLOQUEANTE (severity error → FAIL del gate): el roadmap debe
 * compactarse moviendo tareas completadas a Agente/completados/ en vez de
 * acumular historia. El límite se configura en quality.config.json
 * (roadmapMaxLines, 700 por defecto). */
/* Misma medida que `wc -l` (nº de saltos de línea): un fichero de 701
 * líneas reales tiene 701 `\n`. Un split() con el salto final sumaría 1. */
function roadmapLineCount(content) {
  return (content.match(/\n/gu) ?? []).length;
}

export async function runDocs(context, taskId) {
  const startedAt = Date.now();
  const findings = [];
  const roadmapPath = path.join(context.projectRoot, 'roadmap.md');
  const roadmap = await readFile(roadmapPath, 'utf8');

  const maxLines = Number.isInteger(context.qualityConfig?.roadmapMaxLines)
    ? context.qualityConfig.roadmapMaxLines
    : 700;
  const roadmapLines = roadmapLineCount(roadmap);
  if (roadmapLines > maxLines) {
    findings.push({
      ruleId: 'docs-roadmap-max-lines',
      severity: 'error',
      file: 'roadmap.md',
      message: `roadmap.md supera las ${maxLines} líneas (${roadmapLines}). Compacta: mueve tareas completadas a Agente/completados/tareas-YYYY-MM-DD.md y retíralas del roadmap antes de cerrar.`,
    });
  }

  if (!roadmap.includes(taskId)) {
    findings.push({ ruleId: 'docs-task-missing', severity: 'error', file: 'roadmap.md', message: `${taskId} no aparece en roadmap.md` });
  }
  if (/##\s+(?:tareas\s+)?completad/i.test(roadmap)) {
    findings.push({ ruleId: 'docs-roadmap-completed', severity: 'error', file: 'roadmap.md', message: 'roadmap.md no debe acumular tareas completadas' });
  }

  const plansRoot = path.join(context.projectRoot, 'Agente', 'planes');
  for (const entry of await readdir(plansRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const content = await readFile(path.join(plansRoot, entry.name), 'utf8');
    if (!/- \[[ x]\]/i.test(content)) {
      findings.push({ ruleId: 'docs-plan-no-checklist', severity: 'error', file: `Agente/planes/${entry.name}`, message: 'Plan activo sin checklist' });
    }
  }

  const canonical = [...roadmap.matchAll(/`((?:Agente\/)[^`]+\.md)`/g)].map(match => match[1]);
  for (const relativePath of canonical) {
    if (!await exists(path.join(context.projectRoot, relativePath))) {
      findings.push({ ruleId: 'docs-link-missing', severity: 'error', file: 'roadmap.md', message: `Referencia inexistente: ${relativePath}` });
    }
  }

  const logPath = await writeStageLog(context, 'docs', findings.map(item => `${item.ruleId}: ${item.message}`).join('\n'));
  return {
    stage: 'docs',
    status: findings.length > 0 ? 'fail' : 'pass',
    durationMs: Date.now() - startedAt,
    findings,
    summary: findings.length > 0 ? `${findings.length} problemas` : 'documentación coherente',
    logPath,
  };
}
