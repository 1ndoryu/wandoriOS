/* 138A-15 — Panel de Estilo del Constructor: conmutador Bosque/Sakura y
 * toggle de tinta (outlines screen-space). Solo DOM + contrato puro de
 * game-core: `commitStyle` valida fail-closed y la escena reaplica luces,
 * rampa, cielo, sombras y pipeline. El estilo sakura deja la tinta OFF por
 * defecto (decisión 13-ago: el Bosque nunca lleva tinta; sakura la ofrece
 * como ajuste opcional con el toggle). */

import { createEl } from '../../../../utils/dom';
import {
  type VisualStyleKey,
  type VisualStyleSettings,
} from './game-sakura-preset';
import { createSegmentControl } from './game-constructor-controls';
import type { ConstructorPanelContext } from './game-world-constructor';

const STYLE_OPTIONS: readonly { readonly key: VisualStyleKey; readonly label: string }[] = [
  { key: 'bosque', label: 'Bosque' },
  { key: 'sakura', label: 'Sakura' },
];

/** Panel Estilo: segmento Bosque/Sakura + tinta. */
export function buildStylePanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const status = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });
  const commit = (next: VisualStyleSettings): void => {
    try {
      ctx.commitStyle(next);
      status.textContent = '';
    } catch (error) {
      status.textContent = error instanceof Error ? `error: ${error.message}` : 'estilo visual inválido';
    }
  };

  /* --- Estilo: Bosque (default histórico) vs Sakura Crossing --- */
  const presets = createSegmentControl<VisualStyleKey>(
    STYLE_OPTIONS,
    ctx.style.key,
    (key) => commit({ key, ink: key === 'sakura' ? ctx.style.ink : false }),
  );
  container.appendChild(presets.container);

  /* --- Tinta: outlines screen-space (solo tiene efecto en sakura) --- */
  const inkCheck = createEl('label', { className: 'juegoPanelTerreno__check' });
  const inkInput = createEl('input', { type: 'checkbox' });
  inkInput.checked = ctx.style.ink;
  inkInput.addEventListener('change', () => {
    commit({ key: ctx.style.key, ink: inkInput.checked });
  });
  inkCheck.append(inkInput, document.createTextNode('Tinta (outlines)'));
  container.appendChild(inkCheck);

  const estado = createEl('p', { className: 'juegoPanelTerreno__tituloGrupo', textContent: '' });
  const refreshState = (): void => {
    estado.textContent = ctx.style.key === 'sakura'
      ? `Sakura Crossing${ctx.style.ink ? ' · tinta activa' : ''}`
      : 'Bosque (toon 4 bandas)';
  };
  refreshState();
  container.append(estado, status);

  /* Sincronización externa (restauración al recargar): actualiza los
   * controles sin disparar onChange. */
  ctx.syncStyle(() => {
    presets.setActive(ctx.style.key);
    inkInput.checked = ctx.style.ink;
    refreshState();
  });
}
