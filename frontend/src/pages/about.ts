/* wandori.us — About Page
 * Pagina "about me" con contenido editable desde settings.
 * [Auditoría v4 §1.2] Migrado a createEl(). */

import { SettingsService } from '../services';
import { updateMeta, setPageJsonLd } from '../features/seo/meta';
import { showProfile } from '../store';
import { appendSanitizedHtml } from '../utils/sanitize-html';
import { createEl, createText } from '../utils/dom';
import { tryCatch } from '../utils/result';

export async function renderAbout(): Promise<HTMLElement> {
  showProfile.set(true);
  updateMeta({ title: 'about', description: 'sobre wandorius — diseño web, software, musica, escritura.' });
  setPageJsonLd('about', 'sobre wandorius — diseño web, software, musica, escritura.');

  const page = createEl('div', { className: 'about-contenido' });

  const settingsResult = await tryCatch(SettingsService.getPublic());
  const settings = settingsResult.ok ? settingsResult.value : null;
  const content = settings?.about_content || '';

  if (content) {
    appendSanitizedHtml(page, content);
  } else {
    /* El h1 "about" duplicaba el título de la ventana ("About"). Eliminado. */
    page.append(
      createText('soy wandorius. hago cosas con codigo y con palabras, aunque a veces no se cual de las dos es mas dificil.'),
      createText('me interesan los espacios entre las cosas: el silencio entre dos notas, el espacio en blanco entre dos lineas de codigo, el momento exacto en que una idea deja de ser tuya y empieza a ser de todos.'),
      createText('diseño web, software, musica, escritura. no me gusta definirme pero si tuviera que elegir una palabra seria: curioso.'),
    );
  }

  return page;
}
