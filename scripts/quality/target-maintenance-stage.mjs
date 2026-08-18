import { cleanupTargets, shouldRunMaintenance, markMaintenanceRun, DEFAULT_MAINTENANCE_BUDGET_MS } from './target-maintenance.mjs';

/* [028A-6] La supervisión de targets es mantenimiento auxiliar, igual que la
 * retención de reportes: un fallo de filesystem o un pase truncado nunca
 * debe convertir un gate válido en error ni ocultar sus etapas. El gate
 * ejecuta el pase de cuota en cada gate y con presupuesto de tiempo; no se
 * usa throttle para la cuota porque permitiría que los agentes acumulen GB
 * entre ejecuciones. La retención por edad puede seguir usando un pase manual.
 * `npm run quality:cleanup` fuerza el pase completo. */
export async function runTargetMaintenanceBestEffort({
  projectRoot,
  targetRoot,
  now = Date.now(),
  intervalMs,
  /* La cuota se comprueba siempre; solo la retención por edad puede quedar
   * bajo throttle. Este flag existe para fixtures/consumidores explícitos,
   * nunca para el gate público. */
  enforceQuota = true,
  /* [028A-6] El budget tiene default AQUÍ: sin él, el primer pase del gate
   * caminaría los GB de targets sin límite y colgaría el gate. */
  budgetMs = DEFAULT_MAINTENANCE_BUDGET_MS,
  cleanup = cleanupTargets,
  shouldRun = shouldRunMaintenance,
  mark = markMaintenanceRun,
} = {}) {
  try {
    const due = enforceQuota || await shouldRun({ targetRoot, now, intervalMs });
    if (!due) {
      return { status: 'pass', skipped: 'cooldown', targetRoot };
    }
    const result = await cleanup({ projectRoot, targetRoot, now, dryRun: false, budgetMs });
    await mark(targetRoot, now);
    return { status: result.quotaExceeded || result.failed?.length ? 'error' : 'pass', ...result,
      ...(result.quotaExceeded ? { message: 'La cuota de targets sigue excedida; hay recursos activos o no eliminables.' } : {}),
      ...(result.failed?.length ? { message: 'No se pudieron eliminar todos los targets elegibles; revisa failed.' } : {}) };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
