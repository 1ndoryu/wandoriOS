/* 138A-8 — Panel de Assets del Constructor: inventario del manifiesto.
 * Recuento por categoría y por asset, quitar instancias, limpiar todo y
 * arrastrar un asset al mundo para colocarlo (el drop lo resuelve la escena
 * con raycast → pickTerrain → addInstance). Solo DOM + contrato puro:
 * `commitObjectEdits` valida cuotas y bounds fail-closed. */

import { createEl } from '../../../../utils/dom';
import {
  assetInstanceCounts,
  categoryInstanceCounts,
  type AssetCategory,
} from '../../../game-core';
import {
  hasRealAssetMesh,
  requestAssetThumbnail,
} from './game-asset-thumbnails';
import type { ConstructorPanelContext } from './game-world-constructor';

export const ASSET_DRAG_MIME = 'application/x-asset-version';

const CATEGORY_LABELS: Readonly<Record<AssetCategory, string>> = {
  terrain: 'Terreno',
  tree: 'Árboles',
  rock: 'Rocas',
  water: 'Agua',
  character: 'Personajes',
  generic: 'Genéricos',
};

const MAX_INSTANCE_ROWS = 60;

/* [138A-9] Miniatura 2D por categoría y estilo: el panel no carga modelos,
 * así que el thumbnail es un glifo monocromo (tokens B&W del OS) que cambia
 * entre bloques y suave. Si no hay canvas 2D (jsdom/headless) se omite sin
 * romper el panel. */
