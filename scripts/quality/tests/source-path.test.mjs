import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import {
  resolveConfiguredSourcePath,
  validateSourcePathEnv,
  validateSourcePath,
} from '../source-path.mjs';

test('resuelve sourcePathEnv desde una variable GLORY_*', () => {
  const previous = process.env.GLORY_TEST_SOURCE_PATH;
  process.env.GLORY_TEST_SOURCE_PATH = path.resolve('external-tool');
  try {
    assert.equal(
      resolveConfiguredSourcePath({ sourcePathEnv: 'GLORY_TEST_SOURCE_PATH' }, 'tool'),
      path.resolve('external-tool'),
    );
  } finally {
    if (previous === undefined) delete process.env.GLORY_TEST_SOURCE_PATH;
    else process.env.GLORY_TEST_SOURCE_PATH = previous;
  }
});

test('rechaza variables no allowlisted y rutas ausentes', () => {
  assert.throws(() => validateSourcePathEnv('PATH', 'tool.sourcePathEnv'), /GLORY_\* válido/);
  assert.throws(() => resolveConfiguredSourcePath({ sourcePathEnv: 'GLORY_MISSING_SOURCE_PATH' }, 'tool'), /variable no configurada/);
  assert.throws(() => validateSourcePath('../external', 'tool.sourcePath'), /ruta absoluta válida/);
});

test('rechaza declarar sourcePath y sourcePathEnv al mismo tiempo', () => {
  assert.throws(
    () => resolveConfiguredSourcePath({ sourcePath: path.resolve('external-tool'), sourcePathEnv: 'GLORY_TEST_SOURCE_PATH' }, 'tool'),
    /mutuamente excluyentes/,
  );
});

test('resuelve sourcePath relativo contra baseDir (submódulo interno)', () => {
  const root = path.resolve('workspace-raiz');
  assert.equal(
    resolveConfiguredSourcePath({ sourcePath: 'tools/varsense' }, 'tool', { baseDir: root }),
    path.resolve(root, 'tools', 'varsense'),
  );
});

test('rechaza sourcePath relativo sin baseDir', () => {
  assert.throws(
    () => resolveConfiguredSourcePath({ sourcePath: 'tools/varsense' }, 'tool'),
    /requiere baseDir/,
  );
});
