import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
  parseRelativeImports,
  selectImpactedTests,
} from '../frontend-test-selection.mjs';

test('parseRelativeImports detecta imports estáticos, dinámicos y reexports', () => {
  const imports = parseRelativeImports(`
    import value from './value';
    export { helper } from '../shared/helper.ts';
    const lazy = import('./lazy');
  `);
  assert.deepEqual(imports.sort(), ['../shared/helper.ts', './lazy', './value']);
});

test('selectImpactedTests incluye solo tests que dependen del cambio', () => {
  const frontendRoot = path.resolve('C:/quality/frontend');
  const source = path.join(frontendRoot, 'src/source.ts');
  const related = path.join(frontendRoot, 'src/related.test.ts');
  const unrelated = path.join(frontendRoot, 'src/unrelated.test.ts');
  const graph = new Map([
    [source, new Set()],
    [related, new Set([source])],
    [unrelated, new Set()],
  ]);

  assert.deepEqual(selectImpactedTests({
    frontendRoot,
    changedFiles: ['src/source.ts'],
    testFiles: ['src/unrelated.test.ts', 'src/related.test.ts'],
    graph,
  }), ['src/related.test.ts']);
});

test('un test cambiado se conserva aunque no tenga imports resolubles', () => {
  const frontendRoot = path.resolve('C:/quality/frontend');
  const changedTest = path.join(frontendRoot, 'src/new.test.ts');
  const graph = new Map([[changedTest, new Set()]]);
  assert.deepEqual(selectImpactedTests({
    frontendRoot,
    changedFiles: ['src/new.test.ts'],
    testFiles: ['src/new.test.ts'],
    graph,
  }), ['src/new.test.ts']);
});
