/* Tests del autosave del editor de artículos [297A-14 F5]:
 * - Debounce: schedule() no guarda inmediatamente; tras el delay crea/actualiza.
 * - Idempotencia create→update: el primer guardado crea (status draft) y
 *   conserva el ID; los siguientes actualizan con el mismo ID.
 * - Sin título no guarda; cancel()/destroy() limpian timers.
 * - El evento de dominio solo se emite en 'created' (evita churn del listado). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createArticleAutosave, AUTOSAVE_DELAY_MS, type ArticleDraftPayload } from './article-editor-autosave';
import { subscribeArticleEditorSaved } from '../../../runtime/article-editor-events';
import { ArticleService } from '../../../../services';

vi.mock('../../../../services', () => ({
  ArticleService: {
    update: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    listByStatus: vi.fn(),
    getBySlug: vi.fn(),
    getById: vi.fn(),
    getByAlias: vi.fn(),
    delete: vi.fn(),
  },
  ProjectService: {},
  ProductService: {},
  MediaService: {},
  SettingsService: {},
}));

const AUTOSAVE_DELAY = AUTOSAVE_DELAY_MS;

function makeDeps() {
  let articleId: string | undefined;
  const payload: ArticleDraftPayload = {
    title: 'mi borrador', excerpt: 'resumen', content: { type: 'doc' },
  };
  return {
    deps: {
      getArticleId: () => articleId,
      setArticleId: (id: string) => { articleId = id; },
      getPayload: () => payload,
      isActive: () => true,
    },
    getArticleId: () => articleId,
  };
}

describe('article-editor autosave [297A-14 F5]', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no guarda inmediatamente (debounce) y crea tras el delay con status draft', async () => {
    vi.mocked(ArticleService.create).mockResolvedValue({ id: 'art-1' } as never);
    const { deps } = makeDeps();
    const autosave = createArticleAutosave(deps);
    autosave.schedule();

    expect(ArticleService.create).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);

    expect(ArticleService.create).toHaveBeenCalledTimes(1);
    expect(ArticleService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'mi borrador', status: 'draft' }),
    );
    autosave.destroy();
  });

  it('conserva el ID: el segundo guardado actualiza con el mismo artículo', async () => {
    vi.mocked(ArticleService.create).mockResolvedValue({ id: 'art-1' } as never);
    vi.mocked(ArticleService.update).mockResolvedValue({ id: 'art-1' } as never);
    const { deps } = makeDeps();
    const autosave = createArticleAutosave(deps);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);
    expect(ArticleService.create).toHaveBeenCalledTimes(1);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);

    expect(ArticleService.update).toHaveBeenCalledTimes(1);
    expect(ArticleService.update).toHaveBeenCalledWith('art-1', expect.objectContaining({
      title: 'mi borrador',
    }));
    autosave.destroy();
  });

  it('no guarda sin título (guardia en saveDraft)', async () => {
    const payload: ArticleDraftPayload = { title: '   ', excerpt: '', content: { type: 'doc' } };
    const { deps } = makeDeps();
    const autosave = createArticleAutosave({
      ...deps,
      getPayload: () => payload,
    });

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);

    expect(ArticleService.create).not.toHaveBeenCalled();
    expect(ArticleService.update).not.toHaveBeenCalled();
    autosave.destroy();
  });

  it('cancel() cancela el timer pendiente y destroy() limpia sin doble guardado', async () => {
    vi.mocked(ArticleService.create).mockResolvedValue({ id: 'art-1' } as never);
    const { deps } = makeDeps();
    const autosave = createArticleAutosave(deps);

    autosave.schedule();
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);
    expect(ArticleService.create).not.toHaveBeenCalled();

    autosave.schedule();
    autosave.destroy();
    autosave.destroy(); /* idempotente */
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);
    expect(ArticleService.create).not.toHaveBeenCalled();
  });

  it('emite el evento de dominio solo al crear (created), no en updates de autosave', async () => {
    vi.mocked(ArticleService.create).mockResolvedValue({ id: 'art-1' } as never);
    vi.mocked(ArticleService.update).mockResolvedValue({ id: 'art-1' } as never);
    const events: string[] = [];
    const unsubscribe = subscribeArticleEditorSaved((e) => { events.push(e.operation); });
    const { deps } = makeDeps();
    const autosave = createArticleAutosave(deps);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY + 100);

    /* create → 'created'; el update de autosave NO emite (evita churn del listado). */
    expect(events).toEqual(['created']);
    expect(ArticleService.update).toHaveBeenCalledTimes(1);
    autosave.destroy();
    unsubscribe();
  });
});
