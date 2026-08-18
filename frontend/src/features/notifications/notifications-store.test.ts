import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceService } from '../../services/workspace.service';
import {
  loadNotifications,
  markNotificationRead,
  notificationsStore,
  unreadNotificationCount,
} from './notifications-store';

describe('notifications store', () => {
  beforeEach(() => {
    localStorage.clear();
    notificationsStore.set({ items: [], loading: false, error: null }, 'init');
    vi.restoreAllMocks();
  });

  it('deriva una novedad por release y la conserva sin leer', async () => {
    vi.spyOn(WorkspaceService, 'getActiveRelease').mockResolvedValue({
      version: 7,
      tree: { version: 7, nodes: {} },
      published_at: '2026-08-01T00:00:00Z',
    });

    await loadNotifications();
    expect(notificationsStore.get().items[0]?.id).toBe('workspace-release:7');
    expect(unreadNotificationCount()).toBe(1);
  });

  it('marca localmente una novedad y no duplica el identificador leído', async () => {
    vi.spyOn(WorkspaceService, 'getActiveRelease').mockResolvedValue({
      version: 8,
      tree: { version: 8, nodes: {} },
      published_at: '2026-08-01T00:00:00Z',
    });
    await loadNotifications();
    markNotificationRead('workspace-release:8');
    markNotificationRead('workspace-release:8');

    expect(unreadNotificationCount()).toBe(0);
    expect(JSON.parse(localStorage.getItem('wandorius:notifications-read') ?? '[]'))
      .toEqual(['workspace-release:8']);
  });

  it('expone un error visible cuando falla la fuente pública', async () => {
    vi.spyOn(WorkspaceService, 'getActiveRelease').mockRejectedValue(new Error('offline'));
    await loadNotifications();
    expect(notificationsStore.get().error).toBe('No se pudieron cargar las novedades.');
    expect(notificationsStore.get().loading).toBe(false);
  });
});
