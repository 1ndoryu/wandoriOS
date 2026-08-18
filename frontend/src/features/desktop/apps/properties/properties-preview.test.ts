/* Pruebas de la vista local de propiedades [018A-39].
 * El programa debe ser seguro ante nodos ausentes y no presentar refId internos. */

import { beforeEach, describe, expect, it } from 'vitest';
import { createPropertiesPreview } from './properties-preview';
import { workspaceStore } from '../../../runtime/workspace/workspace-store';
import type { ResolvedWorkspace } from '../../../runtime/workspace/types';

describe('createPropertiesPreview', () => {
  beforeEach(() => {
    workspaceStore.set({
      releaseVersion: 1,
      nodes: {
        folder: { id: 'folder', parentId: 'desktop', type: 'folder', label: 'Galería', origin: 'release' },
        image: { id: 'image', parentId: 'folder', type: 'resource', resourceKind: 'image', refId: 'secret-ref', label: 'foto.png', origin: 'overlay' },
      },
    } as unknown as ResolvedWorkspace);
  });

  it('muestra metadatos de ubicación, estado y origen', () => {
    const view = createPropertiesPreview('image');
    expect(view.textContent).toContain('foto.png');
    expect(view.textContent).toContain('image');
    expect(view.textContent).toContain('Galería');
    expect(view.textContent).toContain('Disponible');
    expect(view.textContent).toContain('Personal');
  });

  it('no expone el refId interno', () => {
    expect(createPropertiesPreview('image').textContent).not.toContain('secret-ref');
  });

  it('falla cerrado cuando el nodo ya no existe', () => {
    const view = createPropertiesPreview('missing');
    expect(view.textContent).toContain('No se encontraron');
  });
});
