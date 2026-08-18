/* 138A-9 — Visor de capas del editor de mapa (tipo Blender) + controles de
 * pincel. El stack completo se lista con ojo de visibilidad, reorden, duplicar
 * y eliminar; los pinceles crean/editan capas pintadas (camino/arena/agua/
 * elevación) que la escena aplica en tiempo real. En estilo bloques el editor
 * de elevación equivale a colocar/quitar bloques (el mesher cuantiza el
 * heightfield editado). SRP: solo DOM; las fábricas y helpers puros de capas
 * viven en game-layer-factories, el raycast/pointer en game-layer-painter y
 * el aplicador en game-core. */

import { createEl } from '../../../../utils/dom';
import { BRUSH_KINDS, type ConstructorBrushKind, type ConstructorBrushState } from './game-layer-brush';
import { paintedCellCount } from '../../../game-core';
import { createRangeControl, createSegmentControl } from './game-constructor-controls';
import type { ConstructorPanelContext } from './game-world-constructor';
import {
  createCircleLayer,
  paintedLayersOfKind,
  uniqueLayerId,
} from './game-layer-factories';

export { createCircleLayer, createPaintedLayer, paintedLayersOfKind, terrainLayerKindOfBrush } from './game-layer-factories';

export const LAYER_KIND_LABELS: Readonly<Record<string, string>> = {
  path: 'Camino',
  sand: 'Arena',
  water: 'Agua',
  vegetation: 'Pasto',
  elevation: 'Elevación',
};

const FALLOFF_OPTIONS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'linear', label: 'Lineal' },
  { key: 'smooth', label: 'Suave' },
  { key: 'gauss', label: 'Gauss' },
  { key: 'dome', label: 'Cúpula' },
  { key: 'spike', label: 'Pico' },
  { key: 'hard', label: 'Duro' },
];

