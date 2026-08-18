import { describe, expect, it, vi } from 'vitest';
import {
  publishProjectEditorSaved,
  subscribeProjectEditorSaved,
} from './project-editor-events';

describe('project editor events', () => {
  it('publica el guardado y libera el suscriptor', () => {
    const listener = vi.fn();
    const stop = subscribeProjectEditorSaved(listener);

    publishProjectEditorSaved({ projectId: 'project-1', operation: 'created' });
    expect(listener).toHaveBeenCalledWith({ projectId: 'project-1', operation: 'created' });

    stop();
    publishProjectEditorSaved({ projectId: 'project-1', operation: 'updated' });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
