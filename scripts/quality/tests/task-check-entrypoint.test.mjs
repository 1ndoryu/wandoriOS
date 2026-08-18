/* [108A-1 Fase 0] Pruebas del entry point real de task-check.mjs.
 *
 * 1. Prueba de proceso: ejecuta `node scripts/quality/task-check.mjs <ID>
 *    --scope-manifest <fixture small>` y exige que el gate alcance una decisión
 *    estructurada (exit 0/1) sin ReferenceError, y que metrics.json exponga
 *    phaseDurationMs. Habría fallado ANTES del hotfix: el fragmento de 098A-1
 *    F0 usaba `preflightStartedAt` sin declararlo, así que todo task:check
 *    moría con ReferenceError justo después del preflight.
 * 2. Caso negativo estático: toda variable de medición de fases debe estar
 *    declarada antes de usarse; falla si alguien vuelve a cronometrar con una
 *    variable sin declarar.
 */
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import test from 'node:test';

import { fixtureManifest } from '../bench-fixtures.mjs';

const execFileAsync = promisify(execFile);
const projectRoot = process.cwd();
const SCRIPTS = path.join(projectRoot, 'scripts', 'quality');
const TASK_ID = '108A-1';
const MANIFEST_DIR = path.join(projectRoot, '.quality-bench', 'manifests');

function requireProcessResult(result, label, allowedCodes) {
  if (result instanceof Error) {
    assert.ok(Number.isInteger(result.code), `${label}: transporte sin exit code: ${result.message}`);
    assert.ok(allowedCodes.includes(result.code), `${label}: exit inesperado ${result.code}; stderr=${result.stderr ?? ''}`);
    return result;
  }
  return { ...result, code: 0 };
}

/* [108A-1] Misma técnica que bench-baseline: localiza el metrics.json más
 * reciente de la tarea y solo lo atribuye si es más nuevo que el arranque. */
async function latestMetrics(taskId, startedAt) {
  const branchesRoot = path.join(projectRoot, '.quality-reports', 'branches');
  let best = null;
  let bestTime = 0;
  const branches = await readdir(branchesRoot, { withFileTypes: true }).catch(() => []);
  for (const branch of branches) {
    if (!branch.isDirectory()) continue;
    const metricsPath = path.join(branchesRoot, branch.name, taskId, 'metrics.json');
    try {
      const metrics = JSON.parse(await readFile(metricsPath, 'utf8'));
      const generatedAt = Date.parse(metrics.generatedAt);
      if (Number.isFinite(generatedAt) && generatedAt >= startedAt && generatedAt >= bestTime) {
        best = metrics;
        bestTime = generatedAt;
      }
    } catch { /* tarea sin métricas en esta rama */ }
  }
  return best;
}

async function removeTaskReports(taskId) {
  const branchesRoot = path.join(projectRoot, '.quality-reports', 'branches');
  const branches = await readdir(branchesRoot, { withFileTypes: true }).catch(() => []);
  for (const branch of branches) {
    if (!branch.isDirectory()) continue;
    await rm(path.join(branchesRoot, branch.name, taskId), { recursive: true, force: true });
  }
}

test('task-check.mjs (entry point real) alcanza una decisión estructurada sin ReferenceError y escribe phaseDurationMs (108A-1 Fase 0)', async t => {
  /* La toma de 108A-1 existe en el checkout local; el gate bloquea (exit 78)
   * cerrar una tarea tomada por otro agente, así que el probe se identifica
   * con el mismo agente de la toma. En CI sin toma no hay enforcement. */
  let agentEnv = {};
  try {
    const takeover = JSON.parse(await readFile(path.join(projectRoot, '.quality-reports', 'task-takeover', `${TASK_ID}.json`), 'utf8'));
    agentEnv = { GLORY_AGENT_ID: takeover.takenBy };
  } catch { /* sin toma: defaultAgent del entorno */ }

  const manifestPath = path.join(MANIFEST_DIR, `probe-${TASK_ID}.json`);
  const startedAt = Date.now();
  await mkdir(MANIFEST_DIR, { recursive: true });
  await writeFile(manifestPath, `${JSON.stringify(fixtureManifest('small'), null, 2)}\n`, 'utf8');
  try {
    const result = requireProcessResult(await execFileAsync(process.execPath, [
      path.join(SCRIPTS, 'task-check.mjs'),
      TASK_ID,
      '--scope-manifest',
      manifestPath,
    ], { cwd: projectRoot, windowsHide: true, timeout: 5 * 60 * 1000, env: { ...process.env, ...agentEnv } }).catch(error => error), 'task-check entry point', [0, 1]);
    assert.ok([0, 1].includes(result.code), `exit debe ser una decisión estructurada (0/1), no ${result.code}`);
    assert.doesNotMatch(String(result.stderr ?? ''), /ReferenceError/, 'stderr no debe contener ReferenceError');
    const metrics = await latestMetrics(TASK_ID, startedAt);
    assert.ok(metrics, 'metrics.json debe escribirse tras la ejecución');
    const phases = metrics.phaseDurationMs ?? null;
    assert.ok(phases && typeof phases === 'object', 'metrics.json debe exponer phaseDurationMs');
    for (const key of ['preflightMs', 'maintenanceBeforeMs', 'maintenanceAfterMs', 'stageMs', 'reportWriteMs']) {
      assert.ok(Number.isFinite(phases[key]) && phases[key] >= 0, `phaseDurationMs.${key} debe ser un número >= 0 (recibido ${phases[key]})`);
    }
    assert.ok(Number.isFinite(metrics.durationMs), 'durationMs total presente');
    assert.ok(['local-light', 'full', 'ci'].includes(metrics.mode), `modo estructurado (${metrics.mode})`);
    t.diagnostic(`probe gate ${TASK_ID}: exit ${result.code}, mode ${metrics.mode}, preflightMs ${phases.preflightMs}, stageMs ${phases.stageMs}, reportWriteMs ${phases.reportWriteMs}`);
  } finally {
    await rm(manifestPath, { force: true });
    await removeTaskReports(TASK_ID);
  }
});

test('las variables de medición de fases están declaradas antes de usarse (caso negativo, 108A-1 Fase 0)', async () => {
  const source = await readFile(path.join(SCRIPTS, 'task-check.mjs'), 'utf8');
  /* Variables de cronometraje de fases en task-check.mjs. reportWriteMs se
   * mide dentro de reporter.mjs y no pertenece a esta lista. */
  const measured = [
    'preflightStartedAt', 'preflightMs',
    'maintenanceBeforeStartedAt', 'maintenanceBeforeMs',
    'stagesStartedAt', 'stageMs',
    'maintenanceAfterStartedAt', 'maintenanceAfterMs',
  ];
  for (const name of measured) {
    /* Los comentarios pueden mencionar el nombre antes de la declaración;
     * lo que importa es que exista la declaración y que el nombre se USE
     * después de ella. Esto falla si se usa sin declarar (el fallo de 098A-1
     * F0: preflightStartedAt sin const) o si se declara y nunca se usa. */
    const declaration = `const ${name} =`;
    const declaredAt = source.indexOf(declaration);
    assert.ok(declaredAt >= 0, `${name} debe declararse con '${declaration}' (fallo = variable usada sin declarar)`);
    const usedAfter = source.indexOf(name, declaredAt + declaration.length);
    assert.ok(usedAfter >= 0, `${name} debe usarse después de su declaración (fallo = medición muerta)`);
  }
});