/** Visor de capas + pinceles. Registra syncers de capas y de pincel. */
export function buildLayerEditorPanel(
  container: HTMLElement,
  ctx: ConstructorPanelContext,
): void {
  const list = createEl('div', { className: 'juegoConstructor__capas' });
  container.appendChild(createEl('p', {
    className: 'juegoPanelTerreno__tituloGrupo',
    textContent: 'Capas de terreno',
  }));
  container.appendChild(list);

  const addRow = createEl('div', { className: 'juegoPanelTerreno__segmentos' });
  for (const kind of BRUSH_KINDS) {
    const button = createEl('button', {
      className: 'juegoPanelTerreno__segmento',
      type: 'button',
      textContent: `+ ${kind.label}`,
      title: `Añadir capa de ${kind.label.toLowerCase()}`,
    });
    button.addEventListener('click', () => {
      const next = [...ctx.layers, createCircleLayer(kind.key, ctx.layers)];
      ctx.commitLayers(next);
    });
    addRow.appendChild(button);
  }
  container.appendChild(addRow);
  container.appendChild(createEl('p', {
    className: 'juegoPanelTerreno__statsLine',
    textContent: 'Las capas se evalúan de abajo arriba; las últimas pintan encima.',
  }));

  const renderList = (): void => {
    list.textContent = '';
    if (ctx.layers.length === 0) {
      list.appendChild(createEl('p', {
        className: 'juegoPanelTerreno__statsLine',
        textContent: 'Sin capas: el mundo usa solo el terreno generado.',
      }));
      return;
    }
    ctx.layers.forEach((layer, index) => {
      const row = createEl('div', { className: 'juegoConstructor__capaFila' });
      const eye = createEl('button', {
        className: 'juegoConstructor__capaOjo',
        type: 'button',
        textContent: layer.enabled ? '◉' : '○',
        title: layer.enabled ? 'Ocultar capa' : 'Mostrar capa',
        ariaLabel: `${layer.enabled ? 'Ocultar' : 'Mostrar'} capa ${layer.name}`,
        ariaPressed: String(layer.enabled),
      });
      eye.addEventListener('click', () => {
        const next = ctx.layers.map(candidate => candidate.id === layer.id
          ? { ...candidate, enabled: !candidate.enabled }
          : candidate);
        ctx.commitLayers(next);
      });
      const label = createEl('span', {
        className: 'juegoConstructor__capaNombre',
        textContent: `${layer.name} · ${LAYER_KIND_LABELS[layer.kind] ?? layer.kind}`
          + `${paintedCellCount(layer) > 0 ? ` · ${paintedCellCount(layer)} celdas` : ''}`,
        title: layer.id,
      });
      row.append(eye, label);
      const up = createEl('button', {
        className: 'juegoPanelTerreno__boton juegoConstructor__capaBoton',
        type: 'button',
        textContent: '↑',
        title: 'Subir en el stack (pinta encima)',
        ariaLabel: `Subir capa ${layer.name}`,
      });
      up.disabled = index === 0;
      up.addEventListener('click', () => {
        const next = [...ctx.layers];
        const other = next[index - 1];
        next[index - 1] = next[index];
        next[index] = other;
        ctx.commitLayers(next);
      });
      const down = createEl('button', {
        className: 'juegoPanelTerreno__boton juegoConstructor__capaBoton',
        type: 'button',
        textContent: '↓',
        title: 'Bajar en el stack',
        ariaLabel: `Bajar capa ${layer.name}`,
      });
      down.disabled = index === ctx.layers.length - 1;
      down.addEventListener('click', () => {
        const next = [...ctx.layers];
        const other = next[index + 1];
        next[index + 1] = next[index];
        next[index] = other;
        ctx.commitLayers(next);
      });
      const duplicate = createEl('button', {
        className: 'juegoPanelTerreno__boton juegoConstructor__capaBoton',
        type: 'button',
        textContent: '⧉',
        title: 'Duplicar capa',
        ariaLabel: `Duplicar capa ${layer.name}`,
      });
      duplicate.addEventListener('click', () => {
        const copy = {
          ...layer,
          id: uniqueLayerId(`copia-${layer.id}`, ctx.layers),
          name: `${layer.name} copia`,
        };
        const next = [...ctx.layers];
        next.splice(index + 1, 0, copy);
        ctx.commitLayers(next);
      });
      const remove = createEl('button', {
        className: 'juegoPanelTerreno__boton juegoConstructor__capaBoton',
        type: 'button',
        textContent: '×',
        title: 'Eliminar capa',
        ariaLabel: `Eliminar capa ${layer.name}`,
      });
      remove.addEventListener('click', () => {
        ctx.commitLayers(ctx.layers.filter(candidate => candidate.id !== layer.id));
      });
      row.append(up, down, duplicate, remove);
      list.appendChild(row);
    });
  };

  /* --- pincel --- */
  container.appendChild(createEl('p', {
    className: 'juegoPanelTerreno__tituloGrupo',
    textContent: 'Pincel',
  }));
  const brushHost = createEl('div', { className: 'juegoConstructor__pincel' });
  container.appendChild(brushHost);

  const renderBrush = (): void => {
    brushHost.textContent = '';
    const brush = ctx.brush;
    const activeCheck = createEl('label', { className: 'juegoPanelTerreno__check' });
    const activeInput = createEl('input', { type: 'checkbox' });
    activeInput.checked = brush.active;
    activeInput.addEventListener('change', () => {
      ctx.commitBrush({ ...brush, active: activeInput.checked });
    });
    activeCheck.append(activeInput, document.createTextNode('Pincel activo (arrastra para pintar)'));
    brushHost.appendChild(activeCheck);

    /* En bloques el editor pinta elevación (colocar/quitar bloques); en suave
     * además superficies (camino/arena/agua). */
    const blockMode = ctx.state.style === 'bloques';
    const kinds = blockMode
      ? BRUSH_KINDS.filter(kind => kind.key === 'elevation')
      : BRUSH_KINDS;
    const kindSegment = createSegmentControl<ConstructorBrushKind>(
      kinds,
      kinds.some(kind => kind.key === brush.kind) ? brush.kind : kinds[0].key,
      (kind) => ctx.commitBrush({ ...brush, kind, targetLayerId: null }),
    );
    brushHost.appendChild(kindSegment.container);

    const radius = createRangeControl(
      'Radio', 0.5, 8, 0.25, brush.radius, v => `${v.toFixed(2)}u`,
      (radiusValue) => ctx.commitBrush({ ...brush, radius: radiusValue }),
    );
    const strength = createRangeControl(
      'Fuerza', 0.1, 1, 0.05, brush.strength, v => `${Math.round(v * 100)}%`,
      (strengthValue) => ctx.commitBrush({ ...brush, strength: strengthValue }),
    );
    brushHost.append(radius.row, strength.row);

    const falloffRow = createEl('div', { className: 'juegoPanelTerreno__fila' });
    falloffRow.appendChild(createEl('label', { className: 'juegoPanelTerreno__rangoLabel', textContent: 'Borde' }));
    const falloffSelect = createEl('select', { className: 'juegoPanelTerreno__entrada' });
    for (const option of FALLOFF_OPTIONS) {
      falloffSelect.appendChild(createEl('option', { value: option.key, textContent: option.label }));
    }
    falloffSelect.value = brush.falloff;
    falloffSelect.addEventListener('change', () => {
      ctx.commitBrush({ ...brush, falloff: falloffSelect.value as ConstructorBrushState['falloff'] });
    });
    falloffRow.appendChild(falloffSelect);
    brushHost.appendChild(falloffRow);

    /* Capa objetivo: solo capas pintadas del mismo contenido reciben pinceladas;
     * null crea una nueva por sesión (los círculos nunca se convierten). */
    const targets = paintedLayersOfKind(ctx.layers, brush.kind);
    const targetSel = createEl('select', { className: 'juegoPanelTerreno__entrada' });
    targetSel.appendChild(createEl('option', { value: '', textContent: '— nueva capa —' }));
    for (const layer of targets) {
      targetSel.appendChild(createEl('option', { value: layer.id, textContent: layer.name }));
    }
    if (brush.targetLayerId && targets.some(layer => layer.id === brush.targetLayerId)) {
      targetSel.value = brush.targetLayerId;
    }
    targetSel.addEventListener('change', () => {
      ctx.commitBrush({
        ...brush,
        targetLayerId: targetSel.value === '' ? null : targetSel.value,
      });
    });
    const targetRow = createEl('div', { className: 'juegoPanelTerreno__fila' });
    targetRow.append(
      createEl('label', { className: 'juegoPanelTerreno__rangoLabel', textContent: 'Capa objetivo' }),
      targetSel,
    );
    brushHost.appendChild(targetRow);

    if (brush.kind === 'elevation') {
      const height = createRangeControl(
        'Altura', 0.25, 8, 0.25, brush.height, v => `${v.toFixed(2)}`,
        (heightValue) => ctx.commitBrush({ ...brush, height: heightValue }),
      );
      const direction = createSegmentControl<'raise' | 'lower'>(
        [
          { key: 'raise', label: 'Subir' },
          { key: 'lower', label: 'Bajar' },
        ],
        brush.direction,
        (directionValue) => ctx.commitBrush({ ...brush, direction: directionValue }),
      );
      brushHost.append(height.row, direction.container);
    }

    if (brush.kind === 'grass') {
      const mode = createSegmentControl<'add' | 'remove'>(
        [
          { key: 'add', label: 'Poner' },
          { key: 'remove', label: 'Quitar' },
        ],
        brush.mode,
        (modeValue) => ctx.commitBrush({ ...brush, mode: modeValue }),
      );
      brushHost.appendChild(mode.container);
    }

    brushHost.appendChild(createEl('p', {
      className: 'juegoPanelTerreno__statsLine',
      textContent: blockMode
        ? 'Estilo bloques: subir/bajar coloca o quita bloques (y variantes del terreno).'
        : 'Estilo suave: pinta caminos, arena, agua, pasto o eleva/baja el terreno.',
    }));
  };

  renderList();
  renderBrush();
  ctx.syncLayers(renderList);
  ctx.syncLayers(renderBrush);
  ctx.syncBrush(renderBrush);
}
