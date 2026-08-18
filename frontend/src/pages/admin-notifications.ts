/* wandori.us — Admin Notifications
 * Listado y alta de novedades para el panel Admin (tab "novedades").
 * [028A-5] El admin de novedades dejó la app notifications (borrada) y vive
 * aquí, con el patrón de listas de admin-articles: WeakMap de cleanups +
 * guard de generación para no renderizar tras desmontar la ventana.
 * El selector de estado usa createSelect (identidad OS), no <select> nativo. */

import { safeRun } from '../utils/safe-async';
import { tryCatch } from '../utils/result';
import { NotificationsService, type ApiNotificationAdmin } from '../services/notifications.service';
import { createEl } from '../utils/dom';
import { createVacio } from '../components/ui/empty-state';
import { createModal } from '../components/ui/modal';
import { createInput } from '../components/ui/input';
import { createTextarea } from '../components/ui/textarea';
import { createSelect } from '../components/ui/select';
import { showToast } from '../components/ui/toast';
import { showConfirm } from '../components/ui/confirm';

/* [028A-5] Etiquetas en español para el tag de estado (el valor crudo de la
 * API es 'draft'|'published'|'archived'; mostrarlo tal cual se veía raro y
 * además envolvía a dos líneas en el monoespaciado del tag). */
const ESTADO_ETIQUETA: Record<string, string> = {
  draft: 'borrador',
  published: 'publicado',
  archived: 'archivado',
};
const notificacionesListCleanups = new WeakMap<HTMLElement, () => void>();
const notificacionesListGenerations = new WeakMap<HTMLElement, number>();

/** Liberar el guard de generación de una lista antes de desmontar su ventana. */
export function disposeNotificationsAdminList(container: HTMLElement): void {
  const cleanup = notificacionesListCleanups.get(container);
  cleanup?.();
  notificacionesListCleanups.delete(container);
  notificacionesListGenerations.delete(container);
}

/** Liberar todas las listas de novedades pertenecientes a una página Admin. */
export function disposeAdminNotificationsLists(page: HTMLElement): void {
  page.querySelectorAll<HTMLElement>('.admin-lista').forEach(disposeNotificationsAdminList);
}

function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/** Renderiza el listado de novedades (draft/published/archived) con guard
 * de generación: si la ventana se desmonta o cambia de tab, no toca el DOM. */
export async function renderNotificationsAdminList(container: HTMLElement): Promise<void> {
  const generation = (notificacionesListGenerations.get(container) ?? 0) + 1;
  notificacionesListGenerations.set(container, generation);
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const result = await tryCatch(NotificationsService.listAdmin());
  if (notificacionesListGenerations.get(container) !== generation) return;
  container.textContent = '';
  if (!result.ok) {
    container.appendChild(createVacio('error al cargar novedades'));
    return;
  }

  const items = result.value.items;
  for (const item of items) {
    container.appendChild(renderAdminItem(item, container));
  }
  if (items.length === 0) {
    container.appendChild(createVacio('no hay avisos'));
  }
}

function renderAdminItem(item: ApiNotificationAdmin, container: HTMLElement): HTMLElement {
  const tag = createEl('span', {
    className: `tag-estado tag-estado--${item.status}`,
    textContent: ESTADO_ETIQUETA[item.status] ?? item.status,
  });
  const info = createEl('div', {},
    createEl('span', { textContent: item.title }),
    createEl('small', { className: 'ml-sm', textContent: ` — ${formatFecha(item.published_at ?? item.created_at)}` }),
  );

  const select = createSelect({
    options: [
      { value: 'draft', label: 'borrador' },
      { value: 'published', label: 'publicado' },
      { value: 'archived', label: 'archivado' },
    ],
    value: item.status,
    onChange: (value) => {
      /* [028A-5] Cambio de estado con rollback: si la API falla, el select
       * vuelve al estado anterior y se informa al usuario (no fallo mudo). */
      void safeRun(
        NotificationsService.updateStatus(item.id, value as 'draft' | 'published' | 'archived'),
        'no se pudo actualizar el estado',
      ).then((result) => {
        if (result.ok) {
          showToast('estado actualizado');
          void renderNotificationsAdminList(container);
        } else {
          void renderNotificationsAdminList(container);
        }
      });
    },
  });

  /* [028A-5] Botón de borrado: se permite eliminar avisos aunque ya estén
   * publicados (el usuario lo pidió explícitamente). Las lecturas se borran
   * en cascada (FK notification_reads.notification_id). */
  const deleteButton = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'eliminar',
  });
  deleteButton.addEventListener('click', () => {
    void safeRun(
      (async () => {
        const confirmed = await showConfirm(`eliminar "${item.title}"?`);
        if (!confirmed) return;
        await NotificationsService.deleteAdmin(item.id);
        showToast('aviso eliminado');
        void renderNotificationsAdminList(container);
      })(),
      'no se pudo eliminar el aviso',
    );
  });

  const actions = createEl('div', { className: 'admin-acciones' }, tag, select, deleteButton);
  return createEl('div', { className: 'admin-item' }, info, actions);
}

/** Modal de alta: título + mensaje + estado inicial (borrador/publicado). */
export function openNuevoAvisoModal(onCreated: () => void): void {
  let titulo = '';
  let mensaje = '';
  let estado = 'draft';

  const tituloField = createInput({
    label: 'titulo',
    placeholder: 'titulo del aviso',
    required: true,
    onInput: (v) => { titulo = v; },
  });
  const mensajeField = createTextarea({
    label: 'mensaje',
    placeholder: 'mensaje del aviso',
    rows: 4,
    onInput: (v) => { mensaje = v; },
  });
  const estadoField = createSelect({
    label: 'estado',
    options: [
      { value: 'draft', label: 'borrador' },
      { value: 'published', label: 'publicado' },
    ],
    value: estado,
    onChange: (v) => { estado = v; },
  });
  const feedback = createEl('p', { className: 'modal-feedback', role: 'status' });

  const btnCancelar = createEl('button', { type: 'button', className: 'boton', textContent: 'cancelar' });
  const btnCrear = createEl('button', { type: 'button', className: 'boton', textContent: 'crear aviso' });
  const acciones = createEl('div', { className: 'modal-acciones' }, btnCancelar, btnCrear);

  const modal = createModal({
    titulo: 'nuevo aviso',
    contenido: [tituloField, mensajeField, estadoField, feedback, acciones],
    ancho: '420px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnCrear.addEventListener('click', () => {
    if (!titulo.trim() || !mensaje.trim()) {
      feedback.textContent = 'completa titulo y mensaje.';
      return;
    }
    btnCrear.disabled = true;
    feedback.textContent = 'guardando...';
    void safeRun(
      NotificationsService.createAdmin({
        kind: 'manual',
        title: titulo.trim(),
        body: mensaje.trim(),
        status: estado as 'draft' | 'published',
      }),
      'no se pudo crear el aviso',
    ).then((result) => {
      btnCrear.disabled = false;
      if (!result.ok) {
        feedback.textContent = 'no se pudo crear el aviso.';
        return;
      }
      showToast('aviso creado');
      modal.close();
      onCreated();
    });
  });
}
