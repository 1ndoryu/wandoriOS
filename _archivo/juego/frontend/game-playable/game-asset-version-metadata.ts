/* GAME-01 — Modal de metadata de una versión NO activa de asset (Assets 3D,
 * 297A-73). Solo permite campos allowlisted (proxy/scale) y valida en el
 * boundary antes de llamar al servicio. SRP: formulario; el panel de
 * versiones vive en game-asset-versions. */

import { tryCatch } from '../../../../utils/result';
import { createEl } from '../../../../utils/dom';
import { createModal } from '../../../../components/ui/modal';
import { createInput } from '../../../../components/ui/input';
import { createSelect } from '../../../../components/ui/select';
import { showToast } from '../../../../components/ui/toast';
import {
  GameAssetAdminService,
  type GameAssetVersionAdminEntry,
} from '../../../../services/game-asset-admin.service';

/** Modal de metadata de una versión NO activa (proxy/scale allowlisted). */
export function openVersionMetadataModal(
  version: GameAssetVersionAdminEntry,
  onSaved: () => void,
): void {
  let kind: 'circle' | 'aabb' = version.proxy?.kind ?? 'circle';
  let radius = String(version.proxy?.kind === 'circle' ? (version.proxy.radius ?? 0.5) : 0.5);
  let halfWidth = String(version.proxy?.kind === 'aabb' ? (version.proxy.halfWidth ?? 1) : 1);
  let halfDepth = String(version.proxy?.kind === 'aabb' ? (version.proxy.halfDepth ?? 1) : 1);
  let scale = String(version.scale);
  let sinProxy = version.proxy === null;

  const sinProxyField = createSelect({
    label: 'proxy de colisión',
    options: [
      { value: 'false', label: 'con proxy' },
      { value: 'true', label: 'sin proxy' },
    ],
    value: String(sinProxy),
    onChange: (v) => { sinProxy = v === 'true'; refreshProxyFields(); },
  });
  const kindField = createSelect({
    label: 'tipo de proxy',
    options: [
      { value: 'circle', label: 'circle' },
      { value: 'aabb', label: 'aabb' },
    ],
    value: kind,
    onChange: (v) => { kind = v as 'circle' | 'aabb'; refreshProxyFields(); },
  });
  const radiusField = createInput({
    label: 'radio (circle)',
    value: radius,
    onInput: (v) => { radius = v; },
  });
  const halfWidthField = createInput({
    label: 'halfWidth (aabb)',
    value: halfWidth,
    onInput: (v) => { halfWidth = v; },
  });
  const halfDepthField = createInput({
    label: 'halfDepth (aabb)',
    value: halfDepth,
    onInput: (v) => { halfDepth = v; },
  });
  const scaleField = createInput({
    label: 'escala (0.1 – 4)',
    value: scale,
    onInput: (v) => { scale = v; },
  });
  const feedback = createEl('p', { className: 'modal-feedback', role: 'status' });

  const refreshProxyFields = (): void => {
    radiusField.hidden = sinProxy || kind !== 'circle';
    halfWidthField.hidden = sinProxy || kind !== 'aabb';
    halfDepthField.hidden = sinProxy || kind !== 'aabb';
    kindField.hidden = sinProxy;
  };
  refreshProxyFields();

  const btnCancelar = createEl('button', { type: 'button', className: 'boton', textContent: 'cancelar' });
  const btnGuardar = createEl('button', { type: 'button', className: 'boton', textContent: 'guardar' });
  const acciones = createEl('div', { className: 'modal-acciones' }, btnCancelar, btnGuardar);

  const modal = createModal({
    titulo: `metadata · v${version.version}`,
    contenido: [sinProxyField, kindField, radiusField, halfWidthField, halfDepthField, scaleField, feedback, acciones],
    ancho: '440px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnGuardar.addEventListener('click', () => {
    const scaleNumber = Number(scale);
    if (!Number.isFinite(scaleNumber) || scaleNumber < 0.1 || scaleNumber > 4) {
      feedback.textContent = 'escala fuera de rango (0.1 – 4).';
      return;
    }
    let proxy: GameAssetVersionAdminEntry['proxy'] = null;
    if (!sinProxy) {
      if (kind === 'circle') {
        const r = Number(radius);
        if (!Number.isFinite(r) || r <= 0) {
          feedback.textContent = 'radio inválido.';
          return;
        }
        proxy = { kind: 'circle', radius: r };
      } else {
        const w = Number(halfWidth);
        const d = Number(halfDepth);
        if (!Number.isFinite(w) || !Number.isFinite(d) || w <= 0 || d <= 0) {
          feedback.textContent = 'halfWidth/halfDepth inválidos.';
          return;
        }
        proxy = { kind: 'aabb', halfWidth: w, halfDepth: d };
      }
    }
    btnGuardar.disabled = true;
    feedback.textContent = 'guardando...';
    void tryCatch(
      GameAssetAdminService.updateVersionMetadata(version.assetId, version.version, {
        proxy,
        scale: scaleNumber,
      }),
    ).then((result) => {
      btnGuardar.disabled = false;
      if (!result.ok) {
        feedback.textContent = 'no se pudo guardar la metadata (¿versión ya activa?).';
        return;
      }
      showToast('metadata guardada');
      modal.close();
      onSaved();
    });
  });
}
