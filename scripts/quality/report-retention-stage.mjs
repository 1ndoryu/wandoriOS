import { pruneReportBranches } from './report-retention.mjs';

/* La retención es mantenimiento auxiliar: un fallo de filesystem no debe
 * convertir un gate válido en error ni ocultar el resultado de sus etapas. */
export async function runReportRetentionBestEffort({
  projectRoot,
  currentBranchKey,
  currentTaskId,
  config,
  prune = pruneReportBranches,
} = {}) {
  try {
    return await prune({ projectRoot, currentBranchKey, currentTaskId, config });
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
