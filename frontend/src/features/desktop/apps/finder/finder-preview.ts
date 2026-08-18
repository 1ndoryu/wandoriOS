/* wandori.us — Finder (File Browser)
 * Explorador de archivos del OS.
 * Lee hijos de un nodo del workspace y los renderiza usando ResourceTypeRegistry.
 * Soporta: navegación entre carpetas, abrir recursos, context menu, drag.
 * [Plan 297A-11] Reemplaza el preview hardcodeado de 297A-2.
 * [Auditoría v2] Navega dentro de la misma ventana en vez de abrir una nueva por carpeta.
 */

import {
  ArrowLeft,
  File,
  Package,
  createElement,
  type IconNode,
} from 'lucide';
import { createEl } from '../../../../utils/dom';
import { workspaceStore, getChildren, moveNodeToParent } from '../../../runtime/workspace/workspace-store';
import { openContextMenu } from '../../components/desktop-context-menu';
import {
  selectionStore,
  selectSingle,
  selectMany,
  selectBackground,
  isSelected,
  clearSelection,
  toggleSelect,
  extendSelect,
  getSelectedIds,
} from '../../../runtime/selection-store';
import { enableDrag, makeDropTarget } from '../../utils/icon-drag';
import { enableSelectionBand } from '../../utils/selection-band';
import { authStore } from '../../../../store';
import type { ResolvedNode } from '../../../runtime/workspace/types';
import { resolvePublicResourceTarget, canOpenNodeFromShell } from '../../../runtime/workspace/public-resource-locator';
import { AppRegistry } from '../../../runtime/app-registry';
import { resolveResourceIcon, resolveResourceIconType } from '../../../runtime/resource-type-registry';
import { showToast } from '../../../../components/ui/toast';
import { createModal } from '../../../../components/ui/modal';
import { trackImageDownload } from '../../../analytics/tracker';

export interface FinderOptions {
  folderId: string;
  onOpenApp: (appId: string, params?: Record<string, string>) => void;
  onNavigate?: (folderId: string, label: string) => void;
}

/* [018A-79] Los iconos ya no viven en un mapa local: los recursos resuelven en
 * ResourceTypeRegistry (fuente única con escritorio y móvil) y las apps en
 * AppRegistry. Antes este mapa local divergía del escritorio (artículo → carpeta). */
function getNodeIcon(node: ResolvedNode): IconNode {
  if (node.type === 'folder') return resolveResourceIcon('folder');
  if (node.type === 'resource' && node.resourceKind) {
    return resolveResourceIcon(node.resourceKind);
  }
  if (node.type === 'app' && node.refId) {
    return AppRegistry.get(node.refId)?.icon ?? Package;
  }
  return File;
}

function getNodeIconType(node: ResolvedNode): 'folder' | 'document' | 'application' {
  if (node.type === 'folder') return 'folder';
  if (node.type === 'resource' && node.resourceKind) {
    return resolveResourceIconType(node.resourceKind);
  }
  if (node.type === 'app') return 'application';
  return 'document';
}

function buildBreadcrumb(
  folderId: string,
  nodes: Readonly<Record<string, ResolvedNode>>,
): { id: string; label: string }[] {
  const crumbs: { id: string; label: string }[] = [];
  let current: string | null = folderId;

  while (current && current !== 'desktop') {
    const n: ResolvedNode | undefined = nodes[current];
    if (!n) break;
    crumbs.unshift({ id: n.id, label: n.label });
    current = n.parentId;
  }

  crumbs.unshift({ id: 'desktop', label: 'Escritorio' });
  return crumbs;
}

