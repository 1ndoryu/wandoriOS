/* wandori.us — Reader (Article Viewer)
 * Lector de artículos del OS. Carga contenido real desde la API.
 * [Auditoría v2] Reemplaza el preview hardcodeado de 297A-2.
 */

import { createEl } from '../../../../utils/dom';
import { ArticleService } from '../../../../services';
import { appendSanitizedHtml } from '../../../../utils/sanitize-html';
import { tryCatch } from '../../../../utils/result';
import type { JSONContent } from '@tiptap/core';

export interface ReaderOptions {
  slug?: string;
  title?: string;
}

export function createReaderPreview(options: ReaderOptions): HTMLElement {
  const titleEl = createEl('h1', { className: 'desktop-reader__title', textContent: options.title ?? 'Cargando…' });
  const dateEl = createEl('time', { className: 'desktop-reader__date' }) as HTMLTimeElement;
  const header = createEl('header', { className: 'desktop-reader__header' }, titleEl, dateEl);
  const body = createEl('div', { className: 'desktop-reader__body' });

  const article = createEl('article', { className: 'desktop-reader' }, header, body);

  if (options.slug) {
    void loadArticle(options.slug, titleEl, dateEl, body);
  } else {
    body.appendChild(createEl('p', { className: 'desktop-reader__empty', textContent: 'Selecciona un artículo para leer.' }));
  }

  return article;
}

async function loadArticle(
  slug: string,
  titleEl: HTMLElement,
  dateEl: HTMLTimeElement,
  body: HTMLElement,
): Promise<void> {
  const articleResult = await tryCatch(ArticleService.getBySlug(slug));
  if (!articleResult.ok) {
    titleEl.textContent = 'Error al cargar';
    body.appendChild(createEl('p', { className: 'desktop-reader__empty', textContent: `No se pudo cargar el artículo "${slug}".` }));
    return;
  }

  const article = articleResult.value;

  /* [018A-75] El contenido se guarda como documento ProseMirror (JSON); se
   * convierte a HTML con las mismas extensiones del editor y luego pasa por
   * el sanitizador allowlist. El contenido legacy (string) se conserva como
   * HTML plano. La carga es dinámica para no inflar el bundle principal. */
  let html: string;
  if (typeof article.content === 'string') {
    html = article.content;
  } else {
    const [{ generateHTML }, StarterKitModule, ImageModule] = await Promise.all([
      import('@tiptap/core'),
      import('@tiptap/starter-kit'),
      import('@tiptap/extension-image'),
    ]);
    html = generateHTML(
      article.content as unknown as JSONContent,
      [StarterKitModule.default, ImageModule.default.configure({ inline: false })],
    );
  }

  titleEl.textContent = article.title;

  if (article.published_at) {
    const d = new Date(article.published_at);
    dateEl.dateTime = article.published_at;
    dateEl.textContent = d.toLocaleDateString('es', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  if (article.cover_image) {
    body.appendChild(createEl('img', {
      className: 'desktop-reader__image', src: article.cover_image, alt: article.title, loading: 'lazy',
    }));
  }

  if (html) {
    appendSanitizedHtml(body, html);
  } else {
    body.appendChild(createEl('p', { className: 'desktop-reader__empty', textContent: 'Este artículo no tiene contenido.' }));
  }
}
