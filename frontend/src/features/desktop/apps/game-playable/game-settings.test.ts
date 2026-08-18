import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameSettingsPanel } from './game-settings';
import { GameCharacterAdminService } from '../../../../services/game-character-admin.service';
import { GameAssetAdminService } from '../../../../services/game-asset-admin.service';
import { GameAuditService, isValidAuditEvent } from '../../../../services/game-audit.service';

function characterEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'forest-scout',
    displayName: 'Explorador',
    bodyTone: 'ink',
    isActive: true,
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function assetEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'oak',
    displayName: 'Roble',
    category: 'tree',
    isActive: true,
    createdAt: '2026-08-02T00:00:00Z',
    ...overrides,
  };
}

function auditEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    actorKind: 'admin',
    action: 'character.created',
    entityKind: 'character',
    entityId: 'forest-scout',
    payload: { displayName: 'Explorador', bodyTone: 'ink', isActive: true },
    createdAt: '2026-08-02T00:00:00Z',
    ...overrides,
  };
}

function mountPanel(): { element: HTMLElement; destroy: () => void } {
  const onBack = vi.fn();
  const panel = createGameSettingsPanel({ onBack });
  document.body.appendChild(panel.element);
  return { element: panel.element, destroy: panel.destroy };
}

describe('createGameSettingsPanel (297A-63)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.textContent = '';
    document.body.style.overflow = '';
  });

  it('monta un panel con tabs (no un modal) dentro del documento', async () => {
    vi.spyOn(GameCharacterAdminService, 'listAll').mockResolvedValue([
      characterEntry() as never,
    ]);
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue([
      assetEntry() as never,
    ]);
    vi.spyOn(GameAuditService, 'listCharacterEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listAssetEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listMapEvents').mockResolvedValue([] as never);

    const { element, destroy } = mountPanel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /* No es un modal: no hay overlay y el panel es hijo directo del body. */
    expect(document.querySelector('.modal-overlay')).toBeNull();
    expect(element.classList.contains('juegoConfig')).toBe(true);
    expect(element.textContent).toContain('configuración del Bosque');
    /* Tabs del OS para organizar. */
    expect(element.textContent).toContain('personajes');
    expect(element.textContent).toContain('assets');
    expect(element.textContent).toContain('actividad');
    /* El tab inicial (personajes) monta su catálogo; assets queda oculto. */
    expect(element.textContent).toContain('Explorador');
    destroy();
  });

  it('cambia de tab y monta el catálogo correspondiente bajo demanda', async () => {
    vi.spyOn(GameCharacterAdminService, 'listAll').mockResolvedValue([
      characterEntry() as never,
    ]);
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue([
      assetEntry() as never,
    ]);
    vi.spyOn(GameAuditService, 'listCharacterEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listAssetEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listMapEvents').mockResolvedValue([] as never);

    const { element, destroy } = mountPanel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const assetsTab = Array.from(element.querySelectorAll<HTMLButtonElement>('button[role="tab"]'))
      .find((button) => button.textContent === 'assets');
    expect(assetsTab).toBeDefined();
    assetsTab?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(element.textContent).toContain('Roble');
    destroy();
  });

  it('muestra el estado vacío si un catálogo no tiene entradas', async () => {
    vi.spyOn(GameCharacterAdminService, 'listAll').mockResolvedValue([] as never);
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listCharacterEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listAssetEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listMapEvents').mockResolvedValue([] as never);

    const { element, destroy } = mountPanel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    /* [317A-2] createVacio capitaliza la primera letra del estado vacío. */
    expect(element.textContent).toContain('No hay personajes en el catálogo');
    destroy();
  });

  it('mantiene los catálogos operativos si la auditoría falla (aislamiento)', async () => {
    vi.spyOn(GameCharacterAdminService, 'listAll').mockResolvedValue([
      characterEntry() as never,
    ]);
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue([
      assetEntry() as never,
    ]);
    vi.spyOn(GameAuditService, 'listCharacterEvents').mockRejectedValue(new Error('audit down'));
    vi.spyOn(GameAuditService, 'listAssetEvents').mockRejectedValue(new Error('audit down'));
    vi.spyOn(GameAuditService, 'listMapEvents').mockRejectedValue(new Error('audit down'));

    const { element, destroy } = mountPanel();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(element.textContent).toContain('Explorador');
    expect(element.textContent).toContain('No se pudo cargar la actividad');
    destroy();
  });

  it('destruir el panel lo retira del DOM (no queda superpuesto al juego)', () => {
    vi.spyOn(GameCharacterAdminService, 'listAll').mockResolvedValue([] as never);
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listCharacterEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listAssetEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listMapEvents').mockResolvedValue([] as never);

    const { element, destroy } = mountPanel();
    expect(document.body.contains(element)).toBe(true);
    destroy();
    expect(document.body.contains(element)).toBe(false);
  });

  it('invoca onBack al pulsar volver al Bosque', () => {
    vi.spyOn(GameCharacterAdminService, 'listAll').mockResolvedValue([] as never);
    vi.spyOn(GameAssetAdminService, 'listAll').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listCharacterEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listAssetEvents').mockResolvedValue([] as never);
    vi.spyOn(GameAuditService, 'listMapEvents').mockResolvedValue([] as never);

    const onBack = vi.fn();
    const panel = createGameSettingsPanel({ onBack });
    document.body.appendChild(panel.element);

    const volver = Array.from(panel.element.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'volver al Bosque');
    expect(volver).toBeDefined();
    volver?.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('game-settings audit event rendering', () => {
  it('isValidAuditEvent acepta eventos de assets y de personajes', () => {
    /* [297A-61] Los pares acción-entidad ya están en el validador compartido. */
    expect(isValidAuditEvent(auditEvent({ action: 'asset.created', entityKind: 'asset', id: 9 }))).toBe(true);
    expect(isValidAuditEvent(auditEvent({ action: 'character.updated', id: 10 }))).toBe(true);
  });
});
