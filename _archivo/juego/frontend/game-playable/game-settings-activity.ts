/* GAME-01 — Sección de actividad del panel de configuración del Bosque.
 * [297A-63] Renderiza eventos auditados (personajes, assets y publicaciones
 * de mapas) de forma aislada: si una fuente falla, las demás siguen
 * operativas. SRP: solo presentación de auditoría; los tabs viven en
 * game-settings. */

import { tryCatch } from '../../../../utils/result';
import {
  GameAuditService,
  type GameAuditEventEntry,
} from '../../../../services/game-audit.service';
import { createEl } from '../../../../utils/dom';
import { createVacio } from '../../../../components/ui/empty-state';

const ACCION_ETIQUETA: Record<string, string> = {
  'character.created': 'creado',
  'character.updated': 'actualizado',
  'map.published': 'publicado',
  'asset.created': 'creado',
  'asset.updated': 'actualizado',
};

function formatFechaHora(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hora = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()} ${hora}`;
}

/** Sección de actividad reciente (últimos eventos auditados), aislada: si la
 * auditoría falla, solo la sección lo indica y el catálogo sigue operativo. */
export function renderActividad(
  result: { ok: true; value: GameAuditEventEntry[] } | { ok: false; error: string },
  titulo: string,
): HTMLElement {
  const seccion = createEl('section');
  seccion.appendChild(createEl('h4', { className: 'mt-md mb-sm', textContent: titulo }));
  if (!result.ok) {
    seccion.appendChild(createVacio('no se pudo cargar la actividad'));
    return seccion;
  }
  if (result.value.length === 0) {
    seccion.appendChild(createVacio('sin actividad reciente'));
    return seccion;
  }
  for (const event of result.value) {
    const label = ACCION_ETIQUETA[event.action] ?? event.action;
    const payload = event.payload;
    const nombre = typeof payload?.displayName === 'string' ? payload.displayName : event.entityId;
    const info = createEl('div', {},
      createEl('span', { textContent: `${label} · ${nombre}` }),
      createEl('small', { className: 'ml-sm', textContent: formatFechaHora(event.createdAt) }),
    );
    seccion.appendChild(createEl('div', { className: 'admin-item' }, info));
  }
  return seccion;
}

/** Carga aislada de las tres actividades en el tab "actividad". */
export async function renderActividadGlobal(container: HTMLElement): Promise<void> {
  container.textContent = '';
  const [personajes, assets, mapas] = await Promise.all([
    tryCatch(GameAuditService.listCharacterEvents({ limit: 10 })),
    tryCatch(GameAuditService.listAssetEvents({ limit: 10 })),
    tryCatch(GameAuditService.listMapEvents({ limit: 10 })),
  ]);
  container.appendChild(renderActividad(personajes, 'personajes'));
  container.appendChild(renderActividad(assets, 'assets'));
  container.appendChild(renderActividadMapas(mapas));
}

/** Sección de publicaciones de mapas recientes (últimos eventos auditados). */
function renderActividadMapas(result: { ok: true; value: GameAuditEventEntry[] } | { ok: false; error: string }): HTMLElement {
  const seccion = createEl('section');
  seccion.appendChild(createEl('h4', { className: 'mt-md mb-sm', textContent: 'publicaciones de mapas' }));
  if (!result.ok) {
    seccion.appendChild(createVacio('no se pudo cargar la actividad de mapas'));
    return seccion;
  }
  if (result.value.length === 0) {
    seccion.appendChild(createVacio('sin publicaciones recientes'));
    return seccion;
  }
  for (const event of result.value) {
    const label = ACCION_ETIQUETA[event.action] ?? event.action;
    const version = typeof event.payload?.schemaVersion === 'number' ? ` · v${event.payload.schemaVersion}` : '';
    const info = createEl('div', {},
      createEl('span', { textContent: `${label} · ${event.entityId}${version}` }),
      createEl('small', { className: 'ml-sm', textContent: formatFechaHora(event.createdAt) }),
    );
    seccion.appendChild(createEl('div', { className: 'admin-item' }, info));
  }
  return seccion;
}