export function createFinderPreview(options: FinderOptions): HTMLElement {
  const finder = createEl('div', { className: 'desktop-finder' });

  let currentFolderId = options.folderId;

  /* [018A-91] Historial de navegación del Finder: cada navigateTo empuja la
   * carpeta anterior; el botón 'volver' la recupera sin re-empujar (push=false)
   * para no duplicar entradas. Los crumbs navegan con push (entran al historial). */
  const backStack: string[] = [];

  const pathEl = createEl('div', { className: 'desktop-finder__path' });
  const grid = createEl('div', { className: 'desktop-finder__grid' });

  /* [058A-4] Ítems renderizados (id → elemento). Permite aplicar la selección
   * por clase sobre elementos existentes en vez de reconstruir todo el grid en
   * cada cambio del selectionStore (la banda de selección genera muchos
   * cambios; un re-render completo por selección sería lento). Se limpia y
   * repuebla en render(). */
  const itemElements = new Map<string, HTMLElement>();

  function navigateTo(folderId: string, push = true): void {
    if (push && folderId !== currentFolderId) backStack.push(currentFolderId);
    currentFolderId = folderId;
    /* [018A-88] Al cambiar de carpeta la selección anterior deja de existir:
     * se limpia para que no queden ids huérfanos en el store global. */
    clearSelection();
    render();

    makeDropTarget({ el: grid, dropId: currentFolderId, context: 'finder' });

    const ws = workspaceStore.get();
    const node = ws.nodes[folderId];
    /* [018A-87] Ya no hay carpeta "Galería" en el workspace: el fallback es genérico. */
    const label = node?.label ?? (folderId === 'desktop' ? 'Escritorio' : folderId);
    options.onNavigate?.(folderId, label);
  }

  makeDropTarget({ el: grid, dropId: currentFolderId, context: 'finder' });

  /* [018A-88] Menú contextual del fondo de carpeta: el grid (que ya no tiene
   * estado vacío desde 018A-91) abre las acciones de creación del contexto
   * 'finder'. Los ítems del grid tienen su propio handler con
   * stopPropagation, así que este solo dispara sobre el fondo. Patrón espejo
   * de desktop-shell.ts. */
  grid.addEventListener('contextmenu', ((e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target !== grid) return;
    e.preventDefault();
    selectBackground('finder');
    openContextMenu({
      context: 'finder',
      targets: [{ id: currentFolderId, kind: 'folder' }],
      capability: authStore.get().capability,
      x: e.clientX,
      y: e.clientY,
    });
  }) as EventListener);

  finder.append(pathEl, grid);

  /* [018A-90] Navegación programática desde comandos globales (workspace:open):
   * el comando no puede invocar navigateTo (closure), así que dispara un
   * evento sobre el content de la ventana del Finder enfocada; el preview lo
   * traduce a navigateTo y onNavigate sincroniza título y params en el
   * windowStore (taskbar + reapertura de la carpeta de origen). */
  finder.addEventListener('finder:navigate', ((e: Event) => {
    const folderId = (e as CustomEvent<{ folderId?: string }>).detail?.folderId;
    if (folderId) navigateTo(folderId);
  }) as EventListener);

  function render(): void {
    const ws = workspaceStore.get();

    pathEl.innerHTML = '';

    /* [018A-91] Botón 'volver' a la carpeta anterior: deshabilitado cuando no
     * hay historial (carpeta raíz del Finder). Se reconstruye en cada render
     * porque pathEl se vacía; el listener navega con push=false para no
     * re-empujar la carpeta de la que se vuelve. */
    const backBtn = createEl('button', {
      type: 'button',
      className: 'desktop-finder__back',
      ariaLabel: 'Volver a la carpeta anterior',
    });
    backBtn.appendChild(createEl('span', { className: 'desktop-finder__back-icon' }, createElement(ArrowLeft)));
    backBtn.disabled = backStack.length === 0;
    backBtn.addEventListener('click', () => {
      const prev = backStack.pop();
      if (prev) navigateTo(prev, false);
    });
    pathEl.appendChild(backBtn);

    const crumbs = buildBreadcrumb(currentFolderId, ws.nodes as Readonly<Record<string, ResolvedNode>>);
    for (let i = 0; i < crumbs.length; i++) {
      if (i > 0) {
        pathEl.appendChild(createEl('span', { className: 'desktop-finder__path-sep', textContent: ' / ' }));
      }
      const crumb = createEl('button', {
        type: 'button', className: 'desktop-finder__path-crumb', textContent: crumbs[i].label,
      });
      const crumbId = crumbs[i].id;
      crumb.addEventListener('click', () => { navigateTo(crumbId); });
      pathEl.appendChild(crumb);
    }

    const children = getChildren(currentFolderId)
      /* [058A-3] Solo se listan nodos con apertura posible (carpeta, app,
       * visor de imagen o URL pública). Los recursos con locator roto o sin
       * URL no aparecen: su doble clic solo produciría un aviso. */
      .filter((child) => canOpenNodeFromShell(child, { allowImagePreview: true }));
    grid.innerHTML = '';
    itemElements.clear();

    /* [058A-4] idsInOrder del render actual: orden visible del grid para
     * extender el rango con Shift desde el último seleccionado. */
    const visibleIds = children.map(c => c.id);

    /* [018A-91] Sin estado vacío textual: una carpeta sin hijos deja el grid
     * en blanco (el clic derecho sobre el fondo sigue abriendo el menú porque
     * target === grid). */

    for (const child of children) {
      const item = createFinderItem(child, navigateTo, options, () => visibleIds);
      itemElements.set(child.id, item);

      enableDrag({
        el: item, nodeId: child.id, context: 'finder', gridEl: grid,
        /* [058A-4] Drag de grupo: se captura la selección finder en el
         * pointerdown; al soltar sobre un target, onGroupDrop mueve todos los
         * seleccionados (no solo el arrastrado). */
        getGroupIds: () => {
          const st = selectionStore.get();
          return st.source === 'finder' && st.selectedIds.length > 1 ? st.selectedIds : [];
        },
        onGroupDrop: (_draggedId, targetId, groupIds) => {
          for (const id of groupIds) {
            if (id === targetId) continue;
            moveNodeToParent(id, targetId);
          }
        },
      });

      if (child.type === 'folder') {
        makeDropTarget({ el: item, dropId: child.id, context: 'finder' });
      }

      grid.appendChild(item);
    }
  }

  workspaceStore.subscribe(() => { render(); });

  /* [058A-4] Actualización selectiva de la selección: se aplica/remueve la
   * clase --selected y aria-selected sobre los ítems existentes SIN re-render
   * completo (antes selectionStore.subscribe llamaba a render() y reconstruía
   * todo el grid en cada clic; con la banda de selección eso sería inviable).
   * El re-render completo sigue ocurriendo solo en cambios del workspace o
   * navegación. */
  selectionStore.subscribe(() => {
    for (const [id, el] of itemElements) {
      const selected = isSelected(id, 'finder');
      el.classList.toggle('desktop-finder__item--selected', selected);
      el.setAttribute('aria-selected', String(selected));
    }
  });

  /* [058A-4] Banda de selección (rubber band) desde el fondo del grid del
   * Finder. El clic simple en el fondo sin arrastre limpia la selección;
   * con Ctrl/Cmd la banda es aditiva. El feedback provisional usa
   * .desktop-finder__item--banded sin tocar el store hasta soltar. */
  enableSelectionBand({
    container: grid,
    getItems: () => Array.from(grid.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('desktop-finder__item') && Boolean(el.getAttribute('data-node-id')))
      .map(el => ({ id: el.getAttribute('data-node-id')!, el })),
    itemFeedbackClass: 'desktop-finder__item--banded',
    onApply: (ids, additive) => {
      if (ids.length === 0 && !additive) {
        clearSelection();
        return;
      }
      selectMany(ids, 'finder', { additive });
    },
  });

  return finder;
}

