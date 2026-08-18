import { unwrapGeneratedResponse } from '../api/client';
import {
  createAdmin,
  deleteNotification,
  listAdmin,
  listMine,
  listPublic,
  markRead,
  updateStatusAdmin,
} from '../api/generated/notifications/notifications';

export interface ApiNotification {
  id: string;
  kind: string;
  title: string;
  body: string;
  release_version: number | null;
  status?: string;
  created_by?: string | null;
  published_at: string | null;
  created_at: string;
  read?: boolean;
}

/** Campos completos disponibles solo para el panel administrativo. */
export interface ApiNotificationAdmin extends ApiNotification {
  status: string;
  created_by: string | null;
  read: boolean;
}

export interface NotificationsResponse {
  items: ApiNotification[];
  unread_count: number;
}

export interface NotificationsAdminResponse {
  items: ApiNotificationAdmin[];
  unread_count: number;
}

export const NotificationsService = {
  listPublic(): Promise<NotificationsResponse> {
    return listPublic().then((response) => unwrapGeneratedResponse<NotificationsResponse>(response, [200]));
  },

  listMine(): Promise<NotificationsResponse> {
    return listMine().then((response) => unwrapGeneratedResponse<NotificationsResponse>(response, [200]));
  },

  async markRead(id: string): Promise<void> {
    const response = await markRead(encodeURIComponent(id));
    unwrapGeneratedResponse<void>(response, [204]);
  },

  async listAdmin(): Promise<NotificationsAdminResponse> {
    const response = await listAdmin();
    return unwrapGeneratedResponse<NotificationsAdminResponse>(response, [200]);
  },

  async createAdmin(data: { kind: string; title: string; body: string; status: 'draft' | 'published' }): Promise<ApiNotificationAdmin> {
    const response = await createAdmin(data);
    return unwrapGeneratedResponse<ApiNotificationAdmin>(response, [200]);
  },

  async updateStatus(id: string, status: 'draft' | 'published' | 'archived'): Promise<ApiNotificationAdmin> {
    const response = await updateStatusAdmin(encodeURIComponent(id), { status });
    return unwrapGeneratedResponse<ApiNotificationAdmin>(response, [200]);
  },

  /** Elimina un aviso (incluidos los ya publicados); sus lecturas se borran en cascada. */
  async deleteAdmin(id: string): Promise<void> {
    const response = await deleteNotification(encodeURIComponent(id));
    unwrapGeneratedResponse<void>(response, [204]);
  },
};
