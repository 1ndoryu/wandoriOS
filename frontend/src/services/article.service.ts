/* wandori.us — Article Service
 * Capa de servicio para operaciones con artículos.
 * Abstrae el API client para que los consumidores no dependan de transporte HTTP.
 * [Auditoría v4 §4.1] — Rompe acoplamiento directo a api.get/post en 5+ archivos.
 * [018A-33] Usa el contrato generado y conserva el servicio como boundary de dominio. */

import { unwrapGeneratedResponse } from '../api/client';
import {
  createArticle,
  deleteArticle,
  getArticle,
  getArticleByAlias,
  getArticleBySlug,
  listArticles,
  listArticlesAdmin,
  updateArticle,
} from '../api/generated/articles/articles';
import type {
  Article,
  CreateArticleRequest,
  UpdateArticleRequest,
  PaginatedArticles,
} from '../api/types';

export const ArticleService = {
  /** Listar artículos públicos con paginación. */
  async list(page = 1, perPage = 10): Promise<PaginatedArticles> {
    const response = await listArticles({ page, per_page: perPage });
    return unwrapGeneratedResponse<PaginatedArticles>(response, [200]);
  },

  /** Listar artículos por estado (admin). */
  async listByStatus(
    status: 'draft' | 'published' | 'all' = 'all',
    page = 1,
    perPage = 50,
  ): Promise<PaginatedArticles> {
    const response = await listArticlesAdmin({
      page,
      per_page: perPage,
      status: status === 'all' ? undefined : status,
    });
    return unwrapGeneratedResponse<PaginatedArticles>(response, [200]);
  },

  /** Obtener un artículo por slug (público). */
  async getBySlug(slug: string): Promise<Article> {
    const response = await getArticleBySlug(encodeURIComponent(slug));
    return unwrapGeneratedResponse<Article>(response, [200]);
  },

  /** Obtener un artículo por ID (admin). */
  async getById(id: string): Promise<Article> {
    const response = await getArticle(id);
    return unwrapGeneratedResponse<Article>(response, [200]);
  },

  /** Obtener artículo por alias (About, etc). */
  async getByAlias(alias: string): Promise<Article> {
    const response = await getArticleByAlias(encodeURIComponent(alias));
    return unwrapGeneratedResponse<Article>(response, [200]);
  },

  /** Crear un nuevo artículo (admin). */
  async create(data: CreateArticleRequest): Promise<Article> {
    const response = await createArticle(data);
    return unwrapGeneratedResponse<Article>(response, [201]);
  },

  /** Actualizar un artículo existente (admin). */
  async update(id: string, data: UpdateArticleRequest): Promise<Article> {
    const response = await updateArticle(id, {
      ...data,
      content: data.content ?? {},
    });
    return unwrapGeneratedResponse<Article>(response, [200]);
  },

  /** Eliminar un artículo (admin). */
  async delete(id: string): Promise<void> {
    const response = await deleteArticle(id);
    unwrapGeneratedResponse<void>(response, [204]);
  },

};
