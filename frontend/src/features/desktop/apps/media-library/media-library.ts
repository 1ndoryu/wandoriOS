/* wandori.us — Media Library App
 * Biblioteca de media como programa del OS (admin-only).
 * Solo devuelve contenido; el shell crea la ventana y el chrome.
 * [297A-14 F4] Estados de asset visibles, subida validada (backend autoridad),
 * selección, papelera (soft delete) y restauración; object URLs siempre revocadas. */

import { createElement, RotateCcw, Trash2, Link, Upload, Image as ImageIcon, FileText } from 'lucide';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';
import { MediaService } from '../../../../services';
import { setMediaViewHandler, type MediaFilter } from '../../../runtime/commands/media-commands';
import { publishMediaChanged, type MediaChangedFileType } from '../../../runtime/media-events';
import { tryCatch } from '../../../../utils/result';
import { safeClick, safeRun } from '../../../../utils/safe-async';
import { showToast } from '../../../../components/ui/toast';
import { showConfirm } from '../../../../components/ui/confirm';
import {
  assetStateLabel,
  classifyClientType,
  formatFileSize,
  getFileExtension,
  isAllowedUpload,
} from './media-library-utils';
import type { MediaAdmin } from '../../../../api/types';

interface MediaLibraryOptions {
  readonly signal: AbortSignal;
}

export interface MediaLibraryView {
  readonly element: HTMLElement;
  /** [018A-1 F3] Franja de acciones inferior (subir archivo), chrome de la
   * ventana; el shell (desktop y móvil) la coloca fuera del scroll. */
  readonly actions?: HTMLElement;
  readonly destroy: () => void;
}

