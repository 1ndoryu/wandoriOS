export async function runBoundedStages(definitions, runStage, options = {}) {
  const concurrency = Math.max(1, Math.min(options.maxConcurrency ?? 1, definitions.length || 1));
  const results = new Array(definitions.length);
  const errors = [];
  let cursor = 0;
  let stopScheduling = false;

  async function worker() {
    while (true) {
      if (stopScheduling || options.isCancelled?.()) {
        if (options.isCancelled?.()) errors.push(new Error('quality gate cancelado durante las etapas'));
        return;
      }
      const index = cursor;
      cursor += 1;
      if (index >= definitions.length) return;
      try {
        results[index] = await runStage(definitions[index]);
      } catch (error) {
        stopScheduling = true;
        errors.push(error);
        return;
      }
    }
  }

  /* Espera a todos los workers antes de propagar cancelación/error: así las
   * etapas ya iniciadas pueden liberar procesos, locks y temporales, y ningún
   * worker asigna trabajo nuevo después del primer fallo. */
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  if (errors.length > 0) throw errors[0];
  return results;
}
