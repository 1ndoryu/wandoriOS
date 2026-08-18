/* wandori.us — Projects Page
 * Lista minimalista de proyectos con links.
 * [Auditoría v4 §1.2] Migrado a createEl(). */

import { ProjectService } from '../services';
import { updateMeta, setPageJsonLd } from '../features/seo/meta';
import { showProfile } from '../store';
import { createEl, createExternalLink } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { tryCatch } from '../utils/result';

export async function renderProjects(): Promise<HTMLElement> {
  showProfile.set(true);
  updateMeta({ title: 'proyectos', description: 'proyectos y trabajo de wandorius' });
  setPageJsonLd('proyectos', 'proyectos y trabajo de wandorius');

  /* [317A-2] pagina-contenido llena el area de contenido para centrar los estados vacios. */
  const page = createEl('div', { className: 'pagina-contenido' });

  /* El h1 "proyectos" duplicaba el título de la ventana ("Proyectos"). Eliminado. */
  const cargando = createEl('p', { className: 'cargando', textContent: 'cargando...' });

  page.appendChild(cargando);

  const projectsResult = await tryCatch(ProjectService.list());
  if (!projectsResult.ok) {
    /* API no disponible — mostrar proyectos de ejemplo */
    page.innerHTML = '';

    const demoProjects = [
      { title: 'wandori.us', description: 'este sitio. blog/portfolio minimalista construido con rust y vanilla ts.', url: 'https://wandori.us' },
      { title: 'glory-sentinel', description: 'extension vscode para deteccion de violaciones de diseno en tiempo real.', url: 'https://github.com/1ndoryu/glory-sentinel' },
      { title: 'coolify-manager-rs', description: 'cli en rust para gestionar deploys en coolify via api.', url: 'https://github.com/1ndoryu/coolify-manager-rs' },
    ];

    const lista = createEl('div');
    for (const project of demoProjects) {
      const info = createEl('div', {},
        createEl('span', { className: 'proyecto-titulo', textContent: project.title }),
        createEl('p', { className: 'proyecto-descripcion', textContent: project.description }),
      );
      const item = createEl('div', { className: 'proyecto-item' }, info);
      if (project.url) {
        item.appendChild(createExternalLink(project.url, 'ver', 'proyecto-link'));
      }
      lista.appendChild(item);
    }
    page.appendChild(lista);
    return page;
  }

  const projects = projectsResult.value;
  page.innerHTML = '';

  if (projects.length === 0) {
    page.appendChild(createVacio('no hay proyectos todavia'));
    return page;
  }

  const lista = createEl('div');

  for (const project of projects) {
    const info = createEl('div', {});
    /* [018A-85] La portada opcional del proyecto se muestra arriba del título. */
    if (project.cover_image) {
      info.appendChild(createEl('img', {
        className: 'proyecto-imagen',
        src: project.cover_image,
        alt: '',
      }));
    }
    info.appendChild(createEl('span', { className: 'proyecto-titulo', textContent: project.title }));

    if (project.description) {
      info.appendChild(createEl('p', { className: 'proyecto-descripcion', textContent: project.description }));
    }

    const item = createEl('div', { className: 'proyecto-item' }, info);

    if (project.url) {
      item.appendChild(createExternalLink(project.url, 'ver', 'proyecto-link'));
    }

    lista.appendChild(item);
  }

  page.appendChild(lista);

  return page;
}
