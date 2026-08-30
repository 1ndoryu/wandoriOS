/* sentinel-disable-file mixed-barrel-logic
 * [por que] El re-export de createCoverField es API publica del editor
 * (article-editor.ts lo importa desde aqui); mezclar re-export con la UI
 * del modulo es intencional y documentado.
 */
/* wandori.us — Article Editor UI
 * Toolbar de formato y campo de portada del editor de artículos.
 * [297A-14 F5] Extraídos de article-editor.ts (SRP + límite 300 líneas).
 * Pura UI: recibe el editor y callbacks; no hace I/O directo salvo subir
 * multimedia (pickAndUpload) con guarda de actividad. */

import { createEl } from '../../../../utils/dom';
import { pickAndUpload } from '../../../../utils/upload';
import { safeRun } from '../../../../utils/safe-async';
import type { EditorInstance } from './article-editor-types';
/* [317A-3] La toolbar usa iconos Lucide de 1px (receta .boton-icono) con
 * nombre accesible por aria-label, en lugar de texto. */
import { createElement, Bold, Italic, Code, Heading2, Heading3, List, ListOrdered, Quote, SeparatorHorizontal, Image, AudioLines, Video, type IconNode } from 'lucide';

/** Barra de formato del editor (negrita, listas, media, etc.). */
export function createToolbar(
  editor: EditorInstance,
  getArticleId: () => string | undefined,
  isActive: () => boolean,
): HTMLElement {
  const toolbar = createEl('div', {
    /* [317A-4] gap-md (16px) en vez de gap-sm (8px): los botones de solo icono
     * de la toolbar no llevan borde y necesitan más aire entre sí. */
    className: 'article-editor__toolbar flex-fila flex-wrap gap-md mb-sm border-bottom',
    ariaLabel: 'Herramientas de edición',
  });
  /* [317A-3] Botones con icono Lucide: label = nombre accesible (aria-label/title),
   * icon = nodo Lucide 1px renderizado con createElement(). La receta .boton-icono
   * viene de components.css (caja + SVG con trazo del sistema). */
  const buttons: Array<{ label: string; icon: IconNode; action: () => void }> = [
    { label: 'negrita', icon: Bold, action: () => { editor.chain().focus().toggleBold().run(); } },
    { label: 'italica', icon: Italic, action: () => { editor.chain().focus().toggleItalic().run(); } },
    { label: 'codigo', icon: Code, action: () => { editor.chain().focus().toggleCode().run(); } },
    { label: 'h2', icon: Heading2, action: () => { editor.chain().focus().toggleHeading({ level: 2 }).run(); } },
    { label: 'h3', icon: Heading3, action: () => { editor.chain().focus().toggleHeading({ level: 3 }).run(); } },
    { label: 'lista', icon: List, action: () => { editor.chain().focus().toggleBulletList().run(); } },
    { label: 'lista ordenada', icon: ListOrdered, action: () => { editor.chain().focus().toggleOrderedList().run(); } },
    { label: 'cita', icon: Quote, action: () => { editor.chain().focus().toggleBlockquote().run(); } },
    { label: 'linea', icon: SeparatorHorizontal, action: () => { editor.chain().focus().setHorizontalRule().run(); } },
    {
      label: 'imagen',
      icon: Image,
      action: () => {
        void safeRun(pickAndUpload('image/*', getArticleId()), 'error al subir imagen').then(result => {
          if (isActive() && result.ok && result.value) {
            editor.chain().focus().setImage({ src: result.value.url }).run();
          }
        });
      },
    },
    {
      label: 'audio',
      icon: AudioLines,
      action: () => {
        void safeRun(pickAndUpload('audio/*', getArticleId()), 'error al subir audio').then(result => {
          if (isActive() && result.ok && result.value) {
            editor.chain().focus().insertContent(`<audio controls src="${result.value.url}"></audio>`).run();
          }
        });
      },
    },
    {
      label: 'video',
      icon: Video,
      action: () => {
        void safeRun(pickAndUpload('video/*', getArticleId()), 'error al subir video').then(result => {
          if (isActive() && result.ok && result.value) {
            editor.chain().focus().insertContent(`<video controls src="${result.value.url}" style="width:100%"></video>`).run();
          }
        });
      },
    },
  ];

  for (const button of buttons) {
    const element = createEl('button', {
      type: 'button',
      className: 'boton-icono',
      ariaLabel: button.label,
      title: button.label,
    }, createElement(button.icon));
    element.addEventListener('click', button.action);
    toolbar.appendChild(element);
  }
  return toolbar;
}

/* [018A-85] El campo de portada ahora vive en components/ui/cover-field.ts
 * (compartido con el editor de proyectos). Se re-exporta aquí para no romper
 * los imports existentes de article-editor.ts. */
export { createCoverField } from '../../../../components/ui/cover-field';
