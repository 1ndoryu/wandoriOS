/* wandori.us — Profile Component
 * Foto de perfil, nombre y redes sociales.
 * Se renderiza como cabecera de la columna derecha. */

import { createEl } from '../../utils/dom';
import { profileImage, socialLinksStore, redesLayoutStore } from '../../store';
import { reconcileChildren } from '../../utils/reconcile';

export function createProfile(): HTMLElement {
  const profile = createEl('header', { className: 'profile' });

  const foto = createEl('img', { className: 'profile-foto', alt: 'wandorius' });
  const inicial = createEl('div', { className: 'profile-foto profile-foto-fallback', textContent: 'w' });
  inicial.hidden = true;
  let usingBundledFallback = false;

  foto.onerror = () => {
    /* [297A-12] En desarrollo /uploads puede pertenecer al proxy del backend.
     * El asset incluido permite evaluar Perfil sin convertir un fallo de red
     * en una decisión visual; el fallback tipográfico sigue siendo el último nivel. */
    if (!usingBundledFallback) {
      usingBundledFallback = true;
      foto.src = '/profile.jpg';
      return;
    }
    foto.hidden = true;
    inicial.hidden = false;
  };

  profileImage.subscribe((src) => {
    usingBundledFallback = false;
    foto.src = src;
    foto.hidden = false;
    inicial.hidden = true;
  });

  const nombre = createEl('h1', { className: 'profile-nombre', textContent: 'wandorius' });

  const redes = createEl('div', { className: 'profile-redes' });

  function renderRedes(): void {
    const links = socialLinksStore.get();
    reconcileChildren(
      redes,
      links,
      (link) => link.nombre,
      (link) => {
        return createEl('a', {
          href: link.url, textContent: link.nombre,
          target: '_blank', rel: 'noopener noreferrer',
          'data-external': 'true',
        });
      },
      (el, link) => {
        if (el.getAttribute('href') !== link.url) el.setAttribute('href', link.url);
      },
    );
  }

  socialLinksStore.subscribe(() => renderRedes());
  redesLayoutStore.subscribe((layout) => {
    redes.classList.toggle('profile-redes--stacked', layout === 'stacked');
  });

  profile.append(inicial, foto, nombre, redes);
  return profile;
}
