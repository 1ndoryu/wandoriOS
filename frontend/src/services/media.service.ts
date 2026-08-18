/* wandori.us — Media Service
 * Capa de servicio para operaciones con archivos multimedia.
 * [297A-14] Alineado al contrato real del backend: público GET /api/media
 * (solo clean+public+active); admin bajo /api/admin/media con subida,
 * listado (incluye processing/rejected), papelera, soft delete y restore. */

import { unwrapGeneratedResponse } from '../api/client';
import {
  deleteMedia,
  listAdminMedia,
  listMedia,
  listTrashedMedia,
  restoreMedia,
  uploadMedia,
} from '../api/generated/media-handler/media-handler';
import type { MediaAdmin, MediaPublic, MediaUpload } from '../api/types';

export const MediaService = {
  /** Subir un archivo multimedia (admin). El tipo lo decide el backend. */
  async upload(file: File, options?: { articleId?: string; altText?: string }): Promise<MediaUpload> {
    const formData = new FormData();
    formData.append('file', file);
    if (options?.articleId) formData.append('article_id', options.articleId);
    if (options?.altText) formData.append('alt_text', options.altText);
    const response = await uploadMedia({ body: formData });
    return unwrapGeneratedResponse<MediaUpload>(response, [201]);
  },

  /** Listar archivos multimedia públicos: solo clean + public + active. */
  async list(): Promise<MediaPublic[]> {
    const response = await listMedia();
    return unwrapGeneratedResponse<MediaPublic[]>(response, [200]);
  },

  /** Listar media admin: envelope activo, incluye processing/rejected. */
  async listAdmin(): Promise<MediaAdmin[]> {
    const response = await listAdminMedia();
    return unwrapGeneratedResponse<MediaAdmin[]>(response, [200]);
  },

  /** Listar media en la papelera (admin). */
  async listTrashed(): Promise<MediaAdmin[]> {
    const response = await listTrashedMedia();
    return unwrapGeneratedResponse<MediaAdmin[]>(response, [200]);
  },

  /** Eliminar media (admin) — soft delete: pasa a la papelera. */
  async delete(id: string): Promise<void> {
    const response = await deleteMedia(id);
    unwrapGeneratedResponse<void>(response, [204]);
  },

  /** Restaurar media desde la papelera (admin). */
  async restore(id: string): Promise<void> {
    const response = await restoreMedia(id);
    unwrapGeneratedResponse<void>(response, [204]);
  },
};
