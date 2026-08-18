import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './atomic-file.mjs';

const CACHE_FORMAT_VERSION = 5;

async function hashFile(hash, root, relativePath) {
  try {
    hash.update(relativePath);
    hash.update(await readFile(path.join(root, relativePath)));
  } catch { hash.update(`[missing:${relativePath}]`); }
}

export async function fingerprint(context, scope, stage) {
  const hash = createHash('sha256');
  /* [018A-4] Un PASS no puede cruzar cambios de runtime, plataforma o formato
   * del runner aunque el conjunto de archivos permanezca igual. */
  hash.update(`quality-cache-v${CACHE_FORMAT_VERSION}\0`);
  hash.update(`${process.version}\0${process.platform}\0${process.arch}\0`);
  /* [028A-8] CI/full ejecutan validaciones ampliadas y local-light no; un PASS
   * de un modo nunca puede reutilizarse para afirmar cobertura del otro. El
   * modo usa el alcance efectivo (ya resuelto por el guard): un automaticFull
   * permitido queda como full aunque context.full siga false, y un full
   * diferido queda como local-light aunque requestedFull sea cierto. */
  const effectiveFull = scope.effectiveFull ?? scope.executionFull ?? scope.full ?? context.full;
  hash.update(`mode:${context.ci ? 'ci' : effectiveFull ? 'full' : 'local-light'}\0`);
  hash.update(stage);
  hash.update(JSON.stringify(context.qualityConfig));
  hash.update(JSON.stringify(context.toolManifest));
  hash.update(`policy:${context.policy?.policyHash ?? context.policyIdentity?.policyHash ?? 'unresolved'}\0`);
  hash.update(`lock:${JSON.stringify(context.lock ?? 'unresolved')}\0`);
  for (const file of scope.fingerprintFiles ?? scope.files) {
    await hashFile(hash, context.projectRoot, file);
  }
  return hash.digest('hex');
}

function cachePath(context, stage) {
  return path.join(context.cacheRoot ?? path.join(context.projectRoot, '.quality-reports', 'cache'), `${stage}.json`);
}

export async function readCachedPass(context, stage, expectedFingerprint) {
  const probe = await probeCachedPass(context, stage, expectedFingerprint);
  if (probe.hit) return { ...probe.result, cached: true };
  return null;
}

/* [028A-8 Fase 4] Razón exacta por la que la caché de una etapa NO reutiliza:
 * no hay entrada, el fingerprint cambió (contenido/config/modo/herramienta) o
 * el resultado guardado no era PASS. El reporte la muestra para distinguir un
 * cache frío de una invalidación real y auditar qué la provocó. */
export async function probeCachedPass(context, stage, expectedFingerprint) {
  try {
    const cached = JSON.parse(await readFile(cachePath(context, stage), 'utf8'));
    if (cached.fingerprint !== expectedFingerprint) return { hit: false, reason: 'fingerprint-mismatch' };
    if (cached.result?.status !== 'pass') return { hit: false, reason: 'not-pass' };
    return { hit: true, reason: 'match', result: cached.result };
  } catch { return { hit: false, reason: 'no-entry' }; }
}

export async function writeCachedPass(context, stage, stageFingerprint, result) {
  if (result.status !== 'pass') return;
  const target = cachePath(context, stage);
  await mkdir(path.dirname(target), { recursive: true });
  await writeAtomic(target, `${JSON.stringify({ fingerprint: stageFingerprint, result }, null, 2)}\n`);
}
