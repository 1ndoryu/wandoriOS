/* wandori.us — Resource Commands
 * Comandos por tipo de recurso: editar, publicar y despublicar.
 * [297A-14 F5] Materializan las acciones declaradas en resource-type-registry
 * como comandos ejecutables con capacidades server-side. El menú contextual
 * solo proyecta CommandRegistry; antes estas acciones eran metadata sin
 * ejecutor. Trash/restore ya los cubren workspace:trash/restore (papelera
 * del workspace por nodo).
 *
 * Contrato: el target trae refId (UUID interno); resolver kind vía el nodo
 * del workspace y despachar al servicio/editor correspondiente. */

import { Info } from 'lucide';
import { CommandRegistry, adminOnly, type CommandContext, type CommandResult } from '../command-registry';
import { workspaceStore } from '../workspace/workspace-store';
import type { WorkspaceResourceKind } from '../workspace/types';
import { getResourceActions, type ResourceKind, type ResourceAction } from '../resource-type-registry';
import { ArticleService, ProjectService, ProductService } from '../../../services';
import { showToast } from '../../../components/ui/toast';
import { publishArticleEditorSaved } from '../article-editor-events';
import { publishProjectEditorSaved } from '../project-editor-events';
import { publishProductEditorSaved } from '../product-editor-events';
import { dispatchEvent } from '../../analytics/dispatcher';

/** Recurso resuelto desde el workspace. */
interface ResolvedResource {
  readonly nodeId: string;
  readonly refId: string;
  readonly kind: WorkspaceResourceKind;
}

/** Resolver target (id de nodo o refId) → nodo con resourceKind. */
function resolveResourceTarget(targetId: string | undefined): ResolvedResource | undefined {
  if (!targetId) return undefined;
  const ws = workspaceStore.get();
  const node = Object.values(ws.nodes).find(n => n.id === targetId || n.refId === targetId);
  if (!node?.resourceKind) return undefined;
  return { nodeId: node.id, refId: node.refId ?? node.id, kind: node.resourceKind };
}

/** App editor + nombre de param por tipo de recurso editable. */
const EDITOR_BY_KIND: Partial<Record<WorkspaceResourceKind, { appId: string; param: string }>> = {
  article: { appId: 'article-editor', param: 'articleId' },
  about: { appId: 'article-editor', param: 'articleId' },
  project: { appId: 'project-editor', param: 'projectId' },
  product: { appId: 'product-editor', param: 'productId' },
};

/** ¿El tipo permite esta acción? (authority: resource-type-registry). */
function kindAllowsAction(kind: WorkspaceResourceKind, action: ResourceAction): boolean {
  return getResourceActions(kind as ResourceKind, 'admin').includes(action);
}

/* === resource:edit — abrir el editor del recurso con su ID interno === */

