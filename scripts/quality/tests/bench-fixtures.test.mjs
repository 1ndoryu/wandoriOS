import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FIXTURES, fixtureManifest, validateFixtureFiles } from '../bench-fixtures.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('fixtures: archivos reales y relativos al workspace (028A-8 Fase 0)', async () => {
  for (const fixture of Object.values(FIXTURES)) {
    assert.equal(fixture.files.length > 0, true, `${fixture.id}: sin archivos`);
    for (const relative of fixture.files) {
      assert.equal(path.isAbsolute(relative), false, `${fixture.id}: ruta absoluta ${relative}`);
      assert.equal(relative.split('/').includes('..'), false, `${fixture.id}: traversal ${relative}`);
    }
    const missing = await validateFixtureFiles(fixture, projectRoot);
    assert.deepEqual(missing, [], `${fixture.id}: archivos ausentes del workspace`);
  }
});

test('fixtures: cubren los tipos de cambio exigidos por la Fase 0', () => {
  assert.deepEqual(FIXTURES.small.changeTypes, ['ts', 'css']);
  assert.deepEqual(
    new Set(FIXTURES.medium.changeTypes),
    new Set(['ts', 'css', 'config', 'delete', 'rename']),
  );
  assert.deepEqual(FIXTURES.small.deletedFiles, []);
  assert.ok(FIXTURES.medium.deletedFiles.length >= 2, 'mediano debe simular borrado y rename');
  assert.ok(FIXTURES.medium.files.length > FIXTURES.small.files.length, 'mediano > pequeño');
  /* Los borrados simulados NO pueden estar en files (forma del fixture: solo
   * deletedFiles), igual que un git delete no coexiste en ambos listados. */
  for (const fixture of Object.values(FIXTURES)) {
    for (const deleted of fixture.deletedFiles) {
      assert.equal(fixture.files.includes(deleted), false, `${fixture.id}: ${deleted} en files y deletedFiles`);
    }
  }
});

test('fixtures: perfiles local-light coherentes con los archivos', () => {
  for (const fixture of Object.values(FIXTURES)) {
    const hasCss = fixture.files.some(file => /\.css$/.test(file));
    const hasFrontend = fixture.files.some(file => file.startsWith('frontend/'));
    assert.equal(fixture.profiles.includes('css'), hasCss, `${fixture.id}: perfil css`);
    assert.equal(fixture.profiles.includes('frontend'), hasFrontend, `${fixture.id}: perfil frontend`);
  }
});

test('fixtureManifest genera un manifiesto determinista y local-light', () => {
  const first = fixtureManifest('small', '2026-08-05T00:00:00.000Z');
  const second = fixtureManifest('small', '2026-08-05T00:00:00.000Z');
  assert.deepEqual(first, second);
  assert.equal(first.effectiveFull, false);
  assert.equal(first.requestedFull, false);
  assert.equal(first.automaticFull, false);
  assert.equal(first.fullReason, 'incremental');
  assert.equal(first.schemaVersion, 1);
  assert.deepEqual(first.files, FIXTURES.small.files);
  assert.deepEqual(first.deletedFiles, FIXTURES.small.deletedFiles);
  assert.deepEqual(first.profiles, FIXTURES.small.profiles);
  assert.throws(() => fixtureManifest('inexistente'), /Fixture desconocido/);
});