/** Copiar una URL al portapapeles con fallback. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback abajo */
  }
  try {
    const ta = createEl('textarea', { value: text });
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function createThumbnail(item: MediaAdmin): HTMLElement {
  const wrapper = createEl('div', { className: 'media-library__thumb' });
  if (item.file_type === 'image') {
    wrapper.appendChild(createEl('img', {
      className: 'media-library__thumb-img',
      src: item.admin_url,
      alt: item.alt_text || item.file_name,
      loading: 'lazy',
    }));
  } else {
    const icon = item.file_type === 'audio' ? FileText : ImageIcon;
    wrapper.appendChild(createEl('span', { className: 'media-library__thumb-icon' }, createElement(icon)));
  }
  return wrapper;
}

function createItemCard(
  item: MediaAdmin,
  isTrashView: boolean,
  onAction: () => void,
): HTMLElement {
  const name = item.alt_text || item.file_name;
  const label = createEl('span', { className: 'media-library__name', textContent: name, title: name });
  const meta = createEl('div', { className: 'media-library__meta' },
    createEl('span', { textContent: item.file_type }),
    createEl('span', { textContent: formatFileSize(item.file_size) }),
  );
  const badge = createEl('span', {
    className: `media-library__badge media-library__badge--${item.asset_state}`,
    textContent: assetStateLabel(item.asset_state),
  });
  const actions = createEl('div', { className: 'media-library__actions' });

  /* [018A-67] Icon-only: receta .boton-icono (caja 20px, SVG 14px del token),
   * coherente con las toolbars del OS. Antes era .boton + SVG Lucide de 24px
   * sin dimensionar. */
  const copyBtn = createEl('button', { type: 'button', className: 'boton-icono', ariaLabel: 'Copiar URL' },
    createElement(Link));
  copyBtn.addEventListener('click', safeClick(async () => {
    const ok = await copyToClipboard(item.url);
    showToast(ok ? 'URL copiada' : 'no se pudo copiar la URL');
  }));
  actions.appendChild(copyBtn);

  if (isTrashView) {
    const restoreBtn = createEl('button', {
      type: 'button', className: 'boton-icono', ariaLabel: `Restaurar ${name}`,
    }, createElement(RotateCcw));
    restoreBtn.addEventListener('click', safeClick(async () => {
      const result = await safeRun(MediaService.restore(item.id), 'error al restaurar');
      if (result.ok) {
        /* [018A-87] Al restaurar, el icono vuelve a su subcarpeta de Documentos. */
        publishMediaChanged({
          mediaId: item.id,
          operation: 'restored',
          fileType: item.file_type as MediaChangedFileType,
          label: item.alt_text || item.file_name,
        });
        showToast('media restaurado');
        onAction();
      }
    }));
    actions.appendChild(restoreBtn);
  } else {
    const deleteBtn = createEl('button', {
      type: 'button', className: 'boton-icono', ariaLabel: `Eliminar ${name}`,
    }, createElement(Trash2));
    deleteBtn.addEventListener('click', safeClick(async () => {
      const confirmed = await showConfirm(`mover "${name}" a la papelera?`);
      if (!confirmed) return;
      const result = await safeRun(MediaService.delete(item.id), 'error al eliminar');
      if (result.ok) {
        /* [018A-87] Al mover a la papelera, el icono se retira del escritorio. */
        publishMediaChanged({
          mediaId: item.id,
          operation: 'deleted',
          fileType: item.file_type as MediaChangedFileType,
          label: item.alt_text || item.file_name,
        });
        showToast('media movido a la papelera');
        onAction();
      }
    }));
    actions.appendChild(deleteBtn);
  }

  return createEl('div', { className: 'media-library__item' },
    createThumbnail(item), label, meta, badge, actions);
}

export function createMediaLibraryPreview(options: MediaLibraryOptions): MediaLibraryView {
  const container = createEl('div', { className: 'media-library' });
  /* [018A-1 F3] Franja de acciones inferior (chrome): se crea síncrona para
   * que el shell la coloque; la acción primaria (subir archivo) vive aquí,
   * no en el toolbar del contenido. */
  const actionsBar = createEl('div', { className: 'desktop-window__actions' });
  actionsBar.hidden = true;
  const pendingObjectUrls = new Set<string>();
  let disposed = false;
  let filter: MediaFilter = 'all';
  let trashView = false;

  const isActive = (): boolean => !disposed && !options.signal.aborted;

  /* [018A-71] Los controles de vista viven en el app toolbar REAL de la
   * ventana (grupo "Ver", chrome declarativo): la app declara el grupo en
   * app-registration-admin con comandos media:* que actúan sobre este
   * puente. La vista solo expone estado y acciones; el checkmark del item
   * activo lo calcula createAppToolbar vía isActive (patrón OS). Fail-closed:
   * sin puente registrado, los comandos devuelven failure. */
  setMediaViewHandler({
    state: () => ({ filter, trashView }),
    setFilter: (f: MediaFilter) => { filter = f; void render(); },
    setTrashView: (v: boolean) => { trashView = v; void render(); },
  });
  /* [018A-67] Icono primero y texto en span, con la receta boton-con-icono:
   * flex centrado + gap + SVG dimensionado desde token. Antes era .boton a
   * secas con el SVG después del texto: sin flex, el icono (24px por defecto
   * de Lucide) se iba a la segunda línea y el botón quedaba alto y roto. */
  const uploadBtn = createEl('button', { type: 'button', className: 'boton boton-con-icono' },
    createElement(Upload), createEl('span', { textContent: 'subir archivo' }));
  const fileInput = createEl('input', { type: 'file', accept: 'image/*,audio/*,video/*', className: 'oculto' });
  fileInput.addEventListener('change', safeClick(async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file || !isActive()) return;
    const check = isAllowedUpload(file);
    if (!check.ok) {
      showToast(check.reason || 'archivo no válido');
      return;
    }
    const ext = getFileExtension(file.name);
    if (filter !== 'all' && classifyClientType(ext) !== filter) {
      showToast('el archivo no coincide con el filtro actual');
      return;
    }

    /* Vista previa con object URL; se revoca al terminar o al desmontar. */
    let previewUrl = '';
    if (classifyClientType(ext) === 'image') {
      previewUrl = URL.createObjectURL(file);
      pendingObjectUrls.add(previewUrl);
    }

    const result = await safeRun(MediaService.upload(file), 'error al subir');
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      pendingObjectUrls.delete(previewUrl);
    }
    if (!result.ok) return;
    /* [018A-87] El archivo subido aterriza como nodo en su subcarpeta de
     * Documentos (media-gallery-sync); el admin lo propaga con "Publicar". */
    publishMediaChanged({
      mediaId: result.value.id,
      operation: 'uploaded',
      fileType: result.value.file_type as MediaChangedFileType,
      label: result.value.alt_text || result.value.file_name,
    });
    showToast('archivo subido');
    await render();
  }));
  uploadBtn.addEventListener('click', () => fileInput.click());

  /* [018A-1 F3] La acción primaria de creación (subir archivo) vive en la
   * franja inferior fija, fuera del scroll de la lista. El control de vista
   * vive en el app toolbar de la ventana (grupo "Ver" declarativo), no en
   * el body. */
  const list = createEl('div', { className: 'media-library__grid' });
  container.append(list);
  actionsBar.append(uploadBtn, fileInput);
  actionsBar.hidden = false;

  /* === Listado con descarte de respuestas obsoletas === */
  let generation = 0;
  async function render(): Promise<void> {
    const current = ++generation;
    list.textContent = '';
    list.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));
    const result = await tryCatch(
      trashView ? MediaService.listTrashed() : MediaService.listAdmin(),
    );
    if (!isActive() || current !== generation) return;
    if (!result.ok) {
      list.textContent = '';
      list.appendChild(createVacio('error al cargar la biblioteca'));
      return;
    }
    list.textContent = '';
    const items = result.value.filter(item => filter === 'all' || item.file_type === filter);
    if (items.length === 0) {
      list.appendChild(createVacio(
        trashView ? 'la papelera está vacía' : 'no hay archivos en la biblioteca',
      ));
      return;
    }
    for (const item of items) {
      list.appendChild(createItemCard(item, trashView, () => { void render(); }));
    }
  }

  void render();

  const destroy = (): void => {
    if (disposed) return;
    disposed = true;
    /* [018A-71] Limpiar el puente: la vista ya no puede recibir comandos. */
    setMediaViewHandler(null);
    for (const url of pendingObjectUrls) URL.revokeObjectURL(url);
    pendingObjectUrls.clear();
  };
  options.signal.addEventListener('abort', destroy, { once: true });

  return { element: container, actions: actionsBar, destroy };
}
