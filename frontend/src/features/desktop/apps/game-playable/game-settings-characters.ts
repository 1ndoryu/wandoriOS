/* GAME-01 — Tab de personajes del panel de configuración del Bosque.
 * [297A-63] Lista el catálogo (activos/inactivos), permite alta/edición y
 * estado, y muestra la actividad de personajes aislada. SRP: solo catálogo
 * de personajes; el armado del panel vive en game-settings. */

import { safeRun } from '../../../../utils/safe-async';
import { tryCatch } from '../../../../utils/result';
import {
  GameCharacterAdminService,
  isValidAdminId,
  isValidAdminLabel,
  type GameCharacterAdminEntry,
} from '../../../../services/game-character-admin.service';
import { GameAuditService } from '../../../../services/game-audit.service';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';
import { createModal } from '../../../../components/ui/modal';
import { createInput } from '../../../../components/ui/input';
import { createSelect } from '../../../../components/ui/select';
import { showToast } from '../../../../components/ui/toast';
import { showConfirm } from '../../../../components/ui/confirm';
import { renderActividad } from './game-settings-activity';

const TONO_ETIQUETA: Record<string, string> = {
  ink: 'ink',
  middle: 'middle',
  paper: 'paper',
};

const TONE_OPTIONS = [
  { value: 'ink', label: 'ink' },
  { value: 'middle', label: 'middle' },
  { value: 'paper', label: 'paper' },
];

const gameCharacterListGenerations = new WeakMap<HTMLElement, number>();

/** Invalida cargas pendientes del listado (teardown del panel). */
export function invalidatePersonajesLista(container: HTMLElement): void {
  gameCharacterListGenerations.delete(container);
}

function tonoLabel(entry: GameCharacterAdminEntry): string {
  return TONO_ETIQUETA[entry.bodyTone] ?? entry.bodyTone;
}

/** Renderiza el listado de personajes (activas e inactivas) con guard de
 * generación: si la vista se desmonta mientras carga, no toca el DOM. */
export async function renderPersonajes(container: HTMLElement): Promise<void> {
  const generation = (gameCharacterListGenerations.get(container) ?? 0) + 1;
  gameCharacterListGenerations.set(container, generation);
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const result = await tryCatch(GameCharacterAdminService.listAll());
  if (gameCharacterListGenerations.get(container) !== generation) return;
  container.textContent = '';
  if (!result.ok) {
    container.appendChild(createVacio('error al cargar el catálogo de personajes'));
    return;
  }

  const auditResult = await tryCatch(GameAuditService.listCharacterEvents({ limit: 10 }));
  if (gameCharacterListGenerations.get(container) !== generation) return;

  for (const item of result.value) {
    container.appendChild(renderPersonajeItem(item, container));
  }
  if (result.value.length === 0) {
    container.appendChild(createVacio('no hay personajes en el catálogo'));
  }
  container.appendChild(renderActividad(auditResult, 'actividad'));
}

function renderPersonajeItem(entry: GameCharacterAdminEntry, container: HTMLElement): HTMLElement {
  const tag = createEl('span', {
    className: 'tag-estado',
    textContent: entry.isActive ? 'activo' : 'inactivo',
  });
  const info = createEl('div', {},
    createEl('span', { textContent: entry.displayName }),
    createEl('small', { className: 'ml-sm', textContent: ` — ${tonoLabel(entry)}` }),
  );

  const editButton = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'editar',
  });
  editButton.addEventListener('click', () => openEditarPersonajeModal(entry, () => {
    void renderPersonajes(container);
  }));

  const toggleButton = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: entry.isActive ? 'desactivar' : 'reactivar',
  });
  toggleButton.addEventListener('click', () => {
    void safeRun((async () => {
      if (entry.isActive) {
        const confirmed = await showConfirm(`desactivar "${entry.displayName}"?`);
        if (!confirmed) return;
      }
      await GameCharacterAdminService.update(entry.id, {
        displayName: entry.displayName,
        bodyTone: entry.bodyTone,
        isActive: !entry.isActive,
      });
      showToast(entry.isActive ? 'personaje desactivado' : 'personaje reactivado');
      void renderPersonajes(container);
    })(), 'no se pudo actualizar el estado del personaje');
  });

  const actions = createEl('div', { className: 'admin-acciones' }, tag, editButton, toggleButton);
  return createEl('div', { className: 'admin-item' }, info, actions);
}

