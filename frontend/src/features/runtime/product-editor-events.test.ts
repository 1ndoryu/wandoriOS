import { describe, expect, it, vi } from 'vitest';
import {
  publishProductEditorSaved,
  subscribeProductEditorSaved,
} from './product-editor-events';

describe('product editor events', () => {
  it('publica el guardado y libera el suscriptor', () => {
    const listener = vi.fn();
    const stop = subscribeProductEditorSaved(listener);

    publishProductEditorSaved({ productId: 'product-1', operation: 'created' });
    expect(listener).toHaveBeenCalledWith({ productId: 'product-1', operation: 'created' });

    stop();
    publishProductEditorSaved({ productId: 'product-1', operation: 'updated' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
