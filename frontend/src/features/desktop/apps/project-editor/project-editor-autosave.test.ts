/* Tests del autosave del editor de proyectos [297A-14 F5]:
 * - Debounce: no guarda inmediatamente; tras el delay crea con is_visible=false.
 * - Idempotencia create→update: conserva el ID; el segundo guardado actualiza.
 * - Sin título no guarda; cancel()/destroy() limpian timers.
 * - El evento de dominio solo se emite en 'created'. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createProjectAutosave, PROJECT_AUTOSAVE_DELAY_MS, type ProjectDraftPayload } from './project-editor-autosave';
import { subscribeProjectEditorSaved } from '../../../runtime/project-editor-events';
import { ProjectService } from '../../../../services';

vi.mock('../../../../services', () => ({
  ProjectService: {
    update: vi.fn(),
    create: vi.fn(),
    list: vi.fn(),
    listAll: vi.fn(),
    getById: vi.fn(),
    delete: vi.fn(),
  },
  ArticleService: {},
  ProductService: {},
  MediaService: {},
  SettingsService: {},
}));

function makeDeps() {
  let projectId: string | undefined;
  const payload: ProjectDraftPayload = {
    title: 'mi proyecto', description: 'desc', url: 'https://x', coverImage: '', sortOrder: 1,
  };
  return {
    deps: {
      getProjectId: () => projectId,
      setProjectId: (id: string) => { projectId = id; },
      getPayload: () => payload,
      isActive: () => true,
    },
    getProjectId: () => projectId,
  };
}

describe('project-editor autosave [297A-14 F5]', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('crea tras el debounce con is_visible=false (no publica automáticamente)', async () => {
    vi.mocked(ProjectService.create).mockResolvedValue({ id: 'proj-1' } as never);
    const { deps } = makeDeps();
    const autosave = createProjectAutosave(deps);
    autosave.schedule();

    expect(ProjectService.create).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);

    expect(ProjectService.create).toHaveBeenCalledTimes(1);
    expect(ProjectService.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'mi proyecto', is_visible: false }),
    );
    autosave.destroy();
  });

  it('conserva el ID: el segundo guardado actualiza con el mismo proyecto', async () => {
    vi.mocked(ProjectService.create).mockResolvedValue({ id: 'proj-1' } as never);
    vi.mocked(ProjectService.update).mockResolvedValue({ id: 'proj-1' } as never);
    const { deps } = makeDeps();
    const autosave = createProjectAutosave(deps);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);
    expect(ProjectService.create).toHaveBeenCalledTimes(1);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);

    expect(ProjectService.update).toHaveBeenCalledTimes(1);
    expect(ProjectService.update).toHaveBeenCalledWith('proj-1', expect.objectContaining({
      title: 'mi proyecto',
    }));
    autosave.destroy();
  });

  it('no guarda sin título (guardia en saveDraft)', async () => {
    const payload: ProjectDraftPayload = { title: '   ', description: '', url: '', coverImage: '', sortOrder: 0 };
    const { deps } = makeDeps();
    const autosave = createProjectAutosave({
      ...deps,
      getPayload: () => payload,
    });

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);

    expect(ProjectService.create).not.toHaveBeenCalled();
    expect(ProjectService.update).not.toHaveBeenCalled();
    autosave.destroy();
  });

  it('cancel() cancela el timer y destroy() limpia sin doble guardado', async () => {
    vi.mocked(ProjectService.create).mockResolvedValue({ id: 'proj-1' } as never);
    const { deps } = makeDeps();
    const autosave = createProjectAutosave(deps);

    autosave.schedule();
    autosave.cancel();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);
    expect(ProjectService.create).not.toHaveBeenCalled();

    autosave.schedule();
    autosave.destroy();
    autosave.destroy(); /* idempotente */
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);
    expect(ProjectService.create).not.toHaveBeenCalled();
  });

  it('emite el evento de dominio solo al crear, no en updates de autosave', async () => {
    vi.mocked(ProjectService.create).mockResolvedValue({ id: 'proj-1' } as never);
    vi.mocked(ProjectService.update).mockResolvedValue({ id: 'proj-1' } as never);
    const events: string[] = [];
    const unsubscribe = subscribeProjectEditorSaved((e) => { events.push(e.operation); });
    const { deps } = makeDeps();
    const autosave = createProjectAutosave(deps);

    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(PROJECT_AUTOSAVE_DELAY_MS + 100);

    expect(events).toEqual(['created']);
    expect(ProjectService.update).toHaveBeenCalledTimes(1);
    autosave.destroy();
    unsubscribe();
  });
});
