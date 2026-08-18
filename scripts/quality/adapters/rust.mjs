import path from 'node:path';
import { runProcess, DEFAULT_ENV_ALLOWLIST } from '../runner.mjs';
import { conciseFailure, npmInvocation, writeStageLog } from './common.mjs';

async function runStep(context, name, executable, args) {
  const execution = await runProcess(executable, args, { cwd: context.projectRoot, timeoutMs: context.qualityConfig.timeoutsMs.rust, envAllowlist: context.adapterEnvironmentAllowlist ?? DEFAULT_ENV_ALLOWLIST });
  return { name, execution };
}
export function shouldRunExtendedChecks(context, scope = {}) { return Boolean(context.ci || (scope.effectiveFull ?? scope.executionFull ?? context.full)); }
export async function runRust(context, scope = {}) {
  const startedAt = Date.now(); const steps = []; const runExtendedChecks = shouldRunExtendedChecks(context, scope);
  const npm = npmInvocation(['run', 'fmt:check']); steps.push(await runStep(context, 'cargo fmt --check', npm.executable, npm.args));
  const runWithDb = path.join(context.projectRoot, 'scripts', 'run-with-db.mjs'); const check = await runStep(context, 'cargo check', process.execPath, [runWithDb, 'check']); steps.push(check);
  if (runExtendedChecks && check.execution.code === 0) { steps.push(await runStep(context, 'cargo clippy', process.execPath, [runWithDb, 'clippy', '--', '-D', 'warnings'])); steps.push(await runStep(context, 'cargo test', process.execPath, [runWithDb, 'test'])); }
  const logPath = await writeStageLog(context, 'rust', steps.map(step => `## ${step.name}\n${step.execution.stdout}\n${step.execution.stderr}`).join('\n'));
  const failed = steps.filter(step => step.execution.code !== 0 || step.execution.timedOut); const infrastructure = failed.some(step => step.execution.code === 2 || step.execution.timedOut || step.execution.signal);
  return { stage: 'rust', status: infrastructure ? 'error' : failed.length > 0 ? 'fail' : 'pass', durationMs: Date.now() - startedAt, validationMode: runExtendedChecks ? 'full' : 'local-light', findings: failed.map(step => ({ ruleId: step.execution.timedOut ? 'quality-timeout' : `rust-${step.name.split(' ')[1] ?? 'command'}`, severity: 'error', message: conciseFailure(`${step.execution.stdout}\n${step.execution.stderr}`, `${step.name} falló`) })), summary: failed.length > 0 ? `${failed.length} comandos fallaron` : runExtendedChecks ? `${steps.length} comandos pasaron` : `${steps.length} comandos pasaron (clippy/tests reservados para --full)`, logPath };
}
