/* GAME-01 — Tab de assets del panel de configuración del Bosque.
 * [297A-63] Lista el catálogo (activos/inactivos), permite alta/edición,
 * estado y abre el panel de versiones 3D (297A-73), con actividad de assets
 * aislada. SRP: solo catálogo de assets; el armado del panel vive en
 * game-settings. */

import { safeRun } from '../../../../utils/safe-async';
import { tryCatch } from '../../../../utils/result';
import {
  GameAssetAdminService,
  GAME_ASSET_CATEGORIES,
  isValidAdminAssetId,
  isValidAdminAssetLabel,
  type GameAssetAdminEntry,
} from '../../../../services/game-asset-admin.service';
import { GameAuditService } from '../../../../services/game-audit.service';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';
import { createModal } from '../../../../components/ui/modal';
import { createInput } from '../../../../components/ui/input';
import { createSelect } from '../../../../components/ui/select';
import { showToast } from '../../../../components/ui/toast';
import { showConfirm } from '../../../../components/ui/confirm';
import { openAssetVersionsPanel } from './game-asset-versions';
import { renderActividad } from './game-settings-activity';

const CATEGORY_OPTIONS = GAME_ASSET_CATEGORIES.map((category) => ({ value: category, label: category }));

const gameAssetListGenerations = new WeakMap<HTMLElement, number>();

/** Invalida cargas pendientes del listado (teardown del panel). */
export function invalidateAssetsLista(container: HTMLElement): void {
  gameAssetListGenerations.delete(container);
}

/** Renderiza el listado de assets (activas e inactivas) con guard propio y
 * actividad de assets aislada en paralelo. */
export async function renderAssets(container: HTMLElement): Promise<void> {
  const generation = (gameAssetListGenerations.get(container) ?? 0) + 1;
  gameAssetListGenerations.set(container, generation);
  container.textContent = '';
  container.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));

  const result = await tryCatch(GameAssetAdminService.listAll());
  if (gameAssetListGenerations.get(container) !== generation) return;
  container.textContent = '';
  if (!result.ok) {
    container.appendChild(createVacio('error al cargar el catálogo de assets'));
    return;
  }

  const auditResult = await tryCatch(GameAuditService.listAssetEvents({ limit: 10 }));
  if (gameAssetListGenerations.get(container) !== generation) return;

  for (const item of result.value) {
    container.appendChild(renderAssetItem(item, container));
  }
  if (result.value.length === 0) {
    container.appendChild(createVacio('no hay assets en el catálogo'));
  }
  container.appendChild(renderActividad(auditResult, 'actividad'));
}

function renderAssetItem(entry: GameAssetAdminEntry, container: HTMLElement): HTMLElement {
  const tag = createEl('span', {
    className: 'tag-estado',
    textContent: entry.isActive ? 'activo' : 'inactivo',
  });
  const info = createEl('div', {},
    createEl('span', { textContent: entry.displayName }),
    createEl('small', { className: 'ml-sm', textContent: ` — ${entry.category}` }),
  );

  const editButton = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'editar',
  });
  editButton.addEventListener('click', () => openEditarAssetModal(entry, () => {
    void renderAssets(container);
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
      await GameAssetAdminService.update(entry.id, {
        displayName: entry.displayName,
        category: entry.category,
        isActive: !entry.isActive,
      });
      showToast(entry.isActive ? 'asset desactivado' : 'asset reactivado');
      void renderAssets(container);
    })(), 'no se pudo actualizar el estado del asset');
  });

  /* [297A-73] Panel de versiones 3D (import GLB, preview, metadata, activar). */
  const versionsButton = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'versiones 3D',
  });
  versionsButton.addEventListener('click', () => {
    openAssetVersionsPanel(entry, () => {
      void renderAssets(container);
    });
  });

  const actions = createEl('div', { className: 'admin-acciones' }, tag, editButton, toggleButton, versionsButton);
  return createEl('div', { className: 'admin-item' }, info, actions);
}

/** Modal de alta de asset: id + etiqueta + categoría; nace activo. */
export function openNuevoAssetModal(onCreated: () => void): void {
  let id = '';
  let displayName = '';
  let category = 'tree';

  const idField = createInput({
    label: 'id (a-z, 0-9, guiones)',
    placeholder: 'roble',
    required: true,
    onInput: (v) => { id = v; },
  });
  const nameField = createInput({
    label: 'etiqueta visible',
    placeholder: 'Roble',
    required: true,
    onInput: (v) => { displayName = v; },
  });
  const categoryField = createSelect({
    label: 'categoría',
    options: CATEGORY_OPTIONS,
    value: category,
    onChange: (v) => { category = v; },
  });
  const feedback = createEl('p', { className: 'modal-feedback', role: 'status' });

  const btnCancelar = createEl('button', { type: 'button', className: 'boton', textContent: 'cancelar' });
  const btnCrear = createEl('button', { type: 'button', className: 'boton', textContent: 'crear asset' });
  const acciones = createEl('div', { className: 'modal-acciones' }, btnCancelar, btnCrear);

  const modal = createModal({
    titulo: 'nuevo asset',
    contenido: [idField, nameField, categoryField, feedback, acciones],
    ancho: '420px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnCrear.addEventListener('click', () => {
    const cleanId = id.trim();
    const cleanName = displayName.trim();
    if (!isValidAdminAssetId(cleanId)) {
      feedback.textContent = 'id no válido: solo minúsculas, dígitos y guiones (máx 48).';
      return;
    }
    if (!isValidAdminAssetLabel(cleanName)) {
      feedback.textContent = 'etiqueta no válida: entre 1 y 64 caracteres, sin saltos de línea.';
      return;
    }
    btnCrear.disabled = true;
    feedback.textContent = 'guardando...';
    void safeRun(
      GameAssetAdminService.create({ id: cleanId, displayName: cleanName, category }),
      'no se pudo crear el asset',
    ).then((result) => {
      btnCrear.disabled = false;
      if (!result.ok) {
        feedback.textContent = 'no se pudo crear el asset (¿id duplicado?).';
        return;
      }
      showToast('asset creado');
      modal.close();
      onCreated();
    });
  });
}

/** Modal de edición de asset: etiqueta + categoría + estado (id inmutable). */
export function openEditarAssetModal(entry: GameAssetAdminEntry, onSaved: () => void): void {
  let displayName = entry.displayName;
  let category = entry.category;
  let isActive = entry.isActive;

  const nameField = createInput({
    label: 'etiqueta visible',
    value: entry.displayName,
    required: true,
    onInput: (v) => { displayName = v; },
  });
  const categoryField = createSelect({
    label: 'categoría',
    options: CATEGORY_OPTIONS,
    value: entry.category,
    onChange: (v) => { category = v; },
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
    contenido: [nameField, categoryField, stateField, feedback, acciones],
    ancho: '420px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnGuardar.addEventListener('click', () => {
    const cleanName = displayName.trim();
    if (!isValidAdminAssetLabel(cleanName)) {
      feedback.textContent = 'etiqueta no válida: entre 1 y 64 caracteres, sin saltos de línea.';
      return;
    }
    btnGuardar.disabled = true;
    feedback.textContent = 'guardando...';
    void safeRun(
      GameAssetAdminService.update(entry.id, { displayName: cleanName, category, isActive }),
      'no se pudo guardar el asset',
    ).then((result) => {
      btnGuardar.disabled = false;
      if (!result.ok) {
        feedback.textContent = 'no se pudo guardar el asset.';
        return;
      }
      showToast('asset actualizado');
      modal.close();
      onSaved();
    });
  });
}
