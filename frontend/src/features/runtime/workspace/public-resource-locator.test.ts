import { describe, expect, it } from 'vitest';
import '../app-registration';
import { resolvePublicResourceTarget, canOpenNodeFromShell } from './public-resource-locator';

const baseNode = {
  id: 'article-node',
  parentId: 'desktop' as const,
  type: 'resource' as const,
  label: 'Artículo',
  refId: 'internal-resource-uuid',
  resourceKind: 'article' as const,
  origin: 'release' as const,
  publicLocator: undefined,
};

describe('public resource locator', () => {
  it('resuelve el slug público sin usar refId', () => {
    expect(resolvePublicResourceTarget({
      ...baseNode,
      publicLocator: { appId: 'reader', params: { slug: 'julio-2026' } },
    })).toEqual({
      appId: 'reader',
      params: { slug: 'julio-2026' },
    });
  });

  it('rechaza un locator con parámetros no allowlisted', () => {
    expect(resolvePublicResourceTarget({
      ...baseNode,
      publicLocator: { appId: 'reader', params: { resourceId: baseNode.refId } },
    })).toBeNull();
  });

  it('no convierte un recurso sin locator en una URL pública', () => {
    expect(resolvePublicResourceTarget(baseNode)).toBeNull();
  });

  it('rechaza una app inexistente o no pública', () => {
    expect(resolvePublicResourceTarget({
      ...baseNode,
      publicLocator: { appId: 'missing-app', params: { slug: 'julio-2026' } },
    })).toBeNull();
  });

  it('falla cerrado ante nodos no públicos o de tipo incorrecto', () => {
    expect(resolvePublicResourceTarget({
      ...baseNode,
      type: 'folder',
      publicLocator: { appId: 'reader', params: { slug: 'julio-2026' } },
    })).toBeNull();
    expect(resolvePublicResourceTarget({
      ...baseNode,
      requires: 'admin',
      publicLocator: { appId: 'reader', params: { slug: 'julio-2026' } },
    })).toBeNull();
  });
});

/* [058A-3] Filtro de visibilidad del shell: los nodos sin apertura posible
 * (locator roto, sin URL) no deben aparecer en Finder/escritorio/launcher. */
describe('canOpenNodeFromShell', () => {
  it('siempre permite carpetas y apps con refId', () => {
    expect(canOpenNodeFromShell({ type: 'folder' })).toBe(true);
    expect(canOpenNodeFromShell({ type: 'app', refId: 'reader' })).toBe(true);
    expect(canOpenNodeFromShell({ type: 'app' })).toBe(false);
  });

  it('permite un recurso con locator público válido', () => {
    expect(canOpenNodeFromShell({
      ...baseNode,
      publicLocator: { appId: 'reader', params: { slug: 'julio-2026' } },
    })).toBe(true);
  });

  it('oculta recursos sin locator o con locator roto (slug nulo)', () => {
    expect(canOpenNodeFromShell(baseNode)).toBe(false);
    expect(canOpenNodeFromShell({
      ...baseNode,
      publicLocator: { appId: 'reader', params: { slug: null as unknown as string } },
    })).toBe(false);
  });

  it('oculta recursos cuyo locator no pasa el allowlist ni requiere public', () => {
    expect(canOpenNodeFromShell({
      ...baseNode,
      publicLocator: { appId: 'reader', params: { resourceId: baseNode.refId } },
    })).toBe(false);
    expect(canOpenNodeFromShell({
      ...baseNode,
      requires: 'admin',
      publicLocator: { appId: 'reader', params: { slug: 'julio-2026' } },
    })).toBe(false);
  });

  it('el Finder permite imágenes con visor local; el resto del shell no', () => {
    const imageNode = {
      ...baseNode,
      resourceKind: 'image' as const,
      refId: 'media-uuid',
    };
    expect(canOpenNodeFromShell(imageNode, { allowImagePreview: true })).toBe(true);
    /* Sin visor local y sin URL pública, la imagen no se abre fuera del Finder. */
    expect(canOpenNodeFromShell(imageNode)).toBe(false);
    /* Con locator válido la imagen se abre en cualquier superficie. */
    expect(canOpenNodeFromShell({
      ...imageNode,
      publicLocator: { appId: 'reader', params: { slug: 'imagen' } },
    })).toBe(true);
  });

  it('oculta recursos sin resourceKind y shortcuts sin locator', () => {
    expect(canOpenNodeFromShell({ ...baseNode, resourceKind: undefined })).toBe(false);
    expect(canOpenNodeFromShell({ type: 'shortcut' })).toBe(false);
    expect(canOpenNodeFromShell({
      type: 'shortcut',
      publicLocator: { appId: 'reader', params: { slug: 'julio-2026' } },
    })).toBe(true);
  });
});