CommandRegistry.register(adminOnly({
  id: 'resource:edit',
  label: 'Editar',
  order: 21,
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'resource.edit',
  isAvailable: (ctx: CommandContext) => {
    const target = resolveResourceTarget(ctx.targets?.[0]?.id);
    if (!target) return { state: 'hidden', reason: 'no resource target' };
    if (!EDITOR_BY_KIND[target.kind]) return { state: 'hidden', reason: 'kind sin editor' };
    if (!kindAllowsAction(target.kind, 'edit')) return { state: 'hidden', reason: 'kind sin edit' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const target = resolveResourceTarget(ctx?.targets?.[0]?.id);
    const editor = target ? EDITOR_BY_KIND[target.kind] : undefined;
    if (!target || !editor) return { status: 'failure', reason: 'recurso no editable' };
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow(editor.appId, { [editor.param]: target.refId });
    return { status: 'success' };
  },
}));

/* === resource:properties — metadata local del recurso === */

CommandRegistry.register({
  id: 'resource:properties',
  label: 'Propiedades',
  icon: Info,
  order: 24,
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'resource.properties',
  isAvailable: (ctx: CommandContext) => {
    const target = resolveResourceTarget(ctx.targets?.[0]?.id);
    if (!target) return { state: 'hidden', reason: 'no resource target' };
    if (!kindAllowsAction(target.kind, 'properties')) return { state: 'hidden', reason: 'kind sin properties' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const target = resolveResourceTarget(ctx?.targets?.[0]?.id);
    if (!target) return { status: 'failure', reason: 'recurso no encontrado' };
    const { openAppWindow } = await import('../route-app-adapter');
    await openAppWindow('properties', { nodeId: target.nodeId });
    return { status: 'success' };
  },
});

/* === resource:publish — editorial público del tipo === */

CommandRegistry.register(adminOnly({
  id: 'resource:publish',
  label: 'Publicar',
  order: 22,
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'resource.publish',
  isAvailable: (ctx: CommandContext) => {
    const target = resolveResourceTarget(ctx.targets?.[0]?.id);
    if (!target) return { state: 'hidden', reason: 'no resource target' };
    if (!kindAllowsAction(target.kind, 'publish')) return { state: 'hidden', reason: 'kind sin publish' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const target = resolveResourceTarget(ctx?.targets?.[0]?.id);
    if (!target) return { status: 'failure', reason: 'recurso no encontrado' };
    return setResourcePublished(target, true);
  },
}));

/* === resource:unpublish — vuelve a borrador/oculto === */

CommandRegistry.register(adminOnly({
  id: 'resource:unpublish',
  label: 'Despublicar',
  order: 23,
  contexts: ['icon', 'folder'],
  undoPolicy: 'none',
  analyticsEvent: 'resource.unpublish',
  isAvailable: (ctx: CommandContext) => {
    const target = resolveResourceTarget(ctx.targets?.[0]?.id);
    if (!target) return { state: 'hidden', reason: 'no resource target' };
    if (!kindAllowsAction(target.kind, 'unpublish')) return { state: 'hidden', reason: 'kind sin unpublish' };
    return { state: 'enabled' };
  },
  execute: async (ctx?: CommandContext): Promise<CommandResult> => {
    const target = resolveResourceTarget(ctx?.targets?.[0]?.id);
    if (!target) return { status: 'failure', reason: 'recurso no encontrado' };
    return setResourcePublished(target, false);
  },
}));

/* === Implementación compartida: publicar/despublicar por tipo === */

/* [297A-14 F5] La validación de negocio (precio > 0, moneda, disponibilidad)
 * es responsabilidad del backend, no del comando: el comando solo voltea el
 * estado editorial/visibilidad y el backend es la autoridad. Si rechaza,
 * el catch devuelve failure y el estado no cambia. */
async function setResourcePublished(
  target: ResolvedResource,
  published: boolean,
): Promise<CommandResult> {
  try {
    switch (target.kind) {
      case 'article':
      case 'about': {
        const article = await ArticleService.update(target.refId, {
          status: published ? 'published' : 'draft',
        });
        publishArticleEditorSaved({ articleId: article.id, operation: 'updated' });
        break;
      }
      case 'project': {
        const project = await ProjectService.update(target.refId, {
          is_visible: published,
        });
        publishProjectEditorSaved({ projectId: project.id, operation: 'updated' });
        break;
      }
      case 'product': {
        const product = await ProductService.update(target.refId, {
          is_active: published,
        });
        publishProductEditorSaved({ productId: product.id, operation: 'updated' });
        break;
      }
      default:
        return { status: 'failure', reason: 'tipo sin publicación' };
    }
    dispatchEvent({ type: published ? 'resource_published' : 'resource_privated', resourceKind: target.kind });
    showToast(published ? 'recurso publicado' : 'recurso despublicado');
    return { status: 'success' };
  } catch {
    return { status: 'failure', reason: 'error al actualizar el recurso' };
  }
}
