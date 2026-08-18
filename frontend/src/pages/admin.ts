/* wandori.us — Admin Panel
 * Panel de administración. Orquesta tabs y delega a módulos.
 * [Auditoría v4 §1.2] Migrado a createEl(). */

import { SettingsService, AnalyticsService } from '../services';
import { showProfile } from '../store';
import { showToast } from '../components/ui/toast';
import { createTextarea } from '../components/ui/textarea';
import { createProfileSettingsPanel } from '../features/settings/profile-settings';
import { safeClick, safeRun, safeEffect } from '../utils/safe-async';
import { renderArticleList, openEditor, disposeAdminArticleLists } from './admin-articles';
import { renderProjectList, openProjectEditor, disposeAdminProjectLists } from './admin-projects';
import { renderProductList, openProductEditor, disposeAdminProductLists } from './admin-products';
import { createTabs } from '../components/ui/tabs';
import { createVacio } from '../components/ui/empty-state';
import { createEl } from '../utils/dom';

/** Cleanup de recursos editoriales antes de desmontar la página Admin. */
export function disposeAdminPage(page: HTMLElement): void {
  disposeAdminArticleLists(page);
  disposeAdminProjectLists(page);
  disposeAdminProductLists(page);
}

/* [018A-1] Vista de Admin para el runtime de ventanas: devuelve la página
 * (async) y la franja de acciones (síncrona) que el shell coloca debajo del
 * body padded. El tab activo rellena la franja; los tabs sin alta la
 * ocultan. Los botones de acción primaria van al final (derecha). */
export function createAdminWindowView(): { page: Promise<HTMLElement>; actions: HTMLElement } {
  showProfile.set(false);

  const page = createEl('div', { className: 'admin-pagina' });

  /* Franja de acciones de la ventana: hija directa de .desktop-window, debajo
   * del body padded y fuera de su scroll. La rellena switchTab según el tab. */
  const actionsBar = createEl('div', { className: 'desktop-window__actions' });
  actionsBar.hidden = true;

  function setWindowActions(buttons: HTMLElement[]): void {
    actionsBar.textContent = '';
    for (const button of buttons) actionsBar.appendChild(button);
    actionsBar.hidden = buttons.length === 0;
  }

  /* El header (h1 "admin" + botón "salir") duplicaba la barra de título de la
   * ventana y el logout de la app Cuenta ("cerrar sesión" en account-view.ts).
   * Eliminado: la ventana ya se titula "Admin" y el logout vive en Cuenta. */
  /* Barra de pestañas universal (components/ui/tabs.ts). El estado activo lo
   * resuelve el componente (clase + aria-selected), sin inline styles ni
   * utilidades externas de padding/margin. [317A-1] */
  /* [317A-2] admin-contenido cierra la cadena de fill-height de la ventana
   * (app-contenedor -> admin-pagina -> admin-contenido) para que los estados
   * vacios centrados llenen toda la altura. */
  const contentArea = createEl('div', { id: 'admin-articulos', className: 'admin-contenido' });

  function switchTab(name: string): void {
    disposeAdminPage(page);
    contentArea.innerHTML = '';
    contentArea.id = `admin-${name}`;

    switch (name) {
      /* [018A-1] Las listas viven solas en el body; el botón de alta va a la
       * franja inferior de la ventana (fuera del body padded), al final. */
      case 'articulos': {
        const lista = createEl('div', { className: 'admin-lista' });
        contentArea.appendChild(lista);
        renderArticleList(lista);
        const btnNuevo = createEl('button', { className: 'boton', textContent: '+ nuevo articulo' });
        btnNuevo.addEventListener('click', () => openEditor());
        setWindowActions([btnNuevo]);
        break;
      }
      case 'proyectos': {
        const lista = createEl('div', { className: 'admin-lista' });
        contentArea.appendChild(lista);
        renderProjectList(lista);
        const btnNuevo = createEl('button', { className: 'boton', textContent: '+ nuevo proyecto' });
        btnNuevo.addEventListener('click', () => openProjectEditor());
        setWindowActions([btnNuevo]);
        break;
      }
      case 'productos': {
        const lista = createEl('div', { className: 'admin-lista' });
        contentArea.appendChild(lista);
        renderProductList(lista);
        const btnNuevo = createEl('button', { className: 'boton', textContent: '+ nuevo producto' });
        btnNuevo.addEventListener('click', () => openProductEditor());
        setWindowActions([btnNuevo]);
        break;
      }
      case 'fuentes':
        contentArea.appendChild(createProfileSettingsPanel());
        setWindowActions([]);
        break;
      case 'sitio': {
        /* [018A-1 F3] La acción primaria del tab sitio (guardar contenido)
         * vive en la franja de la ventana como el resto de tabs; el body
         * solo renderiza el formulario. */
        const sitio = renderSitioTab();
        contentArea.appendChild(sitio.element);
        setWindowActions([sitio.createSaveAction()]);
        break;
      }
      case 'estadisticas':
        renderEstadisticasTab(contentArea);
        setWindowActions([]);
        break;
    }
  }

  const tabs = createTabs({
    tabs: [
      { id: 'articulos', label: 'articulos' },
      { id: 'proyectos', label: 'proyectos' },
      { id: 'productos', label: 'productos' },
      { id: 'fuentes', label: 'fuentes' },
      { id: 'sitio', label: 'sitio' },
      { id: 'estadisticas', label: 'estadisticas' },
    ],
    initial: 'articulos',
    onSwitch: switchTab,
  });

  page.append(tabs.el, contentArea);
  return { page: Promise.resolve(page), actions: actionsBar };
}

