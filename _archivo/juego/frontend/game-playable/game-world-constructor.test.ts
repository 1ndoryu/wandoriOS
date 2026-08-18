import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Waves } from 'lucide';
import {
  buildMapVersionFromOptions,
  terrainOptionsPreset,
  WORLD_PALETTE_DEFAULTS,
  type MapVersion,
  type TerrainOptions,
  type WorldPalette,
} from '../../../game-core';
import {
  mountWorldConstructor,
  type WorldConstructorControls,
} from './game-world-constructor';
import { CONSTRUCTOR_PANEL_MAX_WIDTH, CONSTRUCTOR_PANEL_MIN_WIDTH } from './game-constructor-persistence';

describe('sección constructor de mundo (rail de iconos)', () => {
  let host: HTMLElement;
  let onGenerate: ReturnType<typeof vi.fn<(options: TerrainOptions) => void>>;
  let onExport: ReturnType<typeof vi.fn<() => void>>;
  let onImport: ReturnType<typeof vi.fn<(text: string) => void>>;
  let onChange: ReturnType<typeof vi.fn<(options: TerrainOptions) => void>>;
  let controls: WorldConstructorControls;

  beforeEach(() => {
    host = document.createElement('section');
    document.body.appendChild(host);
    onGenerate = vi.fn();
    onExport = vi.fn();
    onImport = vi.fn();
    onChange = vi.fn();
    controls = { onGenerate, onExport, onImport, onChange };
  });

  afterEach(() => {
    host.remove();
  });

  const clickText = (text: string): void => {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent === text);
    expect(button, `botón "${text}"`).toBeDefined();
    button?.click();
  };

  const railButton = (label: string): HTMLButtonElement => {
    const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(button, `icono "${label}"`).toBeDefined();
    return button as HTMLButtonElement;
  };

  it('genera con las opciones por defecto al pulsar Generar mundo', () => {
    mountWorldConstructor(host, controls);
    clickText('Generar mundo');
    expect(onGenerate).toHaveBeenCalledTimes(1);
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      shape: 'isla',
      width: 48,
      depth: 32,
      cellSize: 1,
      maxHeight: 4,
      waterLevel: 0,
      vegetationDensity: 1,
    });
  });

  it('usa la forma activa y el seed editado al generar', () => {
    mountWorldConstructor(host, controls);
    clickText('Continente');
    const seed = host.querySelector<HTMLInputElement>('input[type="number"]');
    expect(seed).not.toBeNull();
    if (seed) seed.value = '4242';
    seed?.dispatchEvent(new Event('input'));
    clickText('Generar mundo');
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ shape: 'continente', seed: 4242 });
  });

  it('emite onChange en tiempo real al editar un valor', () => {
    mountWorldConstructor(host, controls);
    const seed = host.querySelector<HTMLInputElement>('input[type="number"]');
    expect(seed).not.toBeNull();
    if (seed) seed.value = '9001';
    seed?.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ seed: 9001 });
  });

  it('emite onChange al cambiar forma y vegetación sin pulsar Generar', () => {
    mountWorldConstructor(host, controls);
    clickText('Archipiélago');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ shape: 'archipielago' });

    railButton('Mundo/Estilo').click();
    const density = Array.from(host.querySelectorAll<HTMLInputElement>('input[type="range"]'))
      .find(input => input.closest('.juegoPanelTerreno__fila')?.textContent?.includes('Vegetación'));
    expect(density).toBeDefined();
    if (!density) return;
    density.value = '25';
    density.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0]).toMatchObject({ vegetationDensity: 0.25 });
  });

  it('mantiene un solo subpanel abierto y conmuta con los iconos del rail', () => {
    mountWorldConstructor(host, controls);
    const openPanels = (): string[] => Array.from(host.querySelectorAll<HTMLElement>('.juegoConstructor__subpanel'))
      .map(panel => panel.getAttribute('aria-label') ?? '');

    expect(openPanels()).toEqual(['Terreno']);
    expect(railButton('Terreno').getAttribute('aria-pressed')).toBe('true');

    railButton('Mundo/Estilo').click();
    expect(openPanels()).toEqual(['Mundo/Estilo']);
    expect(railButton('Terreno').getAttribute('aria-pressed')).toBe('false');
    expect(railButton('Mundo/Estilo').getAttribute('aria-pressed')).toBe('true');

    railButton('Mundo/Estilo').click();
    expect(openPanels()).toEqual([]);
  });

  it('el subpanel Mundo cambia dimensiones y celda con onChange', () => {
    mountWorldConstructor(host, controls);
    railButton('Mundo/Estilo').click();
    const selects = Array.from(host.querySelectorAll<HTMLSelectElement>('select'));
    const ancho = selects.find(select => select.closest('.juegoPanelTerreno__fila')?.textContent?.includes('Ancho'));
    expect(ancho).toBeDefined();
    if (!ancho) return;
    ancho.value = '64';
    ancho.dispatchEvent(new Event('change'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toMatchObject({ width: 64 });
  });

  it('applyOptions sincroniza los controles activos antes de generar', () => {
    const section = mountWorldConstructor(host, controls);
    section.applyOptions(terrainOptionsPreset('valle'));
    clickText('Generar mundo');
    expect(onGenerate.mock.calls[0][0]).toMatchObject({
      shape: 'valle',
      seed: terrainOptionsPreset('valle').seed,
    });
  });

  it('muestra métricas con setStats y limpia el DOM en destroy', () => {
    const section = mountWorldConstructor(host, controls);
    section.setStats('mundo · chunks 6');
    const stats = host.querySelector('.juegoPanelTerreno__statsLine');
    expect(stats?.textContent).toContain('mundo · chunks 6');
    section.destroy();
    expect(host.querySelector('.juegoConstructor')).toBeNull();
  });

  it('exporta e importa JSON desde el input de archivo', async () => {
    const section = mountWorldConstructor(host, controls);
    clickText('Exportar JSON');
    expect(onExport).toHaveBeenCalledTimes(1);

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const json = JSON.stringify({
      format: 'wandorius-map',
      version: 1,
      options: terrainOptionsPreset('archipielago'),
      map: null,
    });
    if (!fileInput) return;
    const file = new File([json], 'mundo.json', { type: 'application/json' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport).toHaveBeenCalledWith(json);
    section.destroy();
  });

  it('registra subpaneles extra del rail sin tocar el núcleo (OCP)', () => {
    mountWorldConstructor(host, controls, {
      title: 'Constructor',
      extraPanels: [{
        key: 'isla',
        label: 'Isla',
        icon: Waves,
        build: (container) => {
          container.appendChild(document.createElement('p')).textContent = 'Curva del mundo';
        },
      }],
    });

    const isla = railButton('Isla');
    expect(isla).toBeDefined();
    isla.click();
    const subpanel = host.querySelector<HTMLElement>('.juegoConstructor__subpanel');
    expect(subpanel?.getAttribute('aria-label')).toBe('Isla');
    expect(subpanel?.textContent).toContain('Curva del mundo');
    expect(isla.getAttribute('aria-pressed')).toBe('true');
  });

  it('aplica el estado inicial de la ventana y lo emite al plegar (138A-8)', () => {
    const onPanelStateChange = vi.fn();
    mountWorldConstructor(host, controls, {
      constructorPanelState: { collapsed: true, side: 'left', width: 360 },
      onConstructorPanelStateChange: onPanelStateChange,
    });
    const root = host.querySelector('.juegoConstructor') as HTMLElement;
    expect(root.classList.contains('juegoConstructor--cerrado')).toBe(true);
    expect(root.classList.contains('juegoConstructor--izquierda')).toBe(true);
    expect(root.style.width).toBe('360px');

    const cabecera = host.querySelector('.juegoConstructor__cabecera') as HTMLElement;
    cabecera.click();
    expect(root.classList.contains('juegoConstructor--cerrado')).toBe(false);
    expect(cabecera.getAttribute('aria-expanded')).toBe('true');
    expect(onPanelStateChange).toHaveBeenLastCalledWith({ collapsed: false, side: 'left', width: 360 });
  });

  it('un clic en el rail plegado despliega la ventana y abre la sección (138A-8)', () => {
    const onPanelStateChange = vi.fn();
    mountWorldConstructor(host, controls, {
      constructorPanelState: { collapsed: true, side: 'right', width: 320 },
      onConstructorPanelStateChange: onPanelStateChange,
    });
    railButton('Terreno').click();
    expect(host.querySelector('.juegoConstructor')?.classList.contains('juegoConstructor--cerrado')).toBe(false);
    expect(onPanelStateChange.mock.calls.at(-1)?.[0]).toMatchObject({ collapsed: false });
  });

  it('el botón de lado conmuta dock y applyPanelState restaura sin emitir (138A-8)', () => {
    const onPanelStateChange = vi.fn();
    const section = mountWorldConstructor(host, controls, {
      onConstructorPanelStateChange: onPanelStateChange,
    });
    const root = host.querySelector('.juegoConstructor') as HTMLElement;
    (host.querySelector('.juegoConstructor__lado') as HTMLButtonElement).click();
    expect(root.classList.contains('juegoConstructor--izquierda')).toBe(true);
    expect(onPanelStateChange).toHaveBeenCalledWith({ collapsed: false, side: 'left', width: 320 });

    section.applyPanelState({ collapsed: true, side: 'right', width: 400 });
    expect(root.classList.contains('juegoConstructor--cerrado')).toBe(true);
    expect(root.classList.contains('juegoConstructor--derecha')).toBe(true);
    expect(root.style.width).toBe('400px');
    expect(onPanelStateChange).toHaveBeenCalledTimes(1);
  });

  it('el arrastre del borde redimensiona dentro de los límites (138A-8)', () => {
    const onPanelStateChange = vi.fn();
    mountWorldConstructor(host, controls, {
      onConstructorPanelStateChange: onPanelStateChange,
    });
    const handle = host.querySelector('.juegoConstructor__resize') as HTMLElement;
    const root = host.querySelector('.juegoConstructor') as HTMLElement;
    handle.dispatchEvent(new PointerEvent('pointerdown', { clientX: 800, bubbles: true }));
    /* Lado derecho: arrastrar a la izquierda ensancha el panel. */
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 700, bubbles: true }));
    expect(root.style.width).toBe('420px');
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 9999, bubbles: true }));
    expect(Number.parseFloat(root.style.width)).toBeLessThanOrEqual(CONSTRUCTOR_PANEL_MAX_WIDTH);
    handle.dispatchEvent(new PointerEvent('pointermove', { clientX: -9999, bubbles: true }));
    expect(Number.parseFloat(root.style.width)).toBeGreaterThanOrEqual(CONSTRUCTOR_PANEL_MIN_WIDTH);
    handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(onPanelStateChange).toHaveBeenCalledTimes(1);
  });

  it('expone paleta, documento y rampa a los subpaneles extra (ctx 138A-8)', () => {
    const onPaletteChange = vi.fn<(palette: WorldPalette) => void>();
    const onEditObjects = vi.fn();
    const onToonRampChange = vi.fn<(dataUrl: string | null) => void>();
    const map: MapVersion = buildMapVersionFromOptions(terrainOptionsPreset('isla'));
    let receivedPalette: WorldPalette | null = null;
    let receivedMap: MapVersion | null = null;
    mountWorldConstructor(host, {
      ...controls,
      onPaletteChange,
      onEditObjects,
      onToonRampChange,
    }, {
      initialPalette: { ...WORLD_PALETTE_DEFAULTS, sky: 0x010203 },
      initialMap: map,
      extraPanels: [{
        key: 'prueba',
        label: 'Prueba',
        icon: Waves,
        build: (container, ctx) => {
          receivedPalette = ctx.palette;
          receivedMap = ctx.worldMap;
          const button = document.createElement('button');
          button.textContent = 'aplicar';
          button.addEventListener('click', () => {
            ctx.commitPalette({ ...ctx.palette, grass: 0x112233 });
            ctx.commitObjectEdits([{ kind: 'remove', id: map.instances[0].id }]);
            ctx.commitToonRamp('data:image/png;base64,prueba');
          });
          container.appendChild(button);
        },
      }],
    });

    railButton('Prueba').click();
    expect((receivedPalette as WorldPalette | null)?.sky).toBe(0x010203);
    expect(receivedMap).toBe(map);
    clickText('aplicar');
    expect(onPaletteChange).toHaveBeenCalledWith(expect.objectContaining({ grass: 0x112233 }));
    expect(onEditObjects).toHaveBeenCalledWith([{ kind: 'remove', id: map.instances[0].id }]);
    expect(onToonRampChange).toHaveBeenCalledWith('data:image/png;base64,prueba');
  });
});
