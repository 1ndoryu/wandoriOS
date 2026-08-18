import path from 'node:path';

export function buildVarsenseInvocation(context, scope = {}) {
  const reportPath = path.join(context.reportRoot, 'varsense-all.json');
  const args = [
    context.tools.varsense.cliPath,
    'all',
    '--workspace', context.projectRoot,
    '--config', path.join(context.projectRoot, 'varsense.config.json'),
    '--format', 'json',
    '--output', reportPath,
  ];
  const executionFull = scope.executionFull ?? scope.full ?? true;
  const requestedScopedAnalysis = !executionFull;
  const version = context.tools.varsense.version ?? 'unknown';
  const manifestPath = scope.changedFilesPath ?? null;
  const supportsFilesFrom = context.tools.varsense.capabilities?.filesFrom === true;
  const canApplyScopedAnalysis = requestedScopedAnalysis && supportsFilesFrom && typeof manifestPath === 'string' && manifestPath.length > 0;
  if (canApplyScopedAnalysis) args.push('--files-from', manifestPath);
  /* [028A-8] Índice persistente entre ejecuciones: solo se activa cuando el
   * checkout fijado declara la capacidad `persistentIndex` (branch upstream
   * 028A-8/persistent-index). El directorio vive en el cache por rama del
   * gate, por lo que la identidad (toolVersion+config+parser) y las rutas
   * absolutas del snapshot nunca se reutilizan entre ramas ni checkouts. */
  const supportsPersistentIndex = context.tools.varsense.capabilities?.persistentIndex === true;
  /* El cache por rama es el hogar canónico; un contexto sin cacheRoot cae al
   * reportRoot como defensa (nunca a una ruta fuera del workspace). */
  const cacheRoot = context.cacheRoot ?? context.reportRoot;
  const indexDir = supportsPersistentIndex ? path.join(cacheRoot, 'varsense') : null;
  if (indexDir) args.push('--index-dir', indexDir);
  return {
    args,
    reportPath,
    scope: {
      requestedScopedAnalysis,
      applied: !requestedScopedAnalysis || canApplyScopedAnalysis,
      manifestPath,
      persistentIndex: supportsPersistentIndex ? { enabled: true, indexDir } : null,
      limitation: requestedScopedAnalysis && !canApplyScopedAnalysis
        ? (supportsFilesFrom ? `varsense-cli-${version}-missing-manifest` : `varsense-cli-${version}-no-files-from`)
        : null,
    },
  };
}

export const VARSENSE_SCOPE_LIMITATION_CODE = version => `varsense-cli-${version}-no-files-from`;
export const VARSENSE_SCOPE_MISSING_MANIFEST_CODE = version => `varsense-cli-${version}-missing-manifest`;
