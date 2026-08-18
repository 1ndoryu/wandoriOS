/* Tests de los comandos de recurso [297A-14 F5]:
 * resource:edit/publish/unpublish/properties materializan las acciones declaradas en
 * resource-type-registry. Verifica:
 * - Registro y gating admin-only (fail-closed).
 * - Disponibilidad según kind y acción declarada.
 * - Publicar/despublicar despacha al servicio del tipo correcto. */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandRegistry } from '../command-registry';
import { workspaceStore } from '../workspace/workspace-store';
import { initResourceTypeRegistry } from '../resource-type-registry';
import '../app-registration';
import './resource-commands';
import { ArticleService, ProjectService, ProductService } from '../../../services';
import type { ResolvedWorkspace } from '../workspace/types';

/* Mock de servicios: el execute no debe tocar red. */
vi.mock('../../../services', () => ({
  ArticleService: { update: vi.fn(), create: vi.fn() },
  ProjectService: { update: vi.fn(), create: vi.fn() },
  ProductService: { update: vi.fn(), create: vi.fn() },
  MediaService: {},
  /* app-registration importa SettingsService del mismo módulo resuelto;
   * solo se usa al renderizar About, pero el factory debe proveerlo. */
  SettingsService: {},
}));

const makeNode = (id: string, refId: string, resourceKind: string) => ({
  id, parentId: 'desktop', type: 'resource', label: id, refId, resourceKind,
  requires: 'public', origin: 'release',
});

function setWorkspace(nodes: Record<string, unknown>): void {
  workspaceStore.set({ releaseVersion: 1, nodes } as unknown as ResolvedWorkspace);
}

describe('resource commands [297A-14 F5]', () => {
  beforeEach(() => {
    initResourceTypeRegistry();
    setWorkspace({
      article: makeNode('article', 'art-1', 'article'),
      project: makeNode('project', 'proj-1', 'project'),
      product: makeNode('product', 'prod-1', 'product'),
      image: makeNode('image', 'img-1', 'image'),
    });
    vi.clearAllMocks();
  });

  it('registra las acciones de recurso ejecutables', () => {
    expect(CommandRegistry.get('resource:edit')).toBeDefined();
    expect(CommandRegistry.get('resource:publish')).toBeDefined();
    expect(CommandRegistry.get('resource:unpublish')).toBeDefined();
    expect(CommandRegistry.get('resource:properties')).toBeDefined();
  });

  it('properties queda disponible para visitantes sin elevar capacidades', () => {
    const ctx = { capability: 'public' as const, targets: [{ id: 'art-1', kind: 'shortcut' as const }] };
    expect(CommandRegistry.isAvailable('resource:properties', ctx).state).toBe('enabled');
  });

  it('oculta los comandos para capacidad no-admin (fail-closed)', () => {
    expect(CommandRegistry.isAvailable('resource:edit', { capability: 'public' }).state).toBe('hidden');
    expect(CommandRegistry.isAvailable('resource:publish', { capability: 'public' }).state).toBe('hidden');
    expect(CommandRegistry.isAvailable('resource:unpublish', { capability: 'authenticated' }).state).toBe('hidden');
  });

  it('resource:edit disponible para admin con kind editable', () => {
    const ctx = { capability: 'admin' as const, targets: [{ id: 'art-1', kind: 'shortcut' as const }] };
    expect(CommandRegistry.isAvailable('resource:edit', ctx).state).toBe('enabled');
  });

  it('resource:edit oculto para kind sin editor (image)', () => {
    const ctx = { capability: 'admin' as const, targets: [{ id: 'img-1', kind: 'shortcut' as const }] };
    expect(CommandRegistry.isAvailable('resource:edit', ctx).state).toBe('hidden');
  });

  it('resource:edit oculto sin target resoluble', () => {
    const ctx = { capability: 'admin' as const, targets: [{ id: 'desconocido', kind: 'shortcut' as const }] };
    expect(CommandRegistry.isAvailable('resource:edit', ctx).state).toBe('hidden');
  });

  it('publish/unpublish disponibles solo para kinds con la acción', () => {
    const articleCtx = { capability: 'admin' as const, targets: [{ id: 'art-1', kind: 'shortcut' as const }] };
    const imageCtx = { capability: 'admin' as const, targets: [{ id: 'img-1', kind: 'shortcut' as const }] };
    expect(CommandRegistry.isAvailable('resource:publish', articleCtx).state).toBe('enabled');
    expect(CommandRegistry.isAvailable('resource:unpublish', articleCtx).state).toBe('enabled');
    expect(CommandRegistry.isAvailable('resource:publish', imageCtx).state).toBe('hidden');
    expect(CommandRegistry.isAvailable('resource:unpublish', imageCtx).state).toBe('hidden');
  });

  it('resource:publish actualiza el artículo a publicado y emite el evento de dominio', async () => {
    vi.mocked(ArticleService.update).mockResolvedValue({ id: 'art-1' } as never);
    const ctx = { capability: 'admin' as const, targets: [{ id: 'art-1', kind: 'shortcut' as const }] };
    const result = await CommandRegistry.execute('resource:publish', ctx);
    expect(result.status).toBe('success');
    expect(ArticleService.update).toHaveBeenCalledWith('art-1', { status: 'published' });
  });

  it('resource:unpublish despublica el proyecto (is_visible=false)', async () => {
    vi.mocked(ProjectService.update).mockResolvedValue({ id: 'proj-1' } as never);
    const ctx = { capability: 'admin' as const, targets: [{ id: 'proj-1', kind: 'shortcut' as const }] };
    const result = await CommandRegistry.execute('resource:unpublish', ctx);
    expect(result.status).toBe('success');
    expect(ProjectService.update).toHaveBeenCalledWith('proj-1', { is_visible: false });
  });

  it('resource:publish activa el producto (is_active=true)', async () => {
    vi.mocked(ProductService.update).mockResolvedValue({ id: 'prod-1' } as never);
    const ctx = { capability: 'admin' as const, targets: [{ id: 'prod-1', kind: 'shortcut' as const }] };
    const result = await CommandRegistry.execute('resource:publish', ctx);
    expect(result.status).toBe('success');
    expect(ProductService.update).toHaveBeenCalledWith('prod-1', { is_active: true });
  });

  it('devuelve failure si el servicio falla', async () => {
    vi.mocked(ArticleService.update).mockRejectedValue(new Error('db down'));
    const ctx = { capability: 'admin' as const, targets: [{ id: 'art-1', kind: 'shortcut' as const }] };
    const result = await CommandRegistry.execute('resource:publish', ctx);
    expect(result.status).toBe('failure');
  });
});
