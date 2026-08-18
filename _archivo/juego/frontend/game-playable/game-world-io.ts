/* [138A-9] Export del mundo del constructor: serializa y descarga el JSON sin
 * que la escena toque DOM/URL (boundary de plataforma).
 */
import {
  buildMapVersionFromOptions,
  serializeWorld,
  type MapVersion,
  type TerrainLayer,
  type TerrainOptions,
} from '../../../game-core';

export function downloadSerializedWorld(
  options: TerrainOptions,
  map: MapVersion | null,
  layers: readonly TerrainLayer[],
): void {
  const version = map ?? buildMapVersionFromOptions(options);
  const json = serializeWorld(
    options,
    version,
    layers.length > 0 ? layers : undefined,
  );
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bosque-${options.shape}-${options.seed}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
