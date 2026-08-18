/* wandori.us — Notification Store
 * La API de notificaciones es la fuente canónica; el release activo queda
 * como fallback offline para que una migración o backend temporal no rompa la UI.
 * El estado leído local se conserva como degradación para visitantes. */

import { createStore, type Store } from '../../store';
import { authStore } from '../../store';
import { NotificationsService, type ApiNotification } from '../../services/notifications.service';
import { WorkspaceService } from '../../services/workspace.service';

export interface NotificationItem {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly releaseVersion: number;
  readonly publishedAt: string;
  readonly read: boolean;
}

export interface NotificationsState {
  readonly items: readonly NotificationItem[];
  readonly loading: boolean;
  readonly error: string | null;
}

const READ_KEY = 'wandorius:notifications-read';

function readIds(): Set<string> {
  try {
    const value = JSON.parse(localStorage.getItem(READ_KEY) ?? '[]');
    return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistRead(ids: Set<string>): void {
  localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids).slice(-100)));
}

function mapRemote(item: ApiNotification, ids: Set<string>): NotificationItem {
  return {
    id: item.id,
    title: item.title,
    body: item.body,
    releaseVersion: item.release_version ?? 0,
    publishedAt: item.published_at ?? item.created_at,
    read: item.read || ids.has(item.id),
  };
}

export const notificationsStore: Store<NotificationsState> = createStore({
  items: [],
  loading: false,
  error: null,
});

export async function loadNotifications(): Promise<void> {
  notificationsStore.set({ ...notificationsStore.get(), loading: true, error: null }, 'api');
  const ids = readIds();
  try {
    const publicResponse = await NotificationsService.listPublic();
    let items = publicResponse.items.map(item => mapRemote(item, ids));
    /* La cuenta obtiene sus lecturas persistentes sin cambiar la experiencia
     * pública ni convertir un fallo de sesión en un fallo de novedades. */
    if (authStore.get().isAuthenticated) {
      try {
        const mine = await NotificationsService.listMine();
        items = mine.items.map(item => mapRemote(item, ids));
      } catch {
        /* El listado público sigue siendo válido si la sesión expiró. */
      }
    }
    notificationsStore.set({ items, loading: false, error: null }, 'api');
  } catch {
    let release = null;
    try {
      release = await WorkspaceService.getActiveRelease();
    } catch {
      /* El fallback también puede estar offline; se muestra el error en la app. */
    }
    const items = release ? [{
      id: `workspace-release:${release.version}`,
      title: 'Novedades del escritorio',
      body: `El escritorio público está disponible en la versión ${release.version}.`,
      releaseVersion: release.version,
      publishedAt: release.published_at,
      read: ids.has(`workspace-release:${release.version}`),
    }] : [];
    notificationsStore.set({
      items,
      loading: false,
      error: items.length > 0 ? null : 'No se pudieron cargar las novedades.',
    }, 'api');
  }
}

export function markNotificationRead(id: string): void {
  const ids = readIds();
  ids.add(id);
  persistRead(ids);
  notificationsStore.update(state => ({
    ...state,
    items: state.items.map(item => item.id === id ? { ...item, read: true } : item),
  }), 'user');
  if (authStore.get().isAuthenticated && !id.startsWith('workspace-release:')) {
    void NotificationsService.markRead(id).catch(() => {
      /* El estado local ya evita que el usuario pierda la interacción offline. */
    });
  }
}

/* [028A-5] Marca todas las no leídas reutilizando el flujo local-first de
 * markNotificationRead. La API solo ofrece marcado individual; para listas
 * pequeñas es aceptable, y el estado local garantiza la consistencia offline.
 * Pendiente: un endpoint bulk backend (mark-read-all) evitaría N roundtrips
 * cuando la lista crezca. */
export function markAllNotificationsRead(): void {
  const pendientes = notificationsStore.get().items.filter(item => !item.read).map(item => item.id);
  for (const id of pendientes) markNotificationRead(id);
}

export function unreadNotificationCount(state: NotificationsState = notificationsStore.get()): number {
  return state.items.reduce((count, item) => count + (item.read ? 0 : 1), 0);
}
