/* GAME-01 — Panel de versiones de Assets 3D (Assets 3D, 297A-73).
 * Lista las versiones GLB de un asset, importa una nueva (multipart), activa
 * una versión y abre los sub-modales de preview/metadata. SRP: este módulo es
 * la UI del listado; el preview vive en game-asset-version-preview, el
 * formulario de metadata en game-asset-version-metadata y los formateadores
 * en game-asset-version-format. */

import { tryCatch } from '../../../../utils/result';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';
import { createModal } from '../../../../components/ui/modal';
import { showToast } from '../../../../components/ui/toast';
import { showConfirm } from '../../../../components/ui/confirm';
import {
  GameAssetAdminService,
  GAME_ASSET_GLB_MAX_BYTES,
  type GameAssetAdminEntry,
  type GameAssetVersionAdminEntry,
} from '../../../../services/game-asset-admin.service';
import { openVersionPreview } from './game-asset-version-preview';
import { openVersionMetadataModal } from './game-asset-version-metadata';
import { formatBytes, formatFecha } from './game-asset-version-format';

/** Abre el panel de versiones de un asset (modal del OS). */
export function openAssetVersionsPanel(entry: GameAssetAdminEntry, onChanged: () => void): void {
  const lista = createEl('div', { className: 'admin-lista' });
  const hint = createEl('p', { className: 'modal-feedback', role: 'status' });

  const btnCerrar = createEl('button', { type: 'button', className: 'boton', textContent: 'cerrar' });
  const fileInput = createEl('input', {
    type: 'file',
    accept: '.glb,model/gltf-binary',
    className: 'file-input',
  });
  const btnImportar = createEl('button', {
    type: 'button',
    className: 'boton',
    textContent: '+ importar GLB',
  });
  const importarAccion = createEl('div', { className: 'admin-acciones' }, btnImportar, fileInput);

  const modal = createModal({
    titulo: `versiones de "${entry.displayName}"`,
    contenido: [hint, importarAccion, lista],
    ancho: '760px',
  });

  let generation = 0;

  const render = async (): Promise<void> => {
    const current = ++generation;
    lista.textContent = '';
    lista.appendChild(createEl('p', { className: 'cargando', textContent: 'cargando...' }));
    const result = await tryCatch(GameAssetAdminService.listVersions(entry.id));
    if (generation !== current) return;
    lista.textContent = '';
    if (!result.ok) {
      lista.appendChild(createVacio('error al cargar las versiones'));
      return;
    }
    if (result.value.length === 0) {
      lista.appendChild(createVacio('sin versiones todavía: importa un GLB'));
    }
    for (const version of result.value) {
      lista.appendChild(renderVersionItem(version, entry, () => {
        void render();
        onChanged();
      }));
    }
  };

  btnImportar.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > GAME_ASSET_GLB_MAX_BYTES) {
      hint.textContent = 'el GLB supera el tamaño máximo (16 MiB).';
      return;
    }
    btnImportar.disabled = true;
    hint.textContent = 'importando...';
    void tryCatch(GameAssetAdminService.importVersion(entry.id, file)).then((result) => {
      btnImportar.disabled = false;
      fileInput.value = '';
      if (!result.ok) {
        hint.textContent = 'no se pudo importar el GLB (¿archivo inválido?).';
        return;
      }
      hint.textContent = 'GLB importado como v' + String(result.value.version) + '.';
      showToast('versión importada');
      void render();
      onChanged();
    });
  });

  btnCerrar.addEventListener('click', () => modal.close());

  void render();

  /* El modal se cierra solo (backdrop/Escape); sin teardown extra porque la
   * vista de preview crea su propio handle y lo destruye al cerrar. */
}

function renderVersionItem(
  version: GameAssetVersionAdminEntry,
  entry: GameAssetAdminEntry,
  onChanged: () => void,
): HTMLElement {
  const tag = createEl('span', {
    className: 'tag-estado',
    textContent: version.isActive ? 'activa' : 'inactiva',
  });
  const info = createEl('div', { className: 'admin-item-info' },
    createEl('span', { textContent: `v${version.version} · ${formatBytes(version.byteSize)} · ${version.kind}` }),
    createEl('small', { className: 'ml-sm', textContent: formatFecha(version.createdAt) }),
  );

  const btnPreview = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'preview 3D',
  });
  btnPreview.addEventListener('click', () => {
    openVersionPreview(version, entry);
  });

  const btnMetadata = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'metadata',
  });
  btnMetadata.disabled = version.isActive;
  btnMetadata.addEventListener('click', () => {
    openVersionMetadataModal(version, onChanged);
  });

  const btnActivar = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: 'activar',
  });
  btnActivar.disabled = version.isActive;
  btnActivar.addEventListener('click', () => {
    void (async () => {
      const confirmed = await showConfirm(`activar la versión v${version.version}? La anterior queda inactiva e inmutable.`);
      if (!confirmed) return;
      const result = await tryCatch(GameAssetAdminService.activateVersion(entry.id, version.version));
      if (!result.ok) {
        showToast('no se pudo activar la versión');
        return;
      }
      showToast('versión activada');
      onChanged();
    })();
  });

  const actions = createEl('div', { className: 'admin-acciones' }, tag, btnPreview, btnMetadata, btnActivar);
  return createEl('div', { className: 'admin-item' }, info, actions);
}
