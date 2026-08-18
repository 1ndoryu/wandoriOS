/* wandori.us — Sidebar Component
 * Menu de navegacion + lista de entradas debajo de proyectos.
 * Responsive: se colapsa en mobile. */

import { createEl } from '../../utils/dom';
import { navigate, getCurrentPath, onNavigate } from '../../router';
import { getArticles } from '../../pages/home';
import type { Article } from '../../api/types';
import { reconcileChildren } from '../../utils/reconcile';

interface NavItem {
  etiqueta: string;
  ruta: string;
}

const navItems: NavItem[] = [
  { etiqueta: 'inicio', ruta: '/' },
  { etiqueta: 'about', ruta: '/about' },
  { etiqueta: 'galeria', ruta: '/gallery' },
  { etiqueta: 'proyectos', ruta: '/projects' },
];

let articlesCache: Article[] | null = null;
let articlesFetching: Promise<Article[]> | null = null;

export function clearArticleCache(): void {
  articlesCache = null;
  articlesFetching = null;
}

async function getCachedArticles(): Promise<Article[]> {
  if (articlesCache) return articlesCache;
  if (articlesFetching) return articlesFetching;

  articlesFetching = getArticles().then((articles) => {
    articlesCache = articles;
    articlesFetching = null;
    return articles;
  }).catch(() => {
    articlesFetching = null;
    return [];
  });

  return articlesFetching;
}

export function createSidebar(): HTMLElement {
  const sidebar = createEl('aside', { className: 'sidebar' });

  const nav = createEl('nav', { className: 'sidebar-nav' });
  const sep = createEl('div', { className: 'sidebar-separador' });
  const entradas = createEl('div', { className: 'sidebar-entradas' });

  function renderNav(path: string): void {
    reconcileChildren(
      nav,
      navItems,
      (item) => item.ruta,
      (item) => {
        const a = createEl('a', { href: item.ruta, className: 'sidebar-nav-link', textContent: item.etiqueta });
        if (path === item.ruta || (item.ruta !== '/' && path.startsWith(item.ruta))) {
          a.classList.add('activo');
        }
        a.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(item.ruta);
        });
        return a;
      },
      (el, item) => {
        const isActive = path === item.ruta || (item.ruta !== '/' && path.startsWith(item.ruta));
        el.classList.toggle('activo', isActive);
      },
    );
  }

  async function renderEntries(path: string): Promise<void> {
    const articles = await getCachedArticles();
    const sorted = [...articles].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      const dateA = a.published_at || a.created_at;
      const dateB = b.published_at || b.created_at;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    reconcileChildren(
      entradas,
      sorted,
      (article) => article.slug,
      (article) => {
        const a = createEl('a', {
          href: `/article/${article.slug}`, className: 'sidebar-entrada-link', textContent: article.title,
        });
        if (path === `/article/${article.slug}`) {
          a.classList.add('activo');
        }
        a.addEventListener('click', (e) => {
          e.preventDefault();
          navigate(`/article/${article.slug}`);
        });
        return a;
      },
      (el, article) => {
        const isActive = path === `/article/${article.slug}`;
        el.classList.toggle('activo', isActive);
      },
    );
  }

  renderNav(getCurrentPath());
  renderEntries(getCurrentPath());

  onNavigate((path) => {
    renderNav(path);
    renderEntries(path);
  });

  sidebar.append(nav, sep, entradas);
  return sidebar;
}
