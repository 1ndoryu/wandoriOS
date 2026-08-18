/* GAME-01 — Vista del Editor de mapa 2D del Bosque (tab "mapa").
 * [297A-64] Canvas 2D top-down con grid de terreno, instancias por categoría
 * y spawns; paleta de assets del catálogo activo, herramientas (seleccionar /
 * colocar / spawn), undo/redo y publicación atómica con expectedVersion.
 * Reutiliza el contrato puro de game-core (validateMapVersion) y el servicio
 * GameMapAdminService; el runtime real sigue consumiendo el fixture. El
 * dibujo vive en game-map-editor-canvas.ts y el toolbar en
 * game-map-editor-toolbar.ts (este módulo queda <300 líneas). */

import { createEl } from '../../../../utils/dom';
import { createSelect } from '../../../../components/ui/select';
import { showConfirm } from '../../../../components/ui/confirm';
import { showToast } from '../../../../components/ui/toast';
import { tryCatch } from '../../../../utils/result';
import {
  GAME_MAP_ID,
  GameMapAdminService,
  type LoadedGameMap,
} from '../../../../services/game-map-admin.service';
import { GameAssetAdminService, type GameAssetAdminEntry } from '../../../../services/game-asset-admin.service';
import { FIXTURE_MAP_VERSION } from './game-fixture-map';
import {
  createMapEditorState,
  mergeCatalogIntoManifest,
  duplicateInstance,
  deleteInstance,
  deleteSpawnPoint,
  setActiveSurface,
  isAllowedHeight,
  isAllowedSurface,
  undo,
  redo,
  setTool,
  setActiveAsset,
  getValidationIssues,
  setDraftRevision,
  type MapEditorTool,
  type TerrainHeightValue,
  type TerrainSurfaceValue,
} from './game-map-editor-core';
import { setActiveHeight } from './game-map-editor-height';
import { createGameMapPreview } from './game-map-preview';
import { createEditorToolbar } from './game-map-editor-toolbar';
import { bindMapEditorPointer, type MapEditorStateRef } from './game-map-editor-interactions';
import {
  CATEGORY_LABEL,
  drawMap,
  resizeCanvas,
} from './game-map-editor-canvas';
import type { AssetCategory } from '../../../game-core';

export interface GameMapEditorHandle {
  readonly element: HTMLElement;
  readonly destroy: () => void;
}

function isAllowedCategory(category: string): category is AssetCategory {
  return category === 'terrain' || category === 'tree' || category === 'rock'
    || category === 'water' || category === 'character' || category === 'generic';
}

/** Crea el editor dentro del contenedor del tab "mapa". Devuelve el handle
 * con teardown (listeners, resize observer, cargas pendientes). */
