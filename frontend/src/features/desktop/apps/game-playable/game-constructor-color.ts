/* 138A-8 — Panel de Color del Constructor: paleta unificada del mundo.
 * 13 tokens (terreno, agua, vegetación, rocas y cielo) con picker en tiempo
 * real. Solo DOM + contrato puro de game-core: `commitPalette` valida
 * fail-closed y la escena aplica la paleta al mesher, rampa suave, agua y
 * fondo. Restaurar vuelve a los defaults del Bosque. */

import { createEl } from '../../../../utils/dom';
import {
  WORLD_PALETTE_DEFAULTS,
  WORLD_PALETTE_KEYS,
  type WorldPaletteKey,
} from '../../../game-core';
import { createColorControl, type ColorControl } from './game-constructor-controls';
import type { ConstructorPanelContext } from './game-world-constructor';

const TOKEN_LABELS: Readonly<Record<WorldPaletteKey, string>> = {
  grass: 'Hierba',
  dirt: 'Tierra',
  sand: 'Arena',
  sandSide: 'Arena lateral',
  trunk: 'Tronco',
  leaf: 'Follaje',
  leafDark: 'Follaje oscuro',
  rock: 'Roca',
  rockDark: 'Roca oscura',
  waterDeep: 'Agua profunda',
  waterShallow: 'Agua clara',
  foam: 'Espuma',
  sky: 'Cielo',
};

/** Panel Paleta: un picker por token + restaurar defaults. */
export function buildColorPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const status = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });
  const controls = new Map<WorldPaletteKey, ColorControl>();

  for (const key of WORLD_PALETTE_KEYS) {
    const control = createColorControl(TOKEN_LABELS[key], ctx.palette[key], (hex) => {
      try {
        ctx.commitPalette({ ...ctx.palette, [key]: hex });
        status.textContent = '';
      } catch (error) {
        status.textContent = error instanceof Error ? `error: ${error.message}` : 'paleta inválida';
      }
    });
    controls.set(key, control);
    container.appendChild(control.row);
  }

  const reset = createEl('button', {
    className: 'juegoPanelTerreno__boton',
    type: 'button',
    textContent: 'Restaurar paleta',
  });
  reset.addEventListener('click', () => {
    ctx.commitPalette({ ...WORLD_PALETTE_DEFAULTS });
    for (const key of WORLD_PALETTE_KEYS) controls.get(key)?.setValue(ctx.palette[key]);
    status.textContent = 'paleta por defecto';
  });
  container.appendChild(reset);
  container.appendChild(status);

  /* [138A-8] Sincronización externa (restauración al recargar): actualiza
   * los pickers sin disparar onChange. */
  ctx.syncPalette(() => {
    for (const key of WORLD_PALETTE_KEYS) controls.get(key)?.setValue(ctx.palette[key]);
  });
}
