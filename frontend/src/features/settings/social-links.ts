/* wandori.us — Social Links Editor
 * Editor de enlaces sociales con guardado debounced.
 * [Auditoría v4 §1.2] Migrado a createEl() — demo de abstracción DOM. */

import { socialLinksStore, redesLayoutStore, type RedesLayout } from '../../store';
import { SettingsService } from '../../services';
import { createSizeSlider } from '../../components/ui/slider';
import { createEl, createContainer } from '../../utils/dom';

let socialSaveTimer: ReturnType<typeof setTimeout> | null = null;

function saveSocialLinks(): void {
  const links = socialLinksStore.get();
  SettingsService.save({
      social_links: JSON.stringify(links),
      redes_layout: redesLayoutStore.get(),
  }).catch(() => { /* fire-and-forget — safeRun en callers muestra toast */ });
}

function debouncedSaveSocial(): void {
  if (socialSaveTimer) clearTimeout(socialSaveTimer);
  socialSaveTimer = setTimeout(saveSocialLinks, 500);
}

type SizeUpdateFn = (key: string, value: number) => void;

/* Renderiza la sección de enlaces sociales completa */
export function renderSocialLinksSection(
  cfg: { redesSize: number; redesGap: number },
  updateSize: SizeUpdateFn,
): HTMLElement[] {
  const enlacesLabel = createEl('label', { className: 'campo-etiqueta', textContent: 'Enlaces' });

  const redesSizeSlider = createSizeSlider('Tamaño enlaces', 8, 24, cfg.redesSize, (v) => updateSize('redesSize', v));
  const redesGapSlider = createSizeSlider('Separación enlaces', 0, 20, cfg.redesGap, (v) => updateSize('redesGap', v));

  const enlacesContainer = createEl('div', { className: 'enlaces-editor' });

  /* Toggle layout inline/stacked */
  const layoutCheck = createEl('input', { type: 'checkbox' });
  layoutCheck.checked = redesLayoutStore.get() === 'stacked';
  layoutCheck.addEventListener('change', () => {
    const layout: RedesLayout = layoutCheck.checked ? 'stacked' : 'inline';
    redesLayoutStore.set(layout);
    saveSocialLinks();
  });
  const layoutLabel = createEl('label', { className: 'checkbox-personalizado' }, layoutCheck, 'uno por linea');

  function renderEnlaces(): void {
    enlacesContainer.innerHTML = '';
    const links = socialLinksStore.get();

    for (let i = 0; i < links.length; i++) {
      const nombreInput = createEl('input', {
        className: 'campo-entrada enlace-nombre',
        placeholder: 'nombre',
      });
      nombreInput.value = links[i].nombre;
      nombreInput.addEventListener('input', () => {
        socialLinksStore.update(arr => {
          const copy = [...arr];
          copy[i] = { ...copy[i], nombre: nombreInput.value };
          return copy;
        });
        debouncedSaveSocial();
      });

      const urlInput = createEl('input', {
        className: 'campo-entrada enlace-url',
        placeholder: 'https://...',
      });
      urlInput.value = links[i].url;
      urlInput.addEventListener('input', () => {
        socialLinksStore.update(arr => {
          const copy = [...arr];
          copy[i] = { ...copy[i], url: urlInput.value };
          return copy;
        });
        debouncedSaveSocial();
      });

      const btnQuitar = createEl('button', { className: 'boton enlace-quitar', title: 'quitar enlace', textContent: '×' });
      btnQuitar.addEventListener('click', () => {
        socialLinksStore.update(arr => arr.filter((_, idx) => idx !== i));
        renderEnlaces();
        saveSocialLinks();
      });

      const row = createContainer('enlace-row', nombreInput, urlInput, btnQuitar);
      enlacesContainer.appendChild(row);
    }

    const btnAgregar = createEl('button', { className: 'boton mt-sm', textContent: '+ agregar enlace' });
    btnAgregar.addEventListener('click', () => {
      socialLinksStore.update(arr => [...arr, { nombre: '', url: '' }]);
      renderEnlaces();
    });
    enlacesContainer.appendChild(btnAgregar);
  }

  renderEnlaces();

  return [enlacesLabel, redesSizeSlider, redesGapSlider, layoutLabel, enlacesContainer];
}
