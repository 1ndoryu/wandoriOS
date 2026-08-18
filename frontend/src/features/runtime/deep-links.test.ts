import { describe, expect, it } from 'vitest';
import { createPathDeepLink, getCanonicalAppPath, parseAppParams, stableParamsKey } from './deep-links';
import type { AppDefinition } from './app-registry';

const readerLink = createPathDeepLink('/article/:slug', ['slug']);
const readerApp = {
  id: 'reader-test',
  title: 'Reader',
  icon: [],
  singleton: false,
  requires: 'public',
  deepLink: readerLink,
  render: () => ({ element: document.createElement('div') }),
} satisfies AppDefinition;

describe('canonical deep links', () => {
  it('genera la ruta canónica y codifica el segmento público', () => {
    expect(readerLink.stringify({ slug: 'mi artículo' })).toBe('/article/mi%20art%C3%ADculo');
    expect(getCanonicalAppPath(readerApp, { slug: 'julio' })).toBe('/article/julio');
  });

  it('solo acepta parámetros declarados por la app', () => {
    expect(parseAppParams(readerApp, { slug: 'julio' })).toEqual({ slug: 'julio' });
    expect(parseAppParams(readerApp, { slug: 'julio', resourceId: 'internal-1' })).toBeNull();
    expect(readerLink.stringify({ slug: 'julio', token: 'secret' })).toBeNull();
  });

  it('rechaza segmentos que podrían escapar de la ruta o contener control', () => {
    expect(readerLink.stringify({ slug: '../privado' })).toBeNull();
    expect(readerLink.stringify({ slug: 'a/b' })).toBeNull();
    expect(readerLink.stringify({ slug: '.' })).toBeNull();
    expect(readerLink.stringify({ slug: '..' })).toBeNull();
    expect(readerLink.stringify({ slug: 'line\nfeed' })).toBeNull();
    expect(readerLink.parse({ slug: 'a/b' })).toBeNull();
  });

  /* [058A-2] Los publicLocator del workspace pueden llegar con params null en
   * runtime (datos incompletos). Antes isSafeSegment(null) crasheaba con
   * TypeError desde el Finder; debe fallar la validación (fail-closed), no
   * lanzar. */
  it('rechaza valores null sin crashear (regresión del Finder)', () => {
    expect(readerLink.parse({ slug: null } as unknown as Record<string, string>)).toBeNull();
    expect(readerLink.stringify({ slug: null } as unknown as Record<string, string>)).toBeNull();
  });

  it('rechaza parámetros en apps legacy sin contrato deepLink', () => {
    const legacyApp = { ...readerApp, deepLink: undefined } as AppDefinition;
    expect(parseAppParams(legacyApp, {})).toEqual({});
    expect(parseAppParams(legacyApp, { resourceId: 'internal-1' })).toBeNull();
  });

  it('construye una clave estable aunque cambie el orden de propiedades', () => {
    expect(stableParamsKey({ slug: 'julio', version: '1' }))
      .toBe(stableParamsKey({ version: '1', slug: 'julio' }));
    expect(stableParamsKey({ slug: 'julio' })).not.toBe(stableParamsKey({ slug: 'agosto' }));
  });
});
