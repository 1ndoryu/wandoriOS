import { describe, expect, it, vi } from 'vitest';
import {
  publishArticleEditorSaved,
  subscribeArticleEditorSaved,
} from './article-editor-events';

describe('article editor events', () => {
  it('publica eventos a suscriptores y permite liberar el listener', () => {
    const listener = vi.fn();
    const stop = subscribeArticleEditorSaved(listener);

    publishArticleEditorSaved({ articleId: 'article-1', operation: 'created' });
    expect(listener).toHaveBeenCalledWith({ articleId: 'article-1', operation: 'created' });

    stop();
    publishArticleEditorSaved({ articleId: 'article-1', operation: 'updated' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('no comparte mutaciones ni exige un consumidor Admin', () => {
    const events: string[] = [];
    const stop = subscribeArticleEditorSaved(event => {
      events.push(`${event.operation}:${event.articleId}`);
    });

    publishArticleEditorSaved({ articleId: 'article-2', operation: 'updated' });
    stop();

    expect(events).toEqual(['updated:article-2']);
  });

  it('[028A-12] admite la operación deleted del soft delete', () => {
    const listener = vi.fn();
    const stop = subscribeArticleEditorSaved(listener);

    publishArticleEditorSaved({ articleId: 'article-3', operation: 'deleted' });
    expect(listener).toHaveBeenCalledWith({ articleId: 'article-3', operation: 'deleted' });

    stop();
  });
});
