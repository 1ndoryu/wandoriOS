import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RenderStyle, TerrainOptions } from '../../../game-core';
import { mountCurvedIslandPanel } from './game-curved-island-panel';
import type { CurvedIslandPanelControls } from './game-curved-island-controls';

describe('panel de la isla curva como orquestador del Constructor', () => {
  let host: HTMLElement;
  let setCurvature: ReturnType<typeof vi.fn<(down: number, pull: number) => void>>;
  let setRain: ReturnType<typeof vi.fn<(amount: number) => void>>;
  let setPropsVisible: ReturnType<typeof vi.fn<(visible: boolean) => void>>;
  let setCameraFollow: ReturnType<typeof vi.fn<(follow: boolean) => void>>;
  let regenerate: ReturnType<typeof vi.fn<() => void>>;
  let setTerrainMode: ReturnType<typeof vi.fn<(mode: RenderStyle) => void>>;
  let onGenerate: ReturnType<typeof vi.fn<(options: TerrainOptions) => void>>;
  let onExport: ReturnType<typeof vi.fn<() => void>>;
  let onImport: ReturnType<typeof vi.fn<(text: string) => void>>;

  const controls = (): CurvedIslandPanelControls => ({
    setCurvature,
    setRain,
    setPropsVisible,
    setCameraFollow,
    regenerate,
    setTerrainMode,
    worldConstructor: { onGenerate, onExport, onImport },
  });

  beforeEach(() => {
    host = document.createElement('section');
    document.body.appendChild(host);
    setCurvature = vi.fn();
    setRain = vi.fn();
    setPropsVisible = vi.fn();
    setCameraFollow = vi.fn();
    regenerate = vi.fn();
    setTerrainMode = vi.fn();
    onGenerate = vi.fn();
    onExport = vi.fn();
    onImport = vi.fn();
  });

  afterEach(() => {
    host.remove();
  });

  const railButton = (label: string): HTMLButtonElement => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button, `icono "${label}"`).toBeDefined();
    return button as HTMLButtonElement;
  };

  const clickText = (text: string): void => {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent === text);
    expect(button, `botón "${text}"`).toBeDefined();
    button?.click();
  };

  it('con constructor el panel exterior es el rail y la isla es una sección suya', () => {
    const panel = mountCurvedIslandPanel(host, controls());

    expect(host.querySelector('section.juegoPanelTerreno')).toBeNull();
    expect(host.querySelector('.juegoConstructor')).not.toBeNull();
    expect(host.querySelector('.juegoConstructor__titulo')?.textContent).toBe('Constructor');

    const labels = Array.from(host.querySelectorAll<HTMLButtonElement>('.juegoConstructor__icono'))
      .map(button => button.getAttribute('aria-label'));
    expect(labels).toEqual(['Terreno', 'Mundo/Estilo', 'Isla', 'Estilos']);

    railButton('Isla').click();
    const subpanel = host.querySelector<HTMLElement>('.juegoConstructor__subpanel');
    expect(subpanel?.getAttribute('aria-label')).toBe('Isla');
    expect(subpanel?.textContent).toContain('Curva del mundo');
    expect(subpanel?.textContent).toContain('Crecer nueva isla');

    panel.destroy();
    expect(host.querySelector('.juegoConstructor')).toBeNull();
  });

  it('la sección Isla emite lluvia y props en tiempo real', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    railButton('Isla').click();

    const rain = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="range"]'))
      .find(input => input.closest('.juegoPanelTerreno__fila')?.textContent?.includes('Lluvia'));
    expect(rain).toBeDefined();
    if (!rain) return;
    rain.value = '40';
    rain.dispatchEvent(new Event('input'));
    expect(setRain).toHaveBeenCalledWith(0.4);

    const props = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
      .find(input => input.closest('label')?.textContent?.includes('Árboles y rocas'));
    expect(props).toBeDefined();
    if (!props) return;
    props.checked = false;
    props.dispatchEvent(new Event('change'));
    expect(setPropsVisible).toHaveBeenCalledWith(false);

    panel.destroy();
  });

  it('la sección Estilos compara modos y expone métricas del toolkit', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    railButton('Estilos').click();

    const subpanel = host.querySelector<HTMLElement>('.juegoConstructor__subpanel');
    expect(subpanel?.textContent).toContain('Comparar estilos');
    for (const label of ['Bloques', 'Suave']) {
      expect(Array.from(subpanel?.querySelectorAll('button') ?? [])
        .some(button => button.textContent === label)).toBe(true);
    }

    panel.setTerrainMetrics('bloques · tris 100');
    expect(host.querySelector('.juegoPanelTerreno__statsLine')?.textContent).toContain('tris 100');

    panel.setTerrainMode('suave');
    const suave = Array.from(subpanel?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === 'Suave');
    expect(suave?.classList.contains('juegoPanelTerreno__segmento--activo')).toBe(true);

    const bloques = Array.from(subpanel?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === 'Bloques');
    bloques?.click();
    expect(setTerrainMode).toHaveBeenCalledWith('bloques');

    panel.destroy();
  });

  it('la sección Cámara cambia el modo y sincroniza el segmento activo (138A-7)', () => {
    const setCameraMode = vi.fn<(mode: 'libre' | 'primera' | 'tercera') => void>();
    const panel = mountCurvedIslandPanel(host, { ...controls(), setCameraMode });

    const labels = Array.from(host.querySelectorAll<HTMLButtonElement>('.juegoConstructor__icono'))
      .map(button => button.getAttribute('aria-label'));
    expect(labels).toContain('Cámara');

    railButton('Cámara').click();
    const subpanel = host.querySelector<HTMLElement>('.juegoConstructor__subpanel');
    expect(subpanel?.textContent).toContain('Modo de cámara');
    for (const label of ['Libre', 'Primera', '3ª persona']) {
      expect(Array.from(subpanel?.querySelectorAll('button') ?? [])
        .some(button => button.textContent === label)).toBe(true);
    }
    expect(subpanel?.textContent).toContain('tecla C');

    clickText('Primera');
    expect(setCameraMode).toHaveBeenCalledWith('primera');

    panel.setCameraMode('tercera');
    const tercera = Array.from(subpanel?.querySelectorAll('button') ?? [])
      .find(button => button.textContent === '3ª persona');
    expect(tercera?.classList.contains('juegoPanelTerreno__segmento--activo')).toBe(true);

    panel.destroy();
  });

  it('el rail mantiene un solo subpanel abierto y setPick escribe las stats', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    const openLabels = (): string[] => Array.from(host.querySelectorAll<HTMLElement>('.juegoConstructor__subpanel'))
      .map(el => el.getAttribute('aria-label') ?? '');

    expect(openLabels()).toEqual(['Terreno']);
    railButton('Estilos').click();
    expect(openLabels()).toEqual(['Estilos']);

    panel.setPick({ i: 3, j: 7, level: 2 });
    expect(host.querySelector('.juegoPanelTerreno__stats')?.textContent).toBe('bloque 3,7 · nivel 2');
    panel.setPick(null);
    expect(host.querySelector('.juegoPanelTerreno__stats')?.textContent).toBe('');
    panel.destroy();
  });

  it('sin constructor conserva el panel clásico del terreno', () => {
    const legacyControls = {
      setCurvature,
      setRain,
      setPropsVisible,
      setCameraFollow,
      regenerate,
      setTerrainMode,
    } as CurvedIslandPanelControls;
    mountCurvedIslandPanel(host, legacyControls);

    expect(host.querySelector('section.juegoPanelTerreno')).not.toBeNull();
    expect(host.querySelector('.juegoConstructor')).toBeNull();
    expect(host.querySelector('.juegoPanelTerreno')?.textContent).toContain('Comparar estilos');
  });

  it('el cabecera colapsa y expande el panel exterior', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    const cabecera = host.querySelector<HTMLButtonElement>('.juegoConstructor__cabecera');
    expect(cabecera?.getAttribute('aria-expanded')).toBe('true');

    cabecera?.click();
    expect(host.querySelector('.juegoConstructor')?.classList.contains('juegoConstructor--cerrado')).toBe(true);
    expect(cabecera?.getAttribute('aria-expanded')).toBe('false');

    cabecera?.click();
    expect(host.querySelector('.juegoConstructor')?.classList.contains('juegoConstructor--cerrado')).toBe(false);
    panel.destroy();
  });

  it('las opciones del constructor se sincronizan y destruyen sin restos', () => {
    const panel = mountCurvedIslandPanel(host, controls());
    const options: TerrainOptions = {
      shape: 'valle',
      seed: 1234,
      width: 64,
      depth: 48,
      cellSize: 1.5,
      maxHeight: 6,
      waterLevel: -1,
      coast: 0.2,
      warp: 0.1,
      octaves: 5,
      vegetationDensity: 0.5,
      style: 'bloques',
    };
    panel.setConstructorOptions(options);
    clickText('Generar mundo');
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ shape: 'valle', seed: 1234, width: 64 }));

    panel.destroy();
    expect(host.children.length).toBe(0);
  });
});
