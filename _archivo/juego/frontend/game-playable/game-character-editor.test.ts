import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from '../../../../store';
import { openGameCharacterEditor } from './game-character-editor';
import type { GameCharacterDefinition, GameProfile } from '../../../../api/types';

const CHARACTERS: GameCharacterDefinition[] = [
  { id: 'forest-scout', displayName: 'Explorador', bodyTone: 'ink' },
  { id: 'forest-ranger', displayName: 'Guardabosques', bodyTone: 'middle' },
  { id: 'forest-spirit', displayName: 'Espíritu', bodyTone: 'paper' },
];

function savedProfile(): GameProfile {
  return {
    displayName: 'Guardabosques',
    characterId: 'forest-ranger',
    revision: 1,
    updatedAt: '2026-08-02T00:00:00Z',
  };
}

function findButton(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button'))
    .find(candidate => candidate.textContent === text) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`botón "${text}" no encontrado`);
  return button;
}

async function flush(): Promise<void> {
  /* [297A-54] La cadena del servicio (fetch + body parse) necesita al menos un
   * macrotask real para completarse; las microtareas solas no bastan. */
  await new Promise(resolve => setTimeout(resolve, 0));
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
}

describe('openGameCharacterEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authStore.set({ isAuthenticated: true, userId: 'user-1', capability: 'authenticated' }, 'sync');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('saves the chosen character and name and reports the persisted profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify(savedProfile()), { status: 200 }),
    ));
    const onSaved = vi.fn();
    openGameCharacterEditor({
      characters: CHARACTERS,
      initial: { displayName: 'Explorador', characterId: 'forest-scout', revision: 0 },
      isAuthenticated: true,
      onSaved,
    });

    /* Cambiar de personaje vía el select del OS y de nombre vía el input. */
    (document.querySelector('.campo-select') as HTMLButtonElement).click();
    await flush();
    (document.querySelector('[data-value="forest-ranger"]') as HTMLElement).click();

    const input = document.querySelector('.campo-entrada') as HTMLInputElement;
    input.value = 'Guardabosques';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    findButton('guardar').click();
    await flush();

    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/game/profile');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({
      displayName: 'Guardabosques',
      characterId: 'forest-ranger',
      expectedRevision: 0,
    });
    expect(onSaved).toHaveBeenCalledWith(savedProfile());
    expect(document.querySelector('.modal-overlay')).toBeNull();
  });

  it('keeps guests from saving and explains the identity policy', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    openGameCharacterEditor({
      characters: CHARACTERS,
      initial: { displayName: 'Explorador', characterId: 'forest-scout', revision: 0 },
      isAuthenticated: false,
      onSaved,
    });

    expect(findButton('guardar').disabled).toBe(true);
    const feedback = Array.from(document.querySelectorAll('.modal-feedback'));
    expect(feedback.some(el => el.textContent?.includes('inicia sesión para guardar'))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces the guest 401 boundary without claiming a persistent profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    ));
    const onSaved = vi.fn();
    openGameCharacterEditor({
      characters: CHARACTERS,
      initial: { displayName: 'Explorador', characterId: 'forest-scout', revision: 0 },
      isAuthenticated: true,
      onSaved,
    });

    findButton('guardar').click();
    await flush();

    const feedback = Array.from(document.querySelectorAll('.modal-feedback'));
    expect(feedback.some(el => el.textContent?.includes('inicia sesión'))).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
    expect(authStore.get().capability).toBe('public');
  });

  it('reports an optimistic revision conflict without closing the modal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'conflict' }), { status: 409 }),
    ));
    const onSaved = vi.fn();
    openGameCharacterEditor({
      characters: CHARACTERS,
      initial: { displayName: 'Explorador', characterId: 'forest-scout', revision: 0 },
      isAuthenticated: true,
      onSaved,
    });

    findButton('guardar').click();
    await flush();

    const feedback = Array.from(document.querySelectorAll('.modal-feedback'));
    expect(feedback.some(el => el.textContent?.includes('cambió en otra ventana'))).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.querySelector('.modal-overlay')).not.toBeNull();
  });

  it('rejects an invalid display name before touching the network', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn();
    openGameCharacterEditor({
      characters: CHARACTERS,
      initial: { displayName: 'Explorador', characterId: 'forest-scout', revision: 0 },
      isAuthenticated: true,
      onSaved,
    });

    const input = document.querySelector('.campo-entrada') as HTMLInputElement;
    input.value = 'x'.repeat(25);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    findButton('guardar').click();
    await flush();

    const feedback = Array.from(document.querySelectorAll('.modal-feedback'));
    expect(feedback.some(el => el.textContent?.includes('nombre no válido'))).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
