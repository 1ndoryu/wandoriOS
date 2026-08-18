/* [028A-8 Fase 0] Fixtures sintéticos del benchmark: conjuntos de cambio
 * deterministas (pequeño y mediano) definidos como scope-manifests que
 * referencian archivos reales del workspace. `bench-baseline.mjs` los
 * inyecta al gate con --scope-manifest (loadInjectedScope), sin mutar el
 * árbol compartido: el "borrado" y el "rename" se simulan con deletedFiles,
 * que el pipeline trata igual que un git delete (excluido de --files-from,
 * presente en el fingerprint). El fixture representativo es el alcance git
 * real (bench-baseline sin --scope-manifest). No es parte del gate: es
 * diagnóstico reproducible.
 *
 * Divergencia documentada con detectScope real: incluir vite.config.ts
 * (fullPatterns) marcaría automaticFull por git; aquí se inyecta local-light
 * a propósito para medir el coste del cambio de config en modo ligero. */
import { access } from 'node:fs/promises';
import path from 'node:path';

export const FIXTURES = Object.freeze({
  small: Object.freeze({
    id: 'small',
    label: 'pequeño: 2 archivos reales (TS + CSS) bajo frontend/src — cambio local-light mínimo',
    changeTypes: ['ts', 'css'],
    profiles: ['frontend', 'css'],
    files: [
      'frontend/src/features/runtime/workspace/public-resource-locator.ts',
      'frontend/src/styles/layout.css',
    ],
    deletedFiles: [],
  }),
  medium: Object.freeze({
    id: 'medium',
    label: 'mediano: 12 archivos reales (8 TS + 3 CSS + vite.config.ts) con borrado (reset.css) y rename (app-registration-game-3d.ts → app-registration-game-playable.ts) simulados',
    changeTypes: ['ts', 'css', 'config', 'delete', 'rename'],
    profiles: ['frontend', 'css'],
    files: [
      'frontend/src/features/runtime/app-registration.ts',
      'frontend/src/features/runtime/app-registration-admin.ts',
      'frontend/src/features/runtime/app-registration-game-playable.ts',
      'frontend/src/features/runtime/app-registration-game-routes.ts',
      'frontend/src/features/runtime/workspace/public-resource-locator.ts',
      'frontend/src/features/desktop/workspace-icon-grid.ts',
      'frontend/src/features/desktop/apps/finder/finder-preview.ts',
      'frontend/src/features/mobile/mobile-launcher.ts',
      'frontend/src/styles/variables.css',
      'frontend/src/styles/base.css',
      'frontend/src/styles/components.css',
      'frontend/vite.config.ts',
    ],
    deletedFiles: [
      'frontend/src/styles/reset.css',
      'frontend/src/features/runtime/app-registration-game-3d.ts',
    ],
  }),
});

/* [028A-8] Manifest de alcance determinista para inyectar al gate. generatedAt
 * se parametriza para que los tests comparen documentos sin ruido temporal. */
export function fixtureManifest(id, generatedAt = new Date().toISOString()) {
  const fixture = FIXTURES[id];
  if (!fixture) throw new Error(`Fixture desconocido: ${id} (small|medium)`);
  return {
    schemaVersion: 1,
    generatedAt,
    base: 'HEAD',
    requestedFull: false,
    automaticFull: false,
    effectiveFull: false,
    fullReason: 'incremental',
    heavyDeferred: null,
    profileOverride: false,
    profiles: [...fixture.profiles],
    files: [...fixture.files],
    deletedFiles: [...fixture.deletedFiles],
  };
}

/* [028A-8] Los archivos del fixture deben existir y ser relativos al workspace:
 * un archivo ausente rompería --files-from (ENOENT) y falsearía la medición.
 * Devuelve la lista de rutas que faltan (vacía si el fixture es válido). */
export async function validateFixtureFiles(fixture, projectRoot) {
  const missing = [];
  for (const relative of fixture.files) {
    try {
      await access(path.join(projectRoot, relative));
    } catch { missing.push(relative); }
  }
  return missing;
}