/* [legacy] Ruta /admin del router (sin ventana): solo el contenido. La franja
 * de acciones pertenece al chrome de la ventana, no a la página en sí. */
export async function renderAdmin(): Promise<HTMLElement> {
  return createAdminWindowView().page;
}

function renderSitioTab(): { element: HTMLElement; createSaveAction: () => HTMLElement } {
  const container = createEl('div', { className: 'flex-columna gap-lg' });
  container.appendChild(createEl('h3', { textContent: 'contenido del sitio' }));

  let aboutContent = '';
  const aboutArea = createTextarea({
    label: 'contenido about (html)',
    placeholder: '<h1>about</h1><p>tu contenido...</p>',
    rows: 8,
    onInput: (v) => { aboutContent = v; },
  });
  container.appendChild(aboutArea);

  safeEffect(async () => {
    const s = await SettingsService.getPublic();
    aboutContent = s.about_content || '';
    const textarea = aboutArea.querySelector('textarea');
    if (textarea) textarea.value = aboutContent;
  })();

  /* [018A-1 F3] El botón se crea aquí (closure sobre aboutContent) pero el
   * shell lo coloca en la franja de la ventana vía setWindowActions. */
  const btnGuardarSitio = createEl('button', { className: 'boton', textContent: 'guardar' });
  btnGuardarSitio.addEventListener('click', safeClick(async () => {
    const result = await safeRun(SettingsService.save({ about_content: aboutContent }), 'error al guardar');
    if (result.ok) showToast('contenido actualizado');
  }));
  return { element: container, createSaveAction: () => btnGuardarSitio };
}

function renderEstadisticasTab(contentArea: HTMLElement): void {
  const statsContainer = createEl('div');
  statsContainer.innerHTML = '<p class="cargando">cargando...</p>';
  contentArea.appendChild(statsContainer);

  AnalyticsService.getStats().then(stats => {
    statsContainer.innerHTML = '';
    const grid = createEl('div', { className: 'stats-grid' });
    const metrics = [
      { valor: stats.total_page_views, etiqueta: 'page views' },
      { valor: stats.total_clicks, etiqueta: 'clicks' },
      { valor: stats.total_downloads, etiqueta: 'descargas' },
      { valor: stats.total_purchases, etiqueta: 'compras' },
    ];

    for (const m of metrics) {
      const item = createEl('div', { className: 'stats-item' },
        createEl('div', { className: 'stats-valor', textContent: String(m.valor) }),
        createEl('div', { className: 'stats-etiqueta', textContent: m.etiqueta }),
      );
      grid.appendChild(item);
    }
    statsContainer.appendChild(grid);

    if (stats.top_articles.length > 0) {
      statsContainer.appendChild(createEl('h3', { className: 'mt-lg mb-md', textContent: 'articulos mas vistos' }));
      for (const art of stats.top_articles) {
        const item = createEl('div', { className: 'admin-item' },
          createEl('span', { textContent: art.title }),
          createEl('span', { textContent: `${art.views} views` }),
        );
        statsContainer.appendChild(item);
      }
    }
  }).catch(() => {
    /* [317A-2] Estado de error via componente universal (en vez de innerHTML). */
    statsContainer.replaceChildren(createVacio('error al cargar estadisticas'));
  });
}
