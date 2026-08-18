/* GAME-01 — Fuente de mapa jugable del Bosque.
 * [297A-65] El runtime consume la publicación activa (`GET /api/game/maps/bosque`)
 * cuando existe; sin publicación o ante fallo de red/documento inválido cae de
 * forma fail-closed al fixture offline. El editor publica (297A-64) y al
 * volver al Bosque la rehidratación resuelve aquí el mapa nuevo: el circuito
 * editar → publicar → jugar queda cerrado. */

import { mapVersionToWorldMap, type MapVersion, type WorldMap } from '../../../game-core';
import { GAME_MAP_ID, GameMapAdminService } from '../../../../services/game-map-admin.service';
import { FIXTURE_MAP, FIXTURE_MAP_VERSION } from './game-fixture-map';

export interface ResolvedPlayableMap {
  /** Documento que alimenta la escena (publicado o fixture). */
  readonly document: MapVersion;
  /** Mundo resuelto (colliders/instancias) para simulación y render. */
  readonly world: WorldMap;
  /** Etiqueta de estado: `v<N>` si hay publicación, `fixture` si no. */
  readonly label: string;
  /** Versión activa (0 cuando se usa el fixture). */
  readonly version: number;
  readonly fromFixture: boolean;
}

export interface PlayableMapResolution {
  readonly map: ResolvedPlayableMap;
  /** true si el mapa activo no pudo resolverse por red/error (no 404). */
  readonly warning: boolean;
}

const FIXTURE_RESOLUTION: PlayableMapResolution = {
  map: {
    document: FIXTURE_MAP_VERSION,
    world: FIXTURE_MAP,
    label: 'fixture',
    version: 0,
    fromFixture: true,
  },
  warning: false,
};

/** Resuelve la fuente de mapa del Bosque. 404 (sin publicar) la traduce
 * `GameMapAdminService.getActive` a `null` → fixture sin aviso; cualquier otro
 * fallo (red, 5xx, documento inválido) también cae al fixture pero marca
 * `warning` para que la vista lo comunique (nunca bloquea la app). */
export async function resolvePlayableMap(options?: { signal?: AbortSignal }): Promise<PlayableMapResolution> {
  try {
    const loaded = await GameMapAdminService.getActive(GAME_MAP_ID, { signal: options?.signal });
    if (!loaded) return FIXTURE_RESOLUTION;
    return {
      map: {
        document: loaded.document,
        world: mapVersionToWorldMap(loaded.document),
        label: `v${loaded.activeVersion}`,
        version: loaded.activeVersion,
        fromFixture: false,
      },
      warning: false,
    };
  } catch (error: unknown) {
    /* 404 ya se tradujo a null dentro del servicio; aquí solo llegan fallos
     * reales (red/5xx/abort), siempre fail-closed al fixture. El error se
     * registra para diagnóstico: la UI muestra el aviso de mapa no disponible. */
    console.error('[Bosque mapa] No se pudo resolver el mapa publicado; se usa el fixture.', error);
    return {
      map: FIXTURE_RESOLUTION.map,
      warning: true,
    };
  }
}
