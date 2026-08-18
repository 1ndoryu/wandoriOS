/* [028A-6] Los perfiles de quality.config.json sirven para dos propósitos:
 * algunos seleccionan etapas ejecutables y otros solo clasifican cambios para
 * la autodetección. El selector explícito acepta únicamente los primeros para
 * no presentar una ejecución de Sentinel como cobertura de otra etapa. */
export const PROFILE_STAGE_RULES = Object.freeze({
  css: Object.freeze(['varsense']),
  frontend: Object.freeze(['varsense', 'frontend']),
  rust: Object.freeze(['rust']),
  docs: Object.freeze(['docs']),
});

export const EXECUTABLE_PROFILES = new Set(Object.keys(PROFILE_STAGE_RULES));

export function isFullExecution(scope) {
  return (scope.executionFull ?? scope.full) && !scope.profileOverride;
}

export function validateExecutableProfiles(profiles) {
  const unsupported = profiles.filter(profile => !EXECUTABLE_PROFILES.has(profile));
  if (unsupported.length > 0) {
    throw new Error(
      `Perfil sin etapa ejecutable: ${unsupported.join(', ')}. `
      + `Usa uno de: ${[...EXECUTABLE_PROFILES].join(', ')}`,
    );
  }
}
