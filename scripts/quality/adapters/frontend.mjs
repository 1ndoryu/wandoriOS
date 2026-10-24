import path from 'node:path';
import { runProcess, DEFAULT_ENV_ALLOWLIST } from '../runner.mjs';
import { conciseFailure, npmInvocation, writeStageLog } from './common.mjs';
import { cargarTaller, runEnVps } from './remoto-vps.mjs';

async function runCommand(context, name, executable, args, timeoutMs) {
  const execution = await runProcess(executable, args, {
    cwd: context.projectRoot,
    timeoutMs,
    envAllowlist: context.adapterEnvironmentAllowlist ?? DEFAULT_ENV_ALLOWLIST,
  });
  return { name, execution };
}

/* [por que] El frontend se valida en la VPS 89, igual que Rust (AGENTS §1): el portátil
 * no compila ni consume recursos del taller. Se reutiliza el taller remoto de
 * workspace-manager (sync Mutagen + ssh); en la propia 89 se ejecuta en local. */
async function runStep(context, name, script) {
  const timeoutMs = name === 'test-full' || name === 'build' ? context.qualityConfig.timeoutsMs.frontendTest : context.qualityConfig.timeoutsMs.frontend;
  const taller = await cargarTaller();
  if (taller.esVps()) {
    const npm = npmInvocation(['--prefix', 'frontend', 'run', script]);
    return runCommand(context, name, npm.executable, npm.args, timeoutMs);
  }
  return { name, execution: await runEnVps(context, taller, `npm --prefix frontend run ${script}`, timeoutMs) };
}

async function runBudget(context) {
  const timeoutMs = context.qualityConfig.timeoutsMs.frontendTest;
  const taller = await cargarTaller();
  if (taller.esVps()) {
    const budgetScript = path.join(context.projectRoot, 'scripts', 'quality', 'performance-budget.mjs');
    return runCommand(context, 'performance-budget', process.execPath, [budgetScript], timeoutMs);
  }
  return { name: 'performance-budget', execution: await runEnVps(context, taller, 'node scripts/quality/performance-budget.mjs', timeoutMs) };
}

export async function runFrontend(context) {
  const steps = [await runStep(context, 'type-check', 'type-check')];
  if (context.ci && steps[0].execution.code === 0) {
    steps.push(await runStep(context, 'test-full', 'test:full'));
    if (steps.at(-1).execution.code === 0) steps.push(await runStep(context, 'build', 'build'));
    if (steps.at(-1).execution.code === 0) steps.push(await runBudget(context));
  }
  const log = steps.map(step => `## ${step.name}\n${step.execution.stdout}\n${step.execution.stderr}`).join('\n');
  const logPath = await writeStageLog(context, 'frontend', log);
  const failed = steps.filter(step => step.execution.code !== 0 || step.execution.timedOut);
  return { stage: 'frontend', status: failed.some(step => step.execution.timedOut || step.execution.code === 2 || step.execution.signal) ? 'error' : failed.length > 0 ? 'fail' : 'pass', durationMs: steps.reduce((total, step) => total + step.execution.durationMs, 0), findings: failed.map(step => ({ ruleId: step.execution.timedOut ? 'quality-timeout' : `frontend-${step.name}`, severity: 'error', message: conciseFailure(`${step.execution.stdout}\n${step.execution.stderr}`, `${step.name} falló`) })), summary: failed.length > 0 ? `${failed.length} validaciones frontend fallaron` : context.ci ? 'type-check + suite + build + budgets pasaron' : 'type-check pasó', logPath };
}
