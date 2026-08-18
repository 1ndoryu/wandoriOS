/* 138A-8 — Panel de Textura del Constructor: rampa toon global.
 * Carga una imagen local (file input → data URL) o por URL (http/https/data)
 * y la convierte en la rampa de gradiente compartida del render toon; sin
 * subida a servidor. "Restaurar" vuelve a la rampa procedural del Bosque.
 * Viabilidad (deuda documentada en el plan): el mesher actual pinta por
 * vértices, así que la textura se aplica como ramp global (gradientMap), no
 * por material; el panel queda igualmente operativo. */

import { createEl } from '../../../../utils/dom';
import type { ConstructorPanelContext } from './game-world-constructor';

const MAX_TEXTURE_BYTES = 4 * 1024 * 1024;

/** Panel Textura: file o URL → `commitToonRamp(dataUrl)` (null = reset). */
export function buildTexturePanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const status = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });

  const fileInput = createEl('input', {
    className: 'juegoPanelTerreno__entrada',
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp',
  });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > MAX_TEXTURE_BYTES) {
      status.textContent = 'imagen demasiado grande (máx 4 MiB).';
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => { status.textContent = 'no se pudo leer la imagen.'; };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        ctx.commitToonRamp(reader.result);
        status.textContent = `textura aplicada · ${file.name}`;
      }
    };
    reader.readAsDataURL(file);
  });
  container.appendChild(fileInput);

  const urlInput = createEl('input', {
    className: 'juegoPanelTerreno__entrada',
    type: 'url',
    placeholder: 'https://…/textura.png',
  });
  const applyUrl = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Aplicar URL',
  });
  applyUrl.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) {
      status.textContent = 'escribe una URL de imagen.';
      return;
    }
    if (!/^(https?:\/\/|data:image\/)/i.test(url)) {
      status.textContent = 'URL no válida (http/https o data:image).';
      return;
    }
    ctx.commitToonRamp(url);
    status.textContent = 'textura aplicada por URL';
  });
  container.appendChild(urlInput);
  container.appendChild(applyUrl);

  const reset = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Restaurar rampa',
  });
  reset.addEventListener('click', () => {
    ctx.commitToonRamp(null);
    urlInput.value = '';
    status.textContent = 'rampa procedural restaurada';
  });
  container.appendChild(reset);
  container.appendChild(status);

  /* Sin sync externo: la textura no se persiste (deuda documentada); el
   * estado queda en la escena y el panel es solo la puerta de entrada. */
}