function createFinderItem(
  node: ResolvedNode,
  navigateTo: (folderId: string) => void,
  options: FinderOptions,
  /* [058A-4] idsInOrder del render actual (orden visible del grid). */
  getIdsInOrder: () => readonly string[],
): HTMLElement {
  const icon = getNodeIcon(node);
  const isImage = node.type === 'resource' && node.resourceKind === 'image';

  const item: HTMLElement = isImage
    ? createEl('figure', { className: `desktop-finder__item desktop-finder__item--${getNodeIconType(node)}`, ariaLabel: node.label })
    : createEl('button', {
        type: 'button', className: `desktop-finder__item desktop-finder__item--${getNodeIconType(node)}`, ariaLabel: node.label,
      });
  item.setAttribute('data-node-id', node.id);

  /* [018A-88] Estado de selección visible: la clase --selected reutiliza los
   * tokens de selección del OS (--sistema-inverso-*) igual que el escritorio. */
  const selected = isSelected(node.id, 'finder');
  item.classList.toggle('desktop-finder__item--selected', selected);
  item.setAttribute('aria-selected', String(selected));

  if (isImage && node.refId) {
    const img = createEl('img', {
      className: 'desktop-finder__thumbnail', src: `/api/media/${node.refId}/preview`, alt: node.label, loading: 'lazy',
    });
    img.onerror = () => { img.style.display = 'none'; };
    item.appendChild(img);
  } else {
    const iconSvg = createElement(icon);
    iconSvg.classList.add('desktop-finder__icon');
    item.appendChild(iconSvg);
  }

  item.appendChild(createEl('span', { className: 'desktop-finder__label', textContent: node.label }));

  item.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    activateNode(node, navigateTo, options);
  });

  item.addEventListener('mousedown', ((e: MouseEvent) => {
    if (e.button === 0 && e.detail === 1) {
      /* [058A-4] Selección múltiple estilo Windows: Ctrl/Cmd alterna, Shift
       * extiende rango (orden visible) y el clic simple reemplaza. Un clic
       * sobre un ítem YA seleccionado conserva la selección (permite
       * arrastrar el grupo). */
      if (e.ctrlKey || e.metaKey) {
        toggleSelect(node.id, 'finder');
      } else if (e.shiftKey) {
        extendSelect(node.id, getIdsInOrder(), 'finder');
      } else if (!isSelected(node.id, 'finder')) {
        selectSingle(node.id, 'finder');
      }
    }
  }) as EventListener);

  item.addEventListener('contextmenu', ((e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    /* [058A-4] Clic derecho sobre un ítem de la multi-selección: el menú actúa
     * sobre TODOS los seleccionados; sobre un ítem no seleccionado, se
     * selecciona solo ese. El contexto es 'folder' solo si todos los targets
     * son carpetas; una selección mixta usa 'icon' (incluye copiar/cortar/
     * eliminar multi). */
    const alreadySelected = isSelected(node.id, 'finder');
    const ids = alreadySelected ? getSelectedIds() : [node.id];
    if (!alreadySelected) selectSingle(node.id, 'finder');

    const ws = workspaceStore.get();
    const targets = ids
      .map(id => ws.nodes[id])
      .filter((n): n is ResolvedNode => Boolean(n))
      .map(n => {
        const isFolderNode = n.type === 'folder';
        const kind = isFolderNode ? 'folder' as const : (n.type === 'resource' ? 'shortcut' as const : 'app' as const);
        return { id: n.refId ?? n.id, kind };
      });
    const allFolders = targets.every(t => t.kind === 'folder');

    openContextMenu({
      context: allFolders ? 'folder' : 'icon',
      targets,
      capability: authStore.get().capability,
      x: e.clientX,
      y: e.clientY,
    });
  }) as EventListener);

  return item;
}

