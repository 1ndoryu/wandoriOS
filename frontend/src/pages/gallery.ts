/* wandori.us — Gallery Page
 * Muestra todas las imagenes de todos los articulos en un grid.
 * [Auditoría v4 §1.2] Migrado a createEl(). */

import { MediaService } from '../services';
import { createModal } from '../components/ui/modal';
import { trackImageDownload } from '../features/analytics/tracker';
import { updateMeta, setPageJsonLd } from '../features/seo/meta';
import { showProfile } from '../store';
import { createEl } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { tryCatch } from '../utils/result';

export async function renderGallery(): Promise<HTMLElement> {
  showProfile.set(true);
  updateMeta({ title: 'galeria', description: 'todas las imagenes de wandori.us' });
  setPageJsonLd('galeria', 'todas las imagenes de wandori.us');

  /* El h1 "galeria" duplicaba el título de la ventana ("Galería"). Eliminado. */
  /* [317A-2] pagina-contenido llena el area de contenido para centrar los estados vacios. */
  const page = createEl('div', { className: 'pagina-contenido' });
  const cargando = createEl('p', { className: 'cargando', textContent: 'cargando...' });

  page.appendChild(cargando);

  const mediaResult = await tryCatch(MediaService.list());
  if (!mediaResult.ok) {
    /* API no disponible — mostrar imagenes de ejemplo */
    page.innerHTML = '';

    const grid = createEl('div', { className: 'galeria-grid' });
    const demoImages = [
      'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=400&q=80',
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&q=80',
      'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=400&q=80',
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=80',
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400&q=80',
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&q=80',
    ];

    for (const src of demoImages) {
      const card = createEl('div', { className: 'galeria-item' },
        createEl('img', { src, loading: 'lazy' }),
      );
      grid.appendChild(card);
    }

    page.appendChild(grid);
    return page;
  }

  const media = mediaResult.value;
  page.innerHTML = '';

  if (media.length === 0) {
    page.appendChild(createVacio('no hay imagenes todavia'));
    return page;
  }

  const grid = createEl('div', { className: 'galeria-grid' });

  for (const item of media) {
    const img = createEl('img', { src: item.url, alt: item.alt_text || '', loading: 'lazy' });

    img.addEventListener('click', () => {
      const fullImg = createEl('img', { src: item.url, alt: item.alt_text || '' });
      fullImg.style.width = '100%';
      fullImg.style.border = 'var(--borde)';

      const btnDescargar = createEl('button', { className: 'boton', textContent: 'descargar' });
      btnDescargar.addEventListener('click', () => {
        trackImageDownload(item.url);
        const a = createEl('a', { href: item.url, download: item.file_name || 'imagen' });
        a.click();
      });

      const container = createEl('div', {}, fullImg, btnDescargar);
      createModal({ titulo: 'imagen', contenido: container, ancho: '800px' });
    });

    const card = createEl('div', { className: 'galeria-item' }, img);
    grid.appendChild(card);
  }

  page.appendChild(grid);

  return page;
}
