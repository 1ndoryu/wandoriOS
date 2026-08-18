import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const TEST_PATTERN = /\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/i;

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.includes(path.extname(file).toLowerCase());
}

async function walk(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile() && isSourceFile(entry.name)) files.push(absolute);
  }
  return files;
}

/** Extrae imports relativos; los aliases quedan cubiertos por type-check/full. */
export function parseRelativeImports(source) {
  const imports = new Set();
  const patterns = [
    /\bfrom\s*['"](\.[^'"]+)['"]/g,
    /\bimport\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g,
    /\bimport\s*['"](\.[^'"]+)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.add(match[1]);
  }
  return [...imports];
}

function moduleCandidates(base) {
  return [
    base,
    ...SOURCE_EXTENSIONS.map(extension => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map(extension => path.join(base, `index${extension}`)),
  ];
}

function resolveImport(importer, specifier, knownFiles) {
  const base = path.resolve(path.dirname(importer), specifier);
  return moduleCandidates(base).find(candidate => knownFiles.has(candidate)) ?? null;
}

/** Construye una sola vez el grafo local de imports del frontend. */
export async function buildFrontendDependencyGraph(frontendRoot) {
  const files = await walk(frontendRoot);
  const knownFiles = new Set(files.map(file => path.resolve(file)));
  const graph = new Map();
  await Promise.all(files.map(async file => {
    const source = await readFile(file, 'utf8');
    const dependencies = new Set();
    for (const specifier of parseRelativeImports(source)) {
      const resolved = resolveImport(file, specifier, knownFiles);
      if (resolved) dependencies.add(resolved);
    }
    graph.set(path.resolve(file), dependencies);
  }));
  return graph;
}

function dependsOn(graph, entry, target, seen = new Set()) {
  if (entry === target) return true;
  if (seen.has(entry)) return false;
  seen.add(entry);
  for (const dependency of graph.get(entry) ?? []) {
    if (dependsOn(graph, dependency, target, seen)) return true;
  }
  return false;
}

/** Selecciona tests que dependen de cualquier archivo cambiado. */
export function selectImpactedTests({ frontendRoot, changedFiles, testFiles, graph }) {
  const root = path.resolve(frontendRoot);
  const changed = changedFiles
    .map(file => path.resolve(root, file))
    .filter(file => graph.has(file));
  const selected = testFiles.filter(testFile => {
    const testAbsolute = path.resolve(root, testFile);
    if (changedFiles.includes(testFile)) return true;
    return changed.some(target => dependsOn(graph, testAbsolute, target));
  });
  return selected.sort((left, right) => left.localeCompare(right));
}

export function isFrontendTestFile(file) {
  return TEST_PATTERN.test(file);
}