function activateNode(
  node: ResolvedNode,
  navigateTo: (folderId: string) => void,
  options: FinderOptions,
): void {
  if (node.type === 'folder') {
    navigateTo(node.id);
  } else if (node.type === 'resource' && node.resourceKind === 'image' && node.refId) {
    /* [018A-87] Las imágenes de Documentos se abren con visor local (preview
     * pública + descargar), sin pasar por un deep link de app. */
    openImagePreview(node.refId, node.label);
  } else if (node.type === 'resource' && node.resourceKind) {
    const publicTarget = resolvePublicResourceTarget(node);
    if (publicTarget) {
      options.onOpenApp(publicTarget.appId, publicTarget.params);
      return;
    }
    showToast('Este recurso todavía no tiene una referencia pública disponible');
  } else if (node.type === 'app' && node.refId) {
    options.onOpenApp(node.refId);
  }
}

/* [018A-87] Visor modal de imagen para los recursos de Documentos.
 * Usa la preview pública (/api/media/{id}/preview) y permite descargar.
 * Reutiliza createModal y trackImageDownload (mismo patrón que la página
 * /gallery) para no duplicar recetas visuales. */
function openImagePreview(mediaId: string, label: string): void {
  const url = `/api/media/${mediaId}/preview`;

  const fullImg = createEl('img', { src: url, alt: label });
  fullImg.style.width = '100%';
  fullImg.style.border = 'var(--borde)';

  const btnDescargar = createEl('button', { className: 'boton', textContent: 'descargar' });
  btnDescargar.addEventListener('click', () => {
    trackImageDownload(url);
    const a = createEl('a', { href: url, download: label || 'imagen' });
    a.click();
  });

  const container = createEl('div', {}, fullImg, btnDescargar);
  createModal({ titulo: label, contenido: container, ancho: '800px' });
}
