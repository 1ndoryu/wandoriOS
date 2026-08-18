#!/usr/bin/env node

/* [018A-53] Convierte el presupuesto documentado del ADR de apps pesadas en
 * una comprobación reproducible. Solo se ejecuta después de un build CI; no
 * descarga dependencias ni modifica el árbol de fuentes. */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function evaluateBudgets(assets, budgets) {
  const entryJs = assets
    .filter(asset => /^index-.*\.js$/i.test(asset.name))
    .sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
  const entryCss = assets
    .filter(asset => /^index-.*\.css$/i.test(asset.name))
    .sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
  const largestChunk = assets
    .filter(asset => /\.js$/i.test(asset.name))
    .sort((a, b) => b.gzipBytes - a.gzipBytes)[0];
  const measurements = {
    entryJsGzipBytes: entryJs?.gzipBytes ?? null,
    entryCssGzipBytes: entryCss?.gzipBytes ?? null,
    largestChunkGzipBytes: largestChunk?.gzipBytes ?? null,
  };
  const violations = [];
  for (const [key, measured] of Object.entries(measurements)) {
    const limit = budgets[key];
    if (!Number.isInteger(limit) || measured === null) {
      violations.push(`${key}: asset requerido ausente o budget inválido`);
    } else if (measured > limit) {
      violations.push(`${key}: ${measured} B > ${limit} B`);
    }
  }
  return { measurements, violations };
}

async function readAssets() {
  const assetsDir = path.join(projectRoot, 'frontend', 'dist', 'assets');
  const names = await readdir(assetsDir);
  return Promise.all(names.filter(name => /\.(?:js|css)$/i.test(name)).map(async name => {
    const content = await readFile(path.join(assetsDir, name));
    return { name, bytes: content.length, gzipBytes: gzipSync(content).length };
  }));
}

async function main() {
  const config = JSON.parse(await readFile(path.join(projectRoot, 'quality.config.json'), 'utf8'));
  const result = evaluateBudgets(await readAssets(), config.performanceBudgets);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.violations.length > 0) {
    process.stderr.write(`[performance] ${result.violations.join('; ')}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
