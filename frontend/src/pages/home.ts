/* wandori.us — Home Page
 * Pagina de inicio. Las entradas son condicionales (configurable).
 * [Auditoría v4 §1.2] Migrado a createEl(). */

import { tryCatch } from '../utils/result';
import { ArticleService } from '../services';
import { navigate } from '../router';
import { trackArticleClick } from '../features/analytics/tracker';
import { resetMeta, setSiteJsonLd } from '../features/seo/meta';
import { siteConfig, showProfile } from '../store';
import { createEl } from '../utils/dom';
import type { Article } from '../api/types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
}

function renderEntry(article: Article): HTMLElement {
  const link = createEl('a', { href: `/article/${article.slug}`, textContent: article.title });
  link.addEventListener('click', (e) => {
    e.preventDefault();
    trackArticleClick(article.id);
    navigate(`/article/${article.slug}`);
  });

  const titulo = createEl('h2', { className: 'entrada-titulo' }, link);
  const fecha = createEl('time', { className: 'entrada-fecha', textContent: formatDate(article.published_at || article.created_at) });
  const entrada = createEl('article', { className: 'entrada' + (article.is_pinned ? ' entrada-fijada' : '') }, titulo, fecha);

  if (article.cover_image) {
    entrada.appendChild(createEl('img', { className: 'entrada-imagen', src: article.cover_image, alt: article.title, loading: 'lazy' }));
  }
  if (article.excerpt) {
    entrada.appendChild(createEl('p', { className: 'entrada-extracto', textContent: article.excerpt }));
  }

  return entrada;
}

export const demoArticles: Article[] = [
  { id: 'demo-1', title: 'el silencio de las maquinas', slug: 'el-silencio-de-las-maquinas', content: {}, excerpt: 'hay algo en el ruido blanco de los servidores que me recuerda al mar.', cover_image: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80', status: 'published', is_pinned: true, published_at: '2026-07-15T10:00:00Z', created_at: '2026-07-15T10:00:00Z', updated_at: '2026-07-15T10:00:00Z' },
  { id: 'demo-2', title: 'fragmentos de codigo y otras nostalgias', slug: 'fragmentos-de-codigo-y-otras-nostalgias', content: {}, excerpt: 'escribi mi primera linea de codigo a los catorce anos.', cover_image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=800&q=80', status: 'published', is_pinned: false, published_at: '2026-06-22T14:30:00Z', created_at: '2026-06-22T14:30:00Z', updated_at: '2026-06-22T14:30:00Z' },
  { id: 'demo-3', title: 'sobre diseno y otros actos de fe', slug: 'sobre-diseno-y-otros-actos-de-fe', content: {}, excerpt: 'el buen diseno no se nota. eso dicen.', cover_image: null, status: 'published', is_pinned: false, published_at: '2026-05-10T08:00:00Z', created_at: '2026-05-10T08:00:00Z', updated_at: '2026-05-10T08:00:00Z' },
  { id: 'demo-4', title: 'wandori.us — notas sobre construir en publico', slug: 'wandori-us-notas-sobre-construir-en-publico', content: {}, excerpt: 'decidi construir este sitio en publico.', cover_image: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&q=80', status: 'published', is_pinned: false, published_at: '2026-04-01T12:00:00Z', created_at: '2026-04-01T12:00:00Z', updated_at: '2026-04-01T12:00:00Z' },
];

export async function renderHome(): Promise<HTMLElement> {
  resetMeta();
  setSiteJsonLd();
  showProfile.set(true);

  const page = createEl('div');

  if (!siteConfig.get().showEntriesOnHome) return page;

  page.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  let articles: Article[] = [];
  try { const data = await ArticleService.list(1, 20); articles = data.items; }
  catch { articles = []; }

  page.innerHTML = '';
  const sorted = [...articles].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const dateA = a.published_at || a.created_at;
    const dateB = b.published_at || b.created_at;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  for (const article of sorted) page.appendChild(renderEntry(article));
  return page;
}

export async function getArticles(): Promise<Article[]> {
  const result = await tryCatch(ArticleService.list(1, 50));
  return result.ok ? result.value.items : [];
}
