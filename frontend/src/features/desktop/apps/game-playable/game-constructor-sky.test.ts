/* 138A-12 — Panel de Cielo/Ambiente del Constructor: presets, sliders en
 * vivo y sincronización externa sin emitir. Solo DOM + contrato puro. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKY_DEFAULTS, type SkyOptions, type TerrainOptions } from '../../../game-core';
import { mountCurvedIslandPanel } from './game-curved-island-panel';
import type { CurvedIslandPanelControls } from './game-curved-island-controls';

const SKY_FIXTURE: SkyOptions = { ...SKY_DEFAULTS };

describe('panel de cielo del Constructor (138A-12)', () => {
  let host: HTMLElement;
  let onGenerate: ReturnType<typeof vi.fn<(options: TerrainOptions) => void>>;
  let onSkyChange: ReturnType<typeof vi.fn<(sky: SkyOptions) => void>>;

  beforeEach(() => {
    host = document.createElement('section');
    document.body.appendChild(host);
    onGenerate = vi.fn();
    onSkyChange = vi.fn();
  });

  afterEach(() => {
    host.remove();
  });

  const railButton = (label: string): HTMLButtonElement => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button, `icono "${label}"`).toBeDefined();
    return button as HTMLButtonElement;
  };

  const controls = (): CurvedIslandPanelControls => ({
    setCurvature: vi.fn(),
    setRain: vi.fn(),
    setPropsVisible: vi.fn(),
    setCameraFollow: vi.fn(),
    regenerate: vi.fn(),
    worldConstructor: {
      onGenerate,
      onExport: vi.fn(),
      onImport: vi.fn(),
      onSkyChange,
    },
  });

  const slider = (label: string): HTMLInputElement => {
    const input = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="range"]'))
      .find(candidate => candidate.closest('.juegoPanelTerreno__fila')?.textContent?.includes(label));
    expect(input, `slider "${label}"`).toBeDefined();
    return input as HTMLInputElement;
  };

  it('registra el subpanel Cielo en el rail y emite cambios en vivo', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    railButton('Cielo').click();

    const subpanel = host.querySelector<HTMLElement>('.juegoConstructor__subpanel');
    expect(subpanel?.getAttribute('aria-label')).toBe('Cielo');
    expect(subpanel?.textContent).toContain('Sol');
    expect(subpanel?.textContent).toContain('Nubes');
    expect(subpanel?.textContent).toContain('Movimiento y calima');

    const coverage = slider('Cobertura');
    coverage.value = '0.25';
    coverage.dispatchEvent(new Event('input'));
    expect(onSkyChange).toHaveBeenCalledTimes(1);
    const first = onSkyChange.mock.calls[0][0] as SkyOptions;
    expect(first.coverage).toBe(0.25);

    const sunEl = slider('Altura');
    sunEl.value = '20';
    sunEl.dispatchEvent(new Event('input'));
    const second = onSkyChange.mock.calls[1][0] as SkyOptions;
    expect(second.sunEl).toBe(20);
    expect(second.coverage).toBe(0.25);

    panel.destroy();
  });

  it('los presets aplican la paleta y el sol del preset conservando lo demás', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    railButton('Cielo').click();

    const coverage = slider('Cobertura');
    coverage.value = '0.4';
    coverage.dispatchEvent(new Event('input'));
    expect(onSkyChange.mock.calls[0][0].coverage).toBe(0.4);

    const preset = Array.from(host.querySelectorAll<HTMLButtonElement>('button.juegoPanelTerreno__segmento'))
      .find(button => button.textContent === 'Dorado');
    expect(preset).toBeDefined();
    preset?.click();

    const applied = onSkyChange.mock.calls[1][0] as SkyOptions;
    expect(applied.preset).toBe('golden');
    expect(applied.zenith).toBe(0x6e94be);
    expect(applied.sunEl).toBe(9);
    expect(applied.coverage).toBe(0.4);

    panel.destroy();
  });

  it('sincroniza los controles desde fuera sin emitir cambios', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    railButton('Cielo').click();

    panel.setConstructorSky({ ...SKY_FIXTURE, coverage: 0.75, sunAz: 200 });
    expect(onSkyChange).not.toHaveBeenCalled();

    const coverage = slider('Cobertura');
    expect(coverage.value).toBe('0.75');
    const direction = slider('Dirección');
    expect(direction.value).toBe('200');

    panel.destroy();
  });
});
