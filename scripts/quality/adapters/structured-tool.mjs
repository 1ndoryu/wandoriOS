import { runProcess } from '../runner.mjs';
import { readToolReport, toolFailure, writeStageLog } from './common.mjs';

export async function runStructuredTool(context, definition) {
  const execution = await runProcess(definition.executable, definition.args, {
    cwd: definition.cwd ?? context.projectRoot,
    timeoutMs: definition.timeoutMs,
    isCancelled: definition.isCancelled ?? context.isCancelled,
    envAllowlist: context.adapterEnvironmentAllowlist,
  });
  const logPath = await writeStageLog(context, definition.name, `${execution.stdout}\n${execution.stderr}`);
  if (execution.timedOut) return { failure: toolFailure(definition.name, execution, logPath, 'timeout'), logPath, execution };
  if (execution.cancelled) return { failure: toolFailure(definition.name, execution, logPath, 'cancelled'), logPath, execution };
  if (execution.code === 2) return { failure: toolFailure(definition.name, execution, logPath, 'tool-error'), logPath, execution };
  try {
    const report = await readToolReport(definition.reportPath);
    if (String(report.schemaVersion) !== String(definition.expectedSchemaVersion)) throw new Error(`schema ${report.schemaVersion} incompatible (esperado ${definition.expectedSchemaVersion})`);
    return { report, logPath, execution };
  } catch (error) {
    return { failure: toolFailure(definition.name, { ...execution, code: 2, stderr: error.message }, logPath, 'invalid-output'), logPath, execution };
  }
}
