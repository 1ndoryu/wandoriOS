/* GAME-01 — Configuración del Bosque (vista dentro de la ventana del juego).
 * [297A-63] Reemplaza al modal 297A-62: el comando `game:settings` del
 * toolbar dispara un evento sobre la ventana del juego y esta alterna su
 * contenido — la escena se retira por un momento y aparece el panel de
 * configuración con TABS (personajes / assets / actividad / mapa). SRP: este
 * módulo arma los tabs y el teardown; cada catálogo vive en
 * game-settings-characters / game-settings-assets y la auditoría en
 * game-settings-activity. */

import { createEl } from '../../../../utils/dom';
import { createTabs } from '../../../../components/ui/tabs';
import { createGameMapEditor } from './game-map-editor';
import {
  renderPersonajes,
  invalidatePersonajesLista,
  openNuevoPersonajeModal,
} from './game-settings-characters';
import {
  renderAssets,
  invalidateAssetsLista,
  openNuevoAssetModal,
} from './game-settings-assets';
import { renderActividadGlobal } from './game-settings-activity';

export {
  openNuevoPersonajeModal,
  openEditarPersonajeModal,
} from './game-settings-characters';
export {
  openNuevoAssetModal,
  openEditarAssetModal,
} from './game-settings-assets';

const gameMapEditorCleanups = new WeakMap<HTMLElement, () => void>();

export interface GameSettingsPanel {
  element: HTMLElement;
  destroy: () => void;
}

/* [297A-63] Vista de configuración: reemplaza al juego dentro de la ventana.
 * Tabs para organizar (personajes / assets / actividad); la actividad global
 * agrega también las publicaciones de mapas. Cada tab se monta bajo demanda
 * para no cargar todos los catálogos al abrir. */
export function createGameSettingsPanel(options: { onBack: () => void }): GameSettingsPanel {
  const personajesLista = createEl('div', { className: 'admin-lista' });
  const assetsLista = createEl('div', { className: 'admin-lista' });
  const actividadContenido = createEl('div', { className: 'admin-lista' });

  const btnNuevoPersonaje = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: '+ nuevo personaje',
  });
  btnNuevoPersonaje.addEventListener('click', () => openNuevoPersonajeModal(() => {
    void renderPersonajes(personajesLista);
  }));
  const btnNuevoAsset = createEl('button', {
    type: 'button',
    className: 'boton boton-pequeno',
    textContent: '+ nuevo asset',
  });
  btnNuevoAsset.addEventListener('click', () => openNuevoAssetModal(() => {
    void renderAssets(assetsLista);
  }));

  const personajes = createEl('section', {},
    createEl('header', { className: 'admin-seccion' },
      createEl('h3', { className: 'mt-lg mb-sm', textContent: 'personajes' }),
      btnNuevoPersonaje,
    ),
    personajesLista,
  );
  const assets = createEl('section', {},
    createEl('header', { className: 'admin-seccion' },
      createEl('h3', { className: 'mt-lg mb-sm', textContent: 'assets' }),
      btnNuevoAsset,
    ),
    assetsLista,
  );

  /* Actividad global: personajes + assets + publicaciones de mapas, cada una
   * aislada (si una falla, las demás siguen). */
  const actividad = createEl('section', {},
    createEl('h3', { className: 'mt-lg mb-sm', textContent: 'actividad' }),
    actividadContenido,
  );

  /* [297A-64] Tab "mapa": editor 2D del Bosque dentro de la misma ventana.
   * Se monta bajo demanda y se destruye al salir del panel (teardown del
   * editor: listeners, ResizeObserver y cargas pendientes). */
  const mapa = createEl('section', {},
    createEl('h3', { className: 'mt-lg mb-sm', textContent: 'editor de mapa' }),
  );

  const paneles = new Map<string, HTMLElement>([
    ['personajes', personajes],
    ['assets', assets],
    ['actividad', actividad],
    ['mapa', mapa],
  ]);
  const activos = new Map<string, boolean>();

  const tabs = createTabs({
    tabs: [
      { id: 'personajes', label: 'personajes' },
      { id: 'assets', label: 'assets' },
      { id: 'actividad', label: 'actividad' },
      { id: 'mapa', label: 'mapa' },
    ],
    initial: 'personajes',
    onSwitch: (id) => {
      for (const [tabId, panel] of paneles) {
        panel.hidden = tabId !== id;
      }
      /* [297A-63] Carga bajo demanda: cada tab monta su contenido una sola vez. */
      if (id === 'personajes' && !activos.get('personajes')) {
        activos.set('personajes', true);
        void renderPersonajes(personajesLista);
      } else if (id === 'assets' && !activos.get('assets')) {
        activos.set('assets', true);
        void renderAssets(assetsLista);
      } else if (id === 'actividad' && !activos.get('actividad')) {
        activos.set('actividad', true);
        void renderActividadGlobal(actividadContenido);
      } else if (id === 'mapa' && !activos.get('mapa')) {
        activos.set('mapa', true);
        /* [297A-64] El editor destruye su runtime al salir del panel: el
         * teardown queda registrado en el WeakMap y se libera en destroy(). */
        const editor = createGameMapEditor(mapa);
        gameMapEditorCleanups.set(mapa, editor.destroy);
      }
    },
  });

  const btnVolver = createEl('button', {
    type: 'button',
    className: 'boton',
    textContent: 'volver al Bosque',
  });
  btnVolver.addEventListener('click', () => options.onBack());

  const header = createEl('header', { className: 'admin-seccion juegoConfig__header' },
    createEl('h2', { className: 'juegoConfig__titulo', textContent: 'configuración del Bosque' }),
    btnVolver,
  );

  const element = createEl('div', { className: 'juegoConfig' },
    header,
    tabs.el,
    ...paneles.values(),
  );

  /* Tab inicial visible desde el montaje. */
  for (const [tabId, panel] of paneles) panel.hidden = tabId !== 'personajes';
  void renderPersonajes(personajesLista);
  activos.set('personajes', true);

  return {
    element,
    /* [297A-63] destroy() también retira el panel del DOM: la vista del juego
     * oculta sus hijos originales y monta este panel como último hijo; al
     * volver, el elemento debe desaparecer o quedaría superpuesto al Bosque
     * rehidratado. El cleanup de generaciones evita que las cargas
     * pendientes toquen un DOM ya desmontado. */
    destroy: () => {
      invalidatePersonajesLista(personajesLista);
      invalidateAssetsLista(assetsLista);
      gameMapEditorCleanups.get(mapa)?.();
      gameMapEditorCleanups.delete(mapa);
      element.remove();
    },
  };
}
