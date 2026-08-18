const PROFILE_REMINDERS = {
  css: 'UI: revisa navegador y viewports; reutiliza tokens y componentes.',
  frontend: 'Async/UI: confirma teardown, estados vacíos y feedback visible.',
  auth: 'Auth: prueba visitante/usuario; ocultar UI no autoriza endpoints.',
  commerce: 'Comercio: precio, webhook y acceso a archivos son server-side.',
  workspace: 'Workspace: prueba release, overlay, papelera y conflictos 409.',
  mobile: 'Móvil: sin ventanas/barras; tablet conserva escritorio.',
  docs: 'Docs: actualiza checklist, dependencias y enlaces canónicos.',
  rust: 'Rust: evita unwrap externo y confirma errores/logs accionables.',
};

export function selectReminders(scope, stages, limit = 4, context = {}) {
  const reminders = [];
  const failed = stages.some(stage => stage.status === 'fail' || stage.status === 'error');
  const rustLight = stages.some(stage => stage.stage === 'rust' && stage.validationMode === 'local-light');
  if (failed) reminders.push('Corrige los primeros hallazgos y repite exactamente el mismo comando.');
  if (context.heavyDeferred) reminders.push('Full bloqueado por cooldown de 3 horas; conserva el modo local-light y usa --allow-heavy --heavy-reason "<motivo>" solo con una necesidad manual justificada (el intento queda en .quality-reports/heavy-overrides.log).');
  if (rustLight) reminders.push('Rust local-light: se ejecutaron fmt/check; ejecuta `npm run task:check -- <ID> --full` antes de cerrar una fase o publicar.');
  if (!failed) {
    /* El cierre es siempre visible aunque el alcance tenga varios perfiles y
     * maxReminders sea pequeño; evita que el agente olvide revisar el estado. */
    reminders.push('Cierre: revisa git status; si el bloque es entregable, staging explícito + commit/push. Si es intermedio o compartido, documenta y no fuerces commit.');
  }
  for (const profile of scope.profiles) {
    if (PROFILE_REMINDERS[profile] && !reminders.includes(PROFILE_REMINDERS[profile])) {
      reminders.push(PROFILE_REMINDERS[profile]);
    }
  }
  return reminders.slice(0, limit);
}
