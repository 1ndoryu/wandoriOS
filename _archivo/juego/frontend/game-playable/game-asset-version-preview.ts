/* GAME-01 — Preview 3D aislado de una versión de asset (Assets 3D, 297A-73).
 * Descarga el GLB servido por el backend y lo muestra en un modal; el handle
 * WebGL se destruye al cerrar por cualquier vía. SRP: solo preview; el panel
 * de versiones vive en game-asset-versions. */

import { tryCatch } from '../../../../utils/result';
import { createEl } from '../../../../utils/dom';
import { createModal } from '../../../../components/ui/modal';
import {
  GameAssetAdminService,
  type GameAssetAdminEntry,
  type GameAssetVersionAdminEntry,
} from '../../../../services/game-asset-admin.service';
import { createGameAssetPreview } from './game-asset-preview';
import { formatSummary } from './game-asset-version-format';

/** Preview 3D aislado de una versión: descarga el GLB y lo muestra. */
export function openVersionPreview(
  version: GameAssetVersionAdminEntry,
  entry: GameAssetAdminEntry,
): void {
  const host = createEl('div', { className: 'asset-preview-host' });
  const resumen = createEl('p', { className: 'modal-feedback', role: 'status', textContent: 'cargando GLB...' });
  const btnCerrar = createEl('button', { type: 'button', className: 'boton', textContent: 'cerrar' });

  let previewDestroyed = false;
  const modal = createModal({
    titulo: `preview 3D · v${version.version} · ${entry.displayName}`,
    contenido: [host, resumen, btnCerrar],
    ancho: '720px',
    /* [297A-73] Cerrar por backdrop/Escape también destruye el handle WebGL. */
    onClose: () => {
      if (previewDestroyed) return;
      previewDestroyed = true;
      controller.abort();
      preview.destroy();
    },
  });

  const preview = createGameAssetPreview(host);
  const controller = new AbortController();
  const closePreview = (): void => modal.close();

  void (async () => {
    const blobResult = await tryCatch(
      GameAssetAdminService.readVersionFile(entry.id, version.version, { signal: controller.signal }),
    );
    if (controller.signal.aborted) return;
    if (!blobResult.ok) {
      resumen.textContent = 'no se pudo leer el GLB de esta versión.';
      return;
    }
    const loadResult = await tryCatch(preview.load(blobResult.value));
    if (controller.signal.aborted) return;
    if (!loadResult.ok) {
      resumen.textContent = 'no se pudo interpretar el GLB (¿archivo corrupto?).';
      return;
    }
    resumen.textContent = formatSummary(loadResult.value);
  })();

  btnCerrar.addEventListener('click', closePreview);
}
