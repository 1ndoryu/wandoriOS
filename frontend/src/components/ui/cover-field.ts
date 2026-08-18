/* wandori.us — Cover Field (componente compartido)
 * Campo de imagen de portada con vista previa, subida y borrado.
 * [018A-85] Extraído de article-editor-ui.ts para reutilizarse en artículos y
 * proyectos. Funcionalidad reutilizable no vive en apps concretas (regla GLORY):
 * el estado interno captura la URL y getValue() la expone al formulario. */

import { createEl } from '../../utils/dom';
import { pickAndUpload } from '../../utils/upload';
import { safeRun, safeClick } from '../../utils/safe-async';

export interface CoverField {
  element: HTMLElement;
  getValue: () => string | undefined;
}

/** Campo de portada: vista previa, subida (pickAndUpload) y borrado. */
export function createCoverField(
  initialUrl: string,
  isActive: () => boolean,
  onCoverChange?: () => void,
): CoverField {
  let coverImage = initialUrl || '';
  const container = createEl('div', { className: 'campo cover-field' });
  const label = createEl('label', { className: 'campo-etiqueta', textContent: 'imagen de portada' });
  const preview = createEl('img', {
    className: `config-imagen-preview${coverImage ? '' : ' oculto'}`,
    alt: 'Vista previa de portada',
  });
  if (coverImage) preview.src = coverImage;

  const removeButton = createEl('button', {
    type: 'button',
    className: `boton${coverImage ? '' : ' oculto'}`,
    textContent: 'quitar',
  });
  const uploadButton = createEl('button', {
    type: 'button',
    className: 'boton',
    textContent: coverImage ? 'cambiar portada' : 'subir portada',
  });
  uploadButton.addEventListener('click', safeClick(async () => {
    const result = await safeRun(pickAndUpload('image/*'), 'error al subir portada');
    if (!isActive() || !result.ok || !result.value) return;
    coverImage = result.value.url;
    preview.src = coverImage;
    preview.classList.remove('oculto');
    uploadButton.textContent = 'cambiar portada';
    removeButton.classList.remove('oculto');
    onCoverChange?.();
  }));
  removeButton.addEventListener('click', () => {
    if (!isActive()) return;
    coverImage = '';
    preview.src = '';
    preview.classList.add('oculto');
    removeButton.classList.add('oculto');
    uploadButton.textContent = 'subir portada';
    onCoverChange?.();
  });

  container.append(label, preview, createEl('div', { className: 'flex-fila gap-md' }, uploadButton, removeButton));
  return { element: container, getValue: () => coverImage || undefined };
}
