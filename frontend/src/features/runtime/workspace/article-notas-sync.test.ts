/* wandori.us — Tests del puente artículo → Notas [018A-76]. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyArticleToWorkspace,
  buildArticleNode,
  NOTAS_FOLDER_ID,
} from './article-notas-sync';
import { workspaceStore, overlayStore } from './workspace-store';
import type { ResolvedWorkspace, WorkspaceNode } from './types';

const originalWorkspace = workspaceStore.get();
const originalOverlay = overlayStore.get();

afterEach(() => {
  workspaceStore.set(originalWorkspace);
  overlayStore.set(originalOverlay);
});

const publishedArticle = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Mi nota',
  slug: 'mi-nota',
  status: 'published' as const,
};

describe('buildArticleNode', () => {
  it('construye el nodo resource del artículo dentro de Notas', () => {
    const node = buildArticleNode(publishedArticle);

    expect(node.id).toBe(`nota-${publishedArticle.id}`);
    expect(node.parentId).toBe(NOTAS_FOLDER_ID);
    expect(node.type).toBe('resource');
    expect(node.label).toBe('Mi nota');
    expect(node.refId).toBe(publishedArticle.id);
    expect(node.resourceKind).toBe('article');
    expect(node.publicLocator).toEqual({
      appId: 'reader',
      params: { slug: 'mi-nota' },
    });
    expect(node.requires).toBe('public');
  });
});

describe('applyArticleToWorkspace', () => {
  it('crea la carpeta Notas y añade el artículo al publicarlo', () => {
    applyArticleToWorkspace(publishedArticle);

    const overlay = overlayStore.get();
    expect(overlay.addedItems[NOTAS_FOLDER_ID]).toMatchObject({
      type: 'folder',
      parentId: 'desktop',
      label: 'Notas',
      requires: 'public',
    });
    expect(overlay.addedItems[`nota-${publishedArticle.id}`]).toMatchObject({
      type: 'resource',
      parentId: NOTAS_FOLDER_ID,
      resourceKind: 'article',
      publicLocator: { appId: 'reader', params: { slug: 'mi-nota' } },
    });
  });

  it('reutiliza la carpeta Notas existente sin duplicarla', () => {
    const withNotas: ResolvedWorkspace = {
      releaseVersion: 1,
      nodes: {
        [NOTAS_FOLDER_ID]: {
          id: NOTAS_FOLDER_ID,
          parentId: 'desktop',
          type: 'folder',
          label: 'Mis notas',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
      },
    };
    workspaceStore.set(withNotas);

    applyArticleToWorkspace(publishedArticle);

    const overlay = overlayStore.get();
    expect(overlay.addedItems[NOTAS_FOLDER_ID]).toBeUndefined();
    expect(overlay.addedItems[`nota-${publishedArticle.id}`]).toBeDefined();
  });

  it('retira el icono cuando el artículo deja de estar publicado', () => {
    workspaceStore.set({
      releaseVersion: 1,
      nodes: {
        'nota-x': {
          id: 'nota-x',
          parentId: NOTAS_FOLDER_ID,
          type: 'resource',
          label: 'X',
          refId: 'x',
          resourceKind: 'article',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
      },
    });

    applyArticleToWorkspace({ id: 'x', title: 'X', slug: 'x', status: 'draft' });

    expect(overlayStore.get().tombstones).toContain('nota-x');
  });

  it('no añade nodos para borradores sin icono previo', () => {
    applyArticleToWorkspace({ id: 'y', title: 'Y', slug: 'y', status: 'draft' });

    expect(Object.keys(overlayStore.get().addedItems)).toHaveLength(0);
    expect(overlayStore.get().tombstones).toHaveLength(0);
  });

  it('sincroniza el título con un fieldOverride cuando el nodo ya existe', () => {
    const nodeId = `nota-${publishedArticle.id}`;
    workspaceStore.set({
      releaseVersion: 1,
      nodes: {
        [nodeId]: {
          id: nodeId,
          parentId: NOTAS_FOLDER_ID,
          type: 'resource',
          label: 'Título antiguo',
          refId: publishedArticle.id,
          resourceKind: 'article',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
      },
    });

    applyArticleToWorkspace(publishedArticle);

    expect(overlayStore.get().fieldOverrides[nodeId]?.label).toBe('Mi nota');
    expect(overlayStore.get().addedItems[nodeId]).toBeUndefined();
  });
});