function drawAssetThumbnail(
  canvas: HTMLCanvasElement,
  category: AssetCategory,
  style: 'bloques' | 'suave',
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const size = canvas.width;
  context.clearRect(0, 0, size, size);
  const ink = getComputedStyle(canvas).getPropertyValue('--sistema-texto').trim() || '#111111';
  const paper = getComputedStyle(canvas).getPropertyValue('--sistema-superficie').trim() || '#ffffff';
  context.fillStyle = paper;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = ink;
  context.lineWidth = 2;
  const isBlock = style === 'bloques';
  if (category === 'tree') {
    /* Conífera: tronco + copa triangular (bloques) o cúpula (suave). */
    context.beginPath();
    context.moveTo(size / 2, 12);
    context.lineTo(14, 30);
    context.lineTo(size - 14, 30);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(size / 2 - 3, 40);
    context.lineTo(size / 2 + 3, 40);
    context.lineTo(size / 2 + 3, 48);
    context.lineTo(size / 2 - 3, 48);
    context.closePath();
    context.stroke();
  } else if (category === 'rock') {
    context.beginPath();
    if (isBlock) {
      context.rect(16, 22, 24, 20);
    } else {
      context.moveTo(16, 42);
      context.lineTo(20, 28);
      context.lineTo(30, 22);
      context.lineTo(38, 30);
      context.lineTo(42, 42);
    }
    context.closePath();
    context.stroke();
  } else if (category === 'terrain') {
    context.beginPath();
    if (isBlock) {
      context.rect(12, 34, 32, 12);
    } else {
      context.moveTo(10, 38);
      context.quadraticCurveTo(28, 16, 46, 38);
    }
    context.stroke();
  } else if (category === 'water') {
    context.beginPath();
    context.moveTo(12, 30);
    context.quadraticCurveTo(20, 24, 28, 30);
    context.quadraticCurveTo(36, 36, 44, 30);
    context.stroke();
    context.beginPath();
    context.moveTo(12, 40);
    context.quadraticCurveTo(20, 34, 28, 40);
    context.quadraticCurveTo(36, 46, 44, 40);
    context.stroke();
  } else if (category === 'character') {
    context.beginPath();
    context.arc(size / 2, 20, 7, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(16, 48);
    context.lineTo(size / 2, 32);
    context.lineTo(size - 16, 48);
    context.stroke();
  } else {
    context.beginPath();
    if (isBlock) context.rect(16, 16, 24, 24);
    else context.arc(size / 2, 28, 12, 0, Math.PI * 2);
    context.stroke();
  }
}

/** Panel Assets: inventario del mundo con drag para colocar y quitar. */
export function buildAssetsPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const status = createEl('p', {
    className: 'juegoPanelTerreno__statsLine',
    textContent: 'Arrastra un asset al mundo para colocarlo.',
  });
  const list = createEl('div', { className: 'juegoConstructor__assets' });
  container.appendChild(list);
  container.appendChild(status);

  const render = (): void => {
    list.textContent = '';
    const map = ctx.worldMap;
    if (!map) {
      list.appendChild(createEl('p', {
        className: 'juegoPanelTerreno__statsLine',
        textContent: 'Genera o importa un mundo para ver sus assets.',
      }));
      return;
    }
    const byAsset = assetInstanceCounts(map);
    const byCategory = categoryInstanceCounts(map);
    const total = map.instances.length;
    list.appendChild(createEl('p', {
      className: 'juegoPanelTerreno__statsLine',
      textContent: `${total} instancias · ${Object.keys(map.assetManifest).length} assets`,
    }));

    for (const category of Object.keys(CATEGORY_LABELS) as AssetCategory[]) {
      const count = byCategory[category];
      const row = createEl('div', { className: 'juegoConstructor__assetFila' });
      const label = createEl('span', {
        className: 'juegoConstructor__assetNombre',
        textContent: `${CATEGORY_LABELS[category]} · ${count}`,
      });
      row.appendChild(label);
      if (count > 0) {
        const quitar = createEl('button', {
          className: 'juegoPanelTerreno__boton juegoConstructor__assetBoton',
          type: 'button',
          textContent: 'Quitar',
        });
        quitar.addEventListener('click', () => {
          ctx.commitObjectEdits(map.instances
            .filter(instance => map.assetManifest[instance.assetVersionId]?.category === category)
            .map(instance => ({ kind: 'remove' as const, id: instance.id })));
        });
        row.appendChild(quitar);
      }
      list.appendChild(row);
    }

    /* [138A-9] Explorador en cuadrícula con miniatura por asset (estilo
     * adaptado: bloques/suave). La tarjeta es arrastrable al mundo. */
    const grid = createEl('div', { className: 'juegoConstructor__assetsGrid' });
    const style = ctx.state.style === 'suave' ? 'suave' : 'bloques';
    for (const [assetId, asset] of Object.entries(map.assetManifest)) {
      const count = byAsset[assetId] ?? 0;
      const card = createEl('div', { className: 'juegoConstructor__assetTarjeta' });
      const thumbnail = createEl('canvas', {
        className: 'juegoConstructor__assetMiniatura',
        ariaLabel: `Miniatura de ${assetId}`,
      });
      thumbnail.width = 56;
      thumbnail.height = 56;
      drawAssetThumbnail(thumbnail, asset.category, style);
      const label = createEl('span', {
        className: 'juegoConstructor__assetNombre',
        textContent: `${assetId} · ${count}`,
        title: `${assetId} · ${asset.category}`,
      });
      card.append(thumbnail, label);
      /* [138A-14] Miniatura con el modelo 3D REAL (mismo mesher del
       * documento): el render es offscreen, lazy y cachead por asset+estilo+
       * paleta; sin WebGL se conserva el glifo 2D como fallback. El pedido
       * se hace tras anexar la tarjeta para que el caché síncrono también
       * pueda sustituir el canvas por la imagen. */
      if (hasRealAssetMesh(asset.category)) {
        requestAssetThumbnail(
          {
            assetId,
            category: asset.category,
            style,
            palette: ctx.palette,
          },
          (dataUrl) => {
            if (dataUrl && thumbnail.isConnected) {
              const image = createEl('img', {
                className: 'juegoConstructor__assetMiniatura',
                alt: `Miniatura 3D de ${assetId}`,
              });
              image.src = dataUrl;
              thumbnail.replaceWith(image);
            }
          },
        );
      }
      /* [138A-8] Arrastrar un asset al mundo coloca una instancia nueva
       * (el drop en el host lo resuelve la escena con raycast). */
      card.draggable = true;
      card.title = 'Arrastra al mundo para colocar';
      card.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData(ASSET_DRAG_MIME, assetId);
        event.dataTransfer!.effectAllowed = 'copy';
      });
      const quitar = createEl('button', {
        className: 'juegoPanelTerreno__boton juegoConstructor__assetBoton',
        type: 'button',
        textContent: count > 0 ? `Quitar ${count}` : '—',
      });
      quitar.disabled = count === 0;
      quitar.addEventListener('click', () => {
        ctx.commitObjectEdits(map.instances
          .filter(instance => instance.assetVersionId === assetId)
          .map(instance => ({ kind: 'remove' as const, id: instance.id })));
      });
      card.appendChild(quitar);
      grid.appendChild(card);
    }
    list.appendChild(grid);

    /* Instancias individuales (primeras MAX_INSTANCE_ROWS) para quitar una. */
    const instancias = map.instances.slice(0, MAX_INSTANCE_ROWS);
    for (const instance of instancias) {
      const row = createEl('div', { className: 'juegoConstructor__assetFila' });
      const label = createEl('span', {
        className: 'juegoConstructor__assetNombre',
        title: `${instance.assetVersionId} · x ${instance.position.x} z ${instance.position.z}`,
        textContent: `${instance.id} · ${instance.assetVersionId}`,
      });
      const quitar = createEl('button', {
        className: 'juegoPanelTerreno__boton juegoConstructor__assetBoton',
        type: 'button',
        textContent: 'Quitar',
      });
      quitar.addEventListener('click', () => {
        ctx.commitObjectEdits([{ kind: 'remove', id: instance.id }]);
      });
      row.append(label, quitar);
      list.appendChild(row);
    }
    if (map.instances.length > MAX_INSTANCE_ROWS) {
      list.appendChild(createEl('p', {
        className: 'juegoPanelTerreno__statsLine',
        textContent: `… y ${map.instances.length - MAX_INSTANCE_ROWS} más`,
      }));
    }

    if (total > 0) {
      const limpiar = createEl('button', {
        className: 'juegoPanelTerreno__boton',
        type: 'button',
        textContent: 'Limpiar todo',
      });
      limpiar.addEventListener('click', () => {
        ctx.commitObjectEdits(map.instances.map(instance => ({ kind: 'remove' as const, id: instance.id })));
      });
      list.appendChild(limpiar);
    }
  };

  render();
  ctx.syncMap(render);
}