/** Modal de alta de personaje: id (slug allowlisted) + etiqueta + tono. */
export function openNuevoPersonajeModal(onCreated: () => void): void {
  let id = '';
  let displayName = '';
  let bodyTone = 'ink';

  const idField = createInput({
    label: 'id (a-z, 0-9, guiones)',
    placeholder: 'forest-ranger',
    required: true,
    onInput: (v) => { id = v; },
  });
  const nameField = createInput({
    label: 'etiqueta visible',
    placeholder: 'Guardabosques',
    required: true,
    onInput: (v) => { displayName = v; },
  });
  const toneField = createSelect({
    label: 'tono de cuerpo',
    options: TONE_OPTIONS,
    value: bodyTone,
    onChange: (v) => { bodyTone = v; },
  });
  const feedback = createEl('p', { className: 'modal-feedback', role: 'status' });

  const btnCancelar = createEl('button', { type: 'button', className: 'boton', textContent: 'cancelar' });
  const btnCrear = createEl('button', { type: 'button', className: 'boton', textContent: 'crear personaje' });
  const acciones = createEl('div', { className: 'modal-acciones' }, btnCancelar, btnCrear);

  const modal = createModal({
    titulo: 'nuevo personaje',
    contenido: [idField, nameField, toneField, feedback, acciones],
    ancho: '420px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnCrear.addEventListener('click', () => {
    const cleanId = id.trim();
    const cleanName = displayName.trim();
    if (!isValidAdminId(cleanId)) {
      feedback.textContent = 'id no válido: solo minúsculas, dígitos y guiones (máx 32).';
      return;
    }
    if (!isValidAdminLabel(cleanName)) {
      feedback.textContent = 'etiqueta no válida: entre 1 y 48 caracteres, sin saltos de línea.';
      return;
    }
    btnCrear.disabled = true;
    feedback.textContent = 'guardando...';
    void safeRun(
      GameCharacterAdminService.create({
        id: cleanId,
        displayName: cleanName,
        bodyTone: bodyTone as GameCharacterAdminEntry['bodyTone'],
      }),
      'no se pudo crear el personaje',
    ).then((result) => {
      btnCrear.disabled = false;
      if (!result.ok) {
        feedback.textContent = 'no se pudo crear el personaje (¿id duplicado?).';
        return;
      }
      showToast('personaje creado');
      modal.close();
      onCreated();
    });
  });
}

/** Modal de edición de personaje: etiqueta + tono + estado (id inmutable). */
export function openEditarPersonajeModal(entry: GameCharacterAdminEntry, onSaved: () => void): void {
  let displayName = entry.displayName;
  let bodyTone = entry.bodyTone;
  let isActive = entry.isActive;

  const nameField = createInput({
    label: 'etiqueta visible',
    value: entry.displayName,
    required: true,
    onInput: (v) => { displayName = v; },
  });
  const toneField = createSelect({
    label: 'tono de cuerpo',
    options: TONE_OPTIONS,
    value: entry.bodyTone,
    onChange: (v) => { bodyTone = v as GameCharacterAdminEntry['bodyTone']; },
  });
  const stateField = createSelect({
    label: 'estado',
    options: [
      { value: 'true', label: 'activo' },
      { value: 'false', label: 'inactivo' },
    ],
    value: String(entry.isActive),
    onChange: (v) => { isActive = v === 'true'; },
  });
  const feedback = createEl('p', { className: 'modal-feedback', role: 'status' });

  const btnCancelar = createEl('button', { type: 'button', className: 'boton', textContent: 'cancelar' });
  const btnGuardar = createEl('button', { type: 'button', className: 'boton', textContent: 'guardar' });
  const acciones = createEl('div', { className: 'modal-acciones' }, btnCancelar, btnGuardar);

  const modal = createModal({
    titulo: `editar ${entry.id}`,
    contenido: [nameField, toneField, stateField, feedback, acciones],
    ancho: '420px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnGuardar.addEventListener('click', () => {
    const cleanName = displayName.trim();
    if (!isValidAdminLabel(cleanName)) {
      feedback.textContent = 'etiqueta no válida: entre 1 y 48 caracteres, sin saltos de línea.';
      return;
    }
    btnGuardar.disabled = true;
    feedback.textContent = 'guardando...';
    void safeRun(
      GameCharacterAdminService.update(entry.id, {
        displayName: cleanName,
        bodyTone,
        isActive,
      }),
      'no se pudo guardar el personaje',
    ).then((result) => {
      btnGuardar.disabled = false;
      if (!result.ok) {
        feedback.textContent = 'no se pudo guardar el personaje.';
        return;
      }
      showToast('personaje actualizado');
      modal.close();
      onSaved();
    });
  });
}
