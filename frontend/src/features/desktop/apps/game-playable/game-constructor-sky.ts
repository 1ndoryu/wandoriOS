/* 138A-12 — Panel de Cielo/Ambiente del Constructor: presets de paleta,
 * posición/influencia del sol, forma y cobertura de nubes y movimiento con
 * cambios en tiempo real (debounce en la escena). Solo DOM + contrato puro
 * de game-core: `commitSky` valida fail-closed y la escena actualiza el
 * shader y las luces sincronizadas. */

import { createEl } from '../../../../utils/dom';
import {
  SKY_LIMITS,
  SKY_PRESETS,
  skyPresetOptions,
  type SkyOptions,
  type SkyPresetKey,
} from '../../../game-core';
import {
  createRangeControl,
  createSegmentControl,
} from './game-constructor-controls';
import type { ConstructorPanelContext } from './game-world-constructor';

/** Panel Ambiente: presets + sol + nubes + movimiento del skydome. */
export function buildSkyPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const status = createEl('p', { className: 'juegoPanelTerreno__statsLine', textContent: '' });
  const commit = (next: SkyOptions): void => {
    try {
      ctx.commitSky(next);
      status.textContent = '';
    } catch (error) {
      status.textContent = error instanceof Error ? `error: ${error.message}` : 'opciones de cielo inválidas';
    }
  };

  /* --- Presets: paleta de 9 colores + sol del preset, conservando el resto --- */
  const presets = createSegmentControl<SkyPresetKey>(
    SKY_PRESETS,
    ctx.sky.preset,
    (key) => commit(skyPresetOptions(key, ctx.sky)),
  );
  container.appendChild(presets.container);

  const groupSol = createEl('p', { className: 'juegoPanelTerreno__tituloGrupo', textContent: 'Sol' });
  container.appendChild(groupSol);
  const sunEl = createRangeControl(
    'Altura', SKY_LIMITS.minSunEl, SKY_LIMITS.maxSunEl, 0.5, ctx.sky.sunEl,
    value => `${Math.round(value)}°`,
    value => commit({ ...ctx.sky, sunEl: value }),
  );
  const sunAz = createRangeControl(
    'Dirección', SKY_LIMITS.minSunAz, SKY_LIMITS.maxSunAz, 1, ctx.sky.sunAz,
    value => `${Math.round(value)}°`,
    value => commit({ ...ctx.sky, sunAz: value }),
  );
  const sunInfluence = createRangeControl(
    'Influencia', SKY_LIMITS.minSunInfluence, SKY_LIMITS.maxSunInfluence, 0.01, ctx.sky.sunInfluence,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, sunInfluence: value }),
  );
  const sunSize = createRangeControl(
    'Disco', SKY_LIMITS.minSunSize, SKY_LIMITS.maxSunSize, 0.1, ctx.sky.sunSize,
    value => value.toFixed(1),
    value => commit({ ...ctx.sky, sunSize: value }),
  );
  const sunGlow = createRangeControl(
    'Resplandor', SKY_LIMITS.minSunGlow, SKY_LIMITS.maxSunGlow, 0.01, ctx.sky.sunGlow,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, sunGlow: value }),
  );
  for (const control of [sunEl, sunAz, sunInfluence, sunSize, sunGlow]) {
    container.appendChild(control.row);
  }

  const groupNubes = createEl('p', { className: 'juegoPanelTerreno__tituloGrupo', textContent: 'Nubes' });
  container.appendChild(groupNubes);
  const coverage = createRangeControl(
    'Cobertura', SKY_LIMITS.minCoverage, SKY_LIMITS.maxCoverage, 0.01, ctx.sky.coverage,
    value => `${Math.round(value * 100)}%`,
    value => commit({ ...ctx.sky, coverage: value }),
  );
  const scale = createRangeControl(
    'Tamaño', SKY_LIMITS.minScale, SKY_LIMITS.maxScale, 0.05, ctx.sky.scale,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, scale: value }),
  );
  const squash = createRangeControl(
    'Aplanar', SKY_LIMITS.minSquash, SKY_LIMITS.maxSquash, 0.05, ctx.sky.squash,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, squash: value }),
  );
  const puff = createRangeControl(
    'Suavidad', SKY_LIMITS.minPuff, SKY_LIMITS.maxPuff, 0.01, ctx.sky.puff,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, puff: value }),
  );
  const edge = createRangeControl(
    'Borde', SKY_LIMITS.minEdge, SKY_LIMITS.maxEdge, 0.002, ctx.sky.edge,
    value => value.toFixed(3),
    value => commit({ ...ctx.sky, edge: value }),
  );
  const warp = createRangeControl(
    'Rizo', SKY_LIMITS.minWarp, SKY_LIMITS.maxWarp, 0.01, ctx.sky.warp,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, warp: value }),
  );
  const octaves = createRangeControl(
    'Octavas', SKY_LIMITS.minOctaves, SKY_LIMITS.maxOctaves, 1, ctx.sky.octaves,
    value => String(Math.round(value)),
    value => commit({ ...ctx.sky, octaves: Math.round(value) }),
  );
  for (const control of [coverage, scale, squash, puff, edge, warp, octaves]) {
    container.appendChild(control.row);
  }

  const groupMovimiento = createEl('p', { className: 'juegoPanelTerreno__tituloGrupo', textContent: 'Movimiento y calima' });
  container.appendChild(groupMovimiento);
  const drift = createRangeControl(
    'Viento', SKY_LIMITS.minDrift, SKY_LIMITS.maxDrift, 0.001, ctx.sky.drift,
    value => value.toFixed(3),
    value => commit({ ...ctx.sky, drift: value }),
  );
  const evolve = createRangeControl(
    'Evolución', SKY_LIMITS.minEvolve, SKY_LIMITS.maxEvolve, 0.01, ctx.sky.evolve,
    value => value.toFixed(2),
    value => commit({ ...ctx.sky, evolve: value }),
  );
  const haze = createRangeControl(
    'Calima', SKY_LIMITS.minHaze, SKY_LIMITS.maxHaze, 0.01, ctx.sky.haze,
    value => `${Math.round(value * 100)}%`,
    value => commit({ ...ctx.sky, haze: value }),
  );
  for (const control of [drift, evolve, haze]) {
    container.appendChild(control.row);
  }

  container.appendChild(status);

  /* Sincronización externa (restauración al recargar): actualiza los
   * controles sin disparar onChange. */
  ctx.syncSky(() => {
    presets.setActive(ctx.sky.preset);
    sunEl.setValue(ctx.sky.sunEl);
    sunAz.setValue(ctx.sky.sunAz);
    sunInfluence.setValue(ctx.sky.sunInfluence);
    sunSize.setValue(ctx.sky.sunSize);
    sunGlow.setValue(ctx.sky.sunGlow);
    coverage.setValue(ctx.sky.coverage);
    scale.setValue(ctx.sky.scale);
    squash.setValue(ctx.sky.squash);
    puff.setValue(ctx.sky.puff);
    edge.setValue(ctx.sky.edge);
    warp.setValue(ctx.sky.warp);
    octaves.setValue(ctx.sky.octaves);
    drift.setValue(ctx.sky.drift);
    evolve.setValue(ctx.sky.evolve);
    haze.setValue(ctx.sky.haze);
  });
}
