/* 138A-10 — Panel de Pasto del Constructor: densidad, tamaño y color del
 * césped instanciado con cambios en tiempo real (debounce en la escena).
 * Solo DOM + contrato puro de game-core: `commitGrass` valida fail-closed y
 * la escena regenera el campo por chunks (solo la zona afectada al pintar). */

import { createEl } from '../../../../utils/dom';
import { GRASS_FIELD_LIMITS, type GrassFieldOptions } from '../../../game-core';
import { createColorControl, createRangeControl } from './game-constructor-controls';
import type { ConstructorPanelContext } from './game-world-constructor';

/** Panel Pasto: habilitar + densidad/tamaño/color del campo. */
export function buildGrassPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const status = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });
  const enabledCheck = createEl('label', { className: 'juegoPanelTerreno__check' });
  const enabledInput = createEl('input', { type: 'checkbox' });
  enabledInput.checked = ctx.grass.enabled ?? true;
  enabledInput.addEventListener('change', () => {
    commit({ ...ctx.grass, enabled: enabledInput.checked });
  });
  enabledCheck.append(enabledInput, document.createTextNode('Generar pasto'));
  container.appendChild(enabledCheck);

  const density = createRangeControl(
    'Densidad',
    0,
    100,
    1,
    Math.round((ctx.grass.density ?? 1) * 100),
    value => `${value}%`,
    value => commit({ ...ctx.grass, density: value / 100 }),
  );
  const size = createRangeControl(
    'Tamaño',
    GRASS_FIELD_LIMITS.minSize,
    GRASS_FIELD_LIMITS.maxSize,
    0.05,
    ctx.grass.size ?? 1,
    value => `${value.toFixed(2)}u`,
    value => commit({ ...ctx.grass, size: value }),
  );
  const color = createColorControl(
    'Color',
    ctx.grass.color ?? 0x86c65c,
    hex => commit({ ...ctx.grass, color: hex }),
  );
  container.append(density.row, size.row, color.row, status);

  function commit(next: GrassFieldOptions): void {
    try {
      ctx.commitGrass(next);
      status.textContent = '';
    } catch (error) {
      status.textContent = error instanceof Error ? `error: ${error.message}` : 'opciones de pasto inválidas';
    }
  }

  /* Sincronización externa (restauración al recargar): actualiza los
   * controles sin disparar onChange. */
  ctx.syncGrass(() => {
    enabledInput.checked = ctx.grass.enabled ?? true;
    density.setValue(Math.round((ctx.grass.density ?? 1) * 100));
    size.setValue(ctx.grass.size ?? 1);
    color.setValue(ctx.grass.color ?? 0x86c65c);
  });
}