export function createGameMapEditor(container: HTMLElement): GameMapEditorHandle {
  let disposed = false;
  /* [297A-70] Ref mutable del estado: las interacciones (módulo propio)
   * leen/escriben el mismo objeto que la vista. */
  const stateRef: MapEditorStateRef = { current: null };
  let generation = 0;
  const cleanups: Array<() => void> = [];

  /* === Toolbar (módulo propio) === */
  const toolbarElements = createEditorToolbar();

  const canvasHost = createEl('div', { className: 'juegoConfig__editor-canvas' });
  const canvas = createEl('canvas', { className: 'juegoConfig__editor-surface' }) as HTMLCanvasElement;
  canvasHost.appendChild(canvas);

  const footer = createEl('div', { className: 'juegoConfig__editor-footer' },
    toolbarElements.hint, toolbarElements.issuesEl);
  container.append(toolbarElements.toolbar, canvasHost, footer);

  let previewHandle: ReturnType<typeof createGameMapPreview> | null = null;

  const redraw = (): void => {
    const current = stateRef.current;
    if (disposed || !current) return;
    if (previewHandle) {
      /* [297A-70] El preview 3D se sincroniza con el borrador en cada cambio. */
      previewHandle.setDocument(current.document);
      toolbarElements.refresh(current);
      return;
    }
    resizeCanvas(canvas, canvasHost);
    drawMap(canvas, current);
    toolbarElements.refresh(current);
  };

  const onResize = (): void => redraw();
  /* [297A-64] ResizeObserver no existe en todos los entornos (jsdom de
   * pruebas); sin él el canvas mantiene su tamaño hasta el próximo dibujo. */
  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(canvasHost);
    cleanups.push(() => resizeObserver.disconnect());
  } else {
    window.addEventListener('resize', onResize);
    cleanups.push(() => window.removeEventListener('resize', onResize));
  }

  /* === Interacciones (módulo propio) === */
  const pointer = bindMapEditorPointer(canvas, stateRef, redraw);
  cleanups.push(pointer.destroy);

  const onTool = (tool: MapEditorTool): void => {
    const current = stateRef.current;
    if (current) {
      stateRef.current = setTool(current, tool);
      redraw();
    }
  };

  /* [297A-70] Alterna entre el canvas 2D del editor y el preview 3D del
   * borrador; el preview reutiliza el pipeline del runtime y se retira del
   * DOM al volver (destroy libera GPU/RAF/observers). */
  const onPreviewToggle = (): void => {
    const current = stateRef.current;
    if (!current) return;
    if (previewHandle) {
      previewHandle.destroy();
      previewHandle = null;
      canvasHost.replaceChildren(canvas);
      redraw();
      return;
    }
    canvasHost.replaceChildren();
    previewHandle = createGameMapPreview(canvasHost);
    previewHandle.setDocument(current.document);
    toolbarElements.refresh(current);
  };
  toolbarElements.btnPreview.addEventListener('click', onPreviewToggle);
  cleanups.push(() => {
    if (previewHandle) previewHandle.destroy();
  });
  toolbarElements.toolButtons.get('select')!.addEventListener('click', () => onTool('select'));
  toolbarElements.toolButtons.get('place')!.addEventListener('click', () => onTool('place'));
  toolbarElements.toolButtons.get('spawn')!.addEventListener('click', () => onTool('spawn'));
  toolbarElements.toolButtons.get('paint')!.addEventListener('click', () => onTool('paint'));
  toolbarElements.toolButtons.get('height')!.addEventListener('click', () => onTool('height'));
  toolbarElements.toolButtons.get('terrain')!.addEventListener('click', () => onTool('terrain'));
  toolbarElements.btnUndo.addEventListener('click', () => { const current = stateRef.current; if (current) { stateRef.current = undo(current); redraw(); } });
  toolbarElements.btnRedo.addEventListener('click', () => { const current = stateRef.current; if (current) { stateRef.current = redo(current); redraw(); } });
  toolbarElements.btnDelete.addEventListener('click', () => {
    const current = stateRef.current;
    if (!current?.selectedId) return;
    const selectedId = current.selectedId;
    const isSpawn = current.document.spawnPoints.some((s) => s.id === selectedId);
    stateRef.current = isSpawn
      ? deleteSpawnPoint(current, selectedId)
      : deleteInstance(current, selectedId);
    redraw();
  });
  toolbarElements.btnDuplicate.addEventListener('click', () => {
    const current = stateRef.current;
    if (!current?.selectedId) return;
    const selectedId = current.selectedId;
    const isSpawn = current.document.spawnPoints.some((s) => s.id === selectedId);
    if (!isSpawn) stateRef.current = duplicateInstance(current, selectedId);
    redraw();
  });

  const onPublish = async (): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    /* [297A-64] Snapshot local: el narrowing de `state` no sobrevive a los
     * awaits de showConfirm/publish (variable mutable del closure). */
    const issues = getValidationIssues(current);
    if (issues.length > 0) {
      showToast(`el mapa no es válido: ${issues[0].path} ${issues[0].message}`);
      return;
    }
    const confirmed = await showConfirm(`publicar una versión inmutable del mapa (v${current.activeVersion + 1})?`);
    if (!confirmed) return;
    /* [Decisión 8] Publicar migra el mundo: el servidor difunde `server_restart`
     * con la cuenta atrás fija (300 s), drena las salas al expirar y todos los
     * jugadores reconectan a la versión nueva. Se confirma explícitamente para
     * que el admin sepa que la publicación interrumpe las partidas en curso.
     * 5 min = GAME_RESTART_GRACE_SECONDS (300) del backend (game_ws.rs). */
    const migrationConfirmed = await showConfirm(
      'publicar reiniciará el mundo en 5 minutos: los jugadores en línea verán la cuenta atrás y volverán a la versión nueva. ¿continuar?',
    );
    if (!migrationConfirmed) return;
    const result = await tryCatch(GameMapAdminService.publish(current.document, current.activeVersion));
    if (!result.ok) {
      const message = result.error;
      showToast(message.includes('409') || message.includes('cambió')
        ? 'conflicto: el mapa cambió en el servidor; recarga y vuelve a editar'
        : `error al publicar: ${message}`);
      return;
    }
    showToast(`mapa publicado · v${result.value.version}`);
    /* Actualizar la base: la publicación es la nueva referencia de cambios. */
    const catalog = current.catalog;
    const reloaded = await tryCatch(loadMap());
    if (reloaded.ok && reloaded.value) {
      stateRef.current = createMapEditorState(
        reloaded.value.document,
        reloaded.value.activeVersion,
        catalog,
        reloaded.value.draftRevision ?? 0,
      );
      redraw();
    }
  };
  toolbarElements.btnPublish.addEventListener('click', () => void onPublish());
  /* [297A-71] Guardar el borrador con revisión optimista: `draftRevision` del
   * estado es el expected; el servidor devuelve la revisión nueva (0 → 1).
   * Un 409 significa que otro editor guardó: se informa y se pide recargar. */
  const onSaveDraft = async (): Promise<void> => {
    const current = stateRef.current;
    if (!current) return;
    const issues = getValidationIssues(current);
    if (issues.length > 0) {
      showToast(`el borrador no es válido: ${issues[0].path} ${issues[0].message}`);
      return;
    }
    const result = await tryCatch(GameMapAdminService.saveDraft(
      current.document,
      current.draftRevision,
    ));
    if (!result.ok) {
      const message = result.error;
      showToast(message.includes('409') || message.includes('cambió')
        ? 'conflicto: el borrador cambió en el servidor; recarga y vuelve a editar'
        : `error al guardar el borrador: ${message}`);
      return;
    }
    stateRef.current = setDraftRevision(current, result.value.revision);
    showToast(`borrador guardado · v${result.value.revision}`);
    redraw();
  };
  toolbarElements.btnSaveDraft.addEventListener('click', () => void onSaveDraft());
  /* [297A-66] Selector de superficie del pincel (handler nombrado para
   * poder retirarlo en destroy). */
  const onSurfaceChange = (): void => {
    const current = stateRef.current;
    if (!current) return;
    const value = Number(toolbarElements.surfaceSelect.value) as TerrainSurfaceValue;
    /* [297A-68] Cualquier superficie allowlisted del contrato (suelo/agua/
     * camino); nunca un valor que el runtime no sepa traducir. */
    if (isAllowedSurface(value)) stateRef.current = setActiveSurface(current, value);
  };
  toolbarElements.surfaceSelect.addEventListener('change', onSurfaceChange);
  cleanups.push(() => toolbarElements.surfaceSelect.removeEventListener('change', onSurfaceChange));
  /* [297A-67] Selector de nivel de altura del pincel. */
  const onHeightChange = (): void => {
    const current = stateRef.current;
    if (!current) return;
    const value = Number(toolbarElements.heightSelect.value) as TerrainHeightValue;
    if (isAllowedHeight(value)) stateRef.current = setActiveHeight(current, value);
  };
  toolbarElements.heightSelect.addEventListener('change', onHeightChange);
  cleanups.push(() => toolbarElements.heightSelect.removeEventListener('change', onHeightChange));

  /* === Carga === */
  /* [297A-71] El borrador editable manda sobre la publicación: si existe
   * (admin guardó antes), el editor continúa desde él; si no, parte del
   * snapshot activo o del fixture. `activeVersion` siempre se resuelve para
   * poder publicar con el expected correcto. */
  async function loadMap(): Promise<LoadedGameMap> {
    const [existing, draft] = await Promise.all([
      GameMapAdminService.getActive(GAME_MAP_ID),
      GameMapAdminService.getDraft(GAME_MAP_ID),
    ]);
    const activeVersion = existing?.activeVersion ?? 0;
    if (draft) return { document: draft.document, activeVersion, draftRevision: draft.revision };
    return existing ?? { document: FIXTURE_MAP_VERSION, activeVersion };
  }

  async function init(): Promise<void> {
    const myGeneration = ++generation;
    toolbarElements.hint.textContent = 'cargando catálogo y mapa…';

    const catalogResult = await tryCatch(GameAssetAdminService.listAll());
    if (disposed || myGeneration !== generation) return;
    const catalog: GameAssetAdminEntry[] = catalogResult.ok
      ? catalogResult.value.filter((entry) => entry.isActive)
      : [];
    const activeAssets = catalog.filter((entry) => entry.isActive);

    const mapResult = await tryCatch(loadMap());
    if (disposed || myGeneration !== generation) return;
    if (!mapResult.ok || !mapResult.value) {
      toolbarElements.hint.textContent = 'no se pudo cargar el mapa';
      return;
    }
    const base = mergeCatalogIntoManifest(mapResult.value.document, activeAssets);
    stateRef.current = createMapEditorState(
      base,
      mapResult.value.activeVersion,
      activeAssets,
      mapResult.value.draftRevision ?? 0,
    );

    /* Poblar la paleta con los assets activos del catálogo. */
    const options = activeAssets.map((entry) => ({
      value: entry.id,
      label: `${entry.displayName} · ${CATEGORY_LABEL[isAllowedCategory(entry.category) ? entry.category : 'generic']}`,
    }));
    const palette = createSelect({
      label: 'asset',
      options,
      value: stateRef.current.activeAssetId ?? options[0]?.value ?? '',
      onChange: (value) => { const current = stateRef.current; if (current) stateRef.current = setActiveAsset(current, value || null); },
    });
    toolbarElements.assetSlot.replaceChildren(palette);

    const draftLabel = mapResult.value.draftRevision
      ? ` · borrador v${mapResult.value.draftRevision}`
      : '';
    toolbarElements.hint.textContent = catalogResult.ok
      ? `mapa ${base.id}${draftLabel} · v${mapResult.value.activeVersion || 'sin publicar'} · ${base.instances.length} instancias · ${base.spawnPoints.length} spawns`
      : 'mapa cargado sin catálogo (solo assets existentes)';
    redraw();
  }

  void init();

  return {
    element: container,
    destroy: () => {
      if (disposed) return;
      disposed = true;
      generation += 1;
      for (const cleanup of cleanups) cleanup();
      container.textContent = '';
    },
  };
}
