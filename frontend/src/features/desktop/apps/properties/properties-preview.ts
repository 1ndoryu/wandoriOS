/* wandori.us — Properties App
 * [018A-39] Presenta metadatos locales del nodo seleccionado sin convertir el
 * comando contextual en un segundo lector ni consultar al backend. El nodo y
 * sus permisos ya fueron resueltos por WorkspaceStore/CommandRegistry.
 * Pendiente: agregar metadatos remotos solo cuando exista un DTO público de
 * propiedades; no mostrar refId interno a visitantes. */

import { createEl } from '../../../../utils/dom';
import { workspaceStore } from '../../../runtime/workspace/workspace-store';
import type { ResolvedNode } from '../../../runtime/workspace/types';

function findParentLabel(node: ResolvedNode, nodes: Readonly<Record<string, ResolvedNode>>): string {
  if (node.parentId === 'desktop') return 'Escritorio';
  if (!node.parentId) return 'Papelera';
  return nodes[node.parentId]?.label ?? 'Ubicación desconocida';
}

function appendProperty(list: HTMLElement, label: string, value: string): void {
  list.appendChild(createEl('div', { className: 'propiedadFila' },
    createEl('dt', { className: 'propiedadEtiqueta', textContent: label }),
    createEl('dd', { className: 'propiedadValor', textContent: value }),
  ));
}

/** Crear la vista de propiedades para un nodo del workspace. */
export function createPropertiesPreview(nodeId?: string): HTMLElement {
  const container = createEl('section', { className: 'propiedadesApp', ariaLabel: 'Propiedades' });
  const node = nodeId ? workspaceStore.get().nodes[nodeId] : undefined;

  if (!node) {
    container.appendChild(createEl('p', {
      className: 'propiedadesVacio',
      textContent: 'No se encontraron las propiedades de este elemento.',
    }));
    return container;
  }

  const heading = createEl('h2', { className: 'propiedadesTitulo', textContent: node.label });
  const list = createEl('dl', { className: 'propiedadesLista' });
  appendProperty(list, 'Tipo', node.resourceKind ?? node.type);
  appendProperty(list, 'Ubicación', findParentLabel(node, workspaceStore.get().nodes));
  appendProperty(list, 'Estado', node.parentId === null ? 'En papelera' : 'Disponible');
  appendProperty(list, 'Origen', node.origin === 'overlay' ? 'Personal' : 'Publicado');
  container.append(heading, list);
  return container;
}
