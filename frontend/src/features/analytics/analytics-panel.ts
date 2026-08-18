/* wandori.us — Estadísticas como programa del OS
 * Una sola carga de datos alimenta cinco vistas. La UI no inventa métricas:
 * cuando el backend aún no entrega una dimensión, muestra estado vacío. */

import { Download, createElement } from 'lucide';
import { AnalyticsService } from '../../services';
import type { AnalyticsStats } from '../../api/types';
import { createTabs } from '../../components/ui/tabs';
import { createVacio } from '../../components/ui/empty-state';
import { createEl } from '../../utils/dom';

type PanelId = 'overview' | 'content' | 'os' | 'commerce' | 'reliability';

function metricGrid(stats: AnalyticsStats): HTMLElement {
  const grid = createEl('div', { className: 'stats-grid' });
  const metrics = [
    [stats.total_page_views, 'page views'],
    [stats.total_clicks, 'clicks'],
    [stats.total_downloads, 'descargas'],
    [stats.total_purchases, 'compras'],
  ] as const;
  for (const [value, label] of metrics) {
    grid.appendChild(createEl('div', { className: 'stats-item' },
      createEl('div', { className: 'stats-valor', textContent: String(value) }),
      createEl('div', { className: 'stats-etiqueta', textContent: label }),
    ));
  }
  return grid;
}

function renderPanel(panel: HTMLElement, id: PanelId, stats: AnalyticsStats): void {
  panel.replaceChildren();
  if (id === 'overview') {
    panel.appendChild(metricGrid(stats));
    return;
  }
  if (id === 'content') {
    panel.appendChild(createEl('h3', { textContent: 'Artículos más vistos' }));
    if (stats.top_articles.length === 0) {
      panel.appendChild(createVacio('No hay datos de contenido.'));
      return;
    }
    for (const article of stats.top_articles) {
      panel.appendChild(createEl('div', { className: 'admin-item' },
        createEl('span', { textContent: article.title }),
        createEl('span', { textContent: `${article.views} views` }),
      ));
    }
    return;
  }
  if (id === 'commerce') {
    panel.appendChild(createEl('h3', { textContent: 'Comercio' }));
    panel.appendChild(createEl('p', { textContent: `Compras registradas: ${stats.total_purchases}` }));
    return;
  }
  if (id === 'os') {
    panel.appendChild(createEl('h3', { textContent: 'Actividad del OS' }));
    if (stats.recent_events.length === 0) {
      panel.appendChild(createVacio('No hay actividad reciente.'));
      return;
    }
    for (const event of stats.recent_events) {
      panel.appendChild(createEl('div', { className: 'admin-item' },
        createEl('span', { textContent: event.event_type }),
        createEl('time', { textContent: new Date(event.created_at).toLocaleString('es') }),
      ));
    }
    return;
  }
  panel.appendChild(createVacio('No hay datos de fiabilidad disponibles.'));
}

export function createAnalyticsPanel(signal?: AbortSignal): { element: HTMLElement; destroy: () => void } {
  const root = createEl('div', { className: 'analyticsPanel' });
  const panel = createEl('div', { className: 'analyticsPanel__contenido' });
  const toolbar = createEl('div', { className: 'analyticsPanel__toolbar' });
  /* [018A-67] Icono+texto: receta boton-con-icono (flex + SVG del token).
   * Antes .boton a secas: la superficie inline-block rompía la línea y el
   * SVG de 24px desbordaba, igual que el botón de subida de media. */
  const exportButton = createEl('button', {
    type: 'button', className: 'boton boton-con-icono', ariaLabel: 'Exportar estadísticas',
  }, createElement(Download), createEl('span', { textContent: 'Exportar' }));
  toolbar.appendChild(exportButton);
  root.append(toolbar, panel);
  let stats: AnalyticsStats | null = null;
  let active: PanelId = 'overview';
  let disposed = false;

  const render = (): void => {
    if (!stats || disposed) return;
    renderPanel(panel, active, stats);
  };
  const tabs = createTabs({
    tabs: [
      { id: 'overview', label: 'Overview' },
      { id: 'content', label: 'Content' },
      { id: 'os', label: 'OS' },
      { id: 'commerce', label: 'Commerce' },
      { id: 'reliability', label: 'Reliability' },
    ],
    onSwitch: id => { active = id as PanelId; render(); },
  });
  root.prepend(tabs.el);

  exportButton.addEventListener('click', () => {
    if (!stats) return;
    const blob = new Blob([JSON.stringify(stats, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = createEl('a', { href: url, download: 'wandorius-analytics.json' });
    link.click();
    URL.revokeObjectURL(url);
  });

  void AnalyticsService.getStats().then(value => {
    if (disposed || signal?.aborted) return;
    stats = value;
    render();
  }).catch(() => {
    if (!disposed && !signal?.aborted) panel.replaceChildren(createVacio('Error al cargar estadísticas.'));
  });

  return {
    element: root,
    destroy: () => { disposed = true; },
  };
}
