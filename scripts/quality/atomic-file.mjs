import { randomUUID } from 'node:crypto';
import { readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STALE_TEMP_MS = 600_000;
const RETRYABLE_REPLACE_ERRORS = new Set(['EPERM', 'EEXIST', 'EBUSY']);

export async function cleanupStaleAtomicTemps(target) {
  const directory = path.dirname(target);
  const prefix = `${path.basename(target)}.tmp.`;
  let entries;
  try {
    entries = await readdir(directory);
  } catch {
    return;
  }

  await Promise.all(entries.filter(entry => entry.startsWith(prefix)).map(async entry => {
    const candidate = path.join(directory, entry);
    try {
      const metadata = await stat(candidate);
      if (Date.now() - metadata.mtimeMs > STALE_TEMP_MS) await unlink(candidate);
    } catch {
      /* Otro proceso puede haberlo retirado; no interrumpir el reporte. */
    }
  }));
}

export async function writeAtomic(target, content) {
  await cleanupStaleAtomicTemps(target);
  const temporary = `${target}.tmp.${process.pid}.${randomUUID()}`;
  await writeFile(temporary, content, 'utf8');
  /* Windows no permite reemplazar un archivo abierto con rename(). Dos
   * agentes pueden cerrar la etapa a la vez, así que reintentamos de forma
   * acotada y retiramos solo el target exacto antes de cada intento. */
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await rename(temporary, target);
      return;
    } catch (error) {
      if (!RETRYABLE_REPLACE_ERRORS.has(error?.code) || attempt === 5) {
        try { await unlink(temporary); } catch { /* limpieza best-effort */ }
        throw error;
      }
      try { await unlink(target); } catch (unlinkError) {
        if (unlinkError?.code === 'ENOENT') continue;
        if (!RETRYABLE_REPLACE_ERRORS.has(unlinkError?.code) || attempt === 5) {
          throw unlinkError;
        }
        /* Otro escritor aún conserva el handle del target en Windows. El
         * siguiente intento vuelve a intentar el reemplazo sin borrar ningún
         * path distinto al target exacto. */
        await new Promise(resolve => setTimeout(resolve, 5 * (attempt + 1)));
        continue;
      }
      await new Promise(resolve => setTimeout(resolve, 5 * (attempt + 1)));
    }
  }
}
