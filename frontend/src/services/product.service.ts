/* wandori.us — Product Service
 * Capa de servicio para operaciones con productos.
 * [297A-14] Alineado al contrato canónico: admin bajo /api/admin/products,
 * público por artículo y checkout en rutas públicas reales.
 * [018A-33] CRUD y checkout comparten el mutator generado con auth/CSRF. */

import { generatedFetcher, unwrapGeneratedResponse, type GeneratedResponse } from '../api/client';
import {
  checkout,
  createProduct,
  deleteProduct,
  getProduct,
  listAllProducts,
  listProductsByArticle,
  listPublicProducts,
  updateProduct,
} from '../api/generated/products-handler/products-handler';
import type {
  CreateProductRequest,
  DownloadHistoryItem,
  OrderHistoryItem,
  Product,
  UpdateProductRequest,
} from '../api/types';

export const ProductService = {
  /** Catálogo público de la app Tienda. */
  async listPublic(): Promise<Product[]> {
    const response = await listPublicProducts();
    return unwrapGeneratedResponse<Product[]>(response, [200]);
  },
  /** Obtener un producto por ID (admin). */
  async getById(id: string, options?: { signal?: AbortSignal }): Promise<Product> {
    const response = await getProduct(id, options);
    return unwrapGeneratedResponse<Product>(response, [200]);
  },

  /** Obtener productos activos asociados a un artículo (público). */
  async getByArticleId(articleId: string): Promise<Product | null> {
    const response = await listProductsByArticle(articleId);
    const products = unwrapGeneratedResponse<Product[]>(response, [200]);
    return products[0] ?? null;
  },

  /** Listar todos los productos (admin). */
  async listAll(): Promise<Product[]> {
    const response = await listAllProducts();
    return unwrapGeneratedResponse<Product[]>(response, [200]);
  },

  /** Crear un nuevo producto (admin). Nace inactivo/private por defecto. */
  async create(data: CreateProductRequest): Promise<Product> {
    const response = await createProduct(data);
    return unwrapGeneratedResponse<Product>(response, [201]);
  },

  /** Actualizar un producto (admin). */
  async update(id: string, data: UpdateProductRequest): Promise<Product> {
    const response = await updateProduct(id, data);
    return unwrapGeneratedResponse<Product>(response, [200]);
  },

  /** Eliminar un producto (admin). */
  async delete(id: string): Promise<void> {
    const response = await deleteProduct(id);
    unwrapGeneratedResponse<void>(response, [204]);
  },

  /** Crear sesión de checkout para un producto (público).
   * [297A-15] La misma clave viaja en body y header para que un reintento
   * del navegador no cree una segunda orden/cobro. */
  async createCheckout(productId: string, email: string, idempotencyKey = crypto.randomUUID()): Promise<{ checkout_url: string }> {
    const response = await checkout(
      productId,
      { email, idempotency_key: idempotencyKey },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
    return unwrapGeneratedResponse<{ checkout_url: string }>(response, [200]);
  },

  /** [297A-15] Historial de órdenes de la cuenta (sesión). Nunca expone
   * identificadores del proveedor ni claves de idempotencia. */
  async listMyOrders(options?: { signal?: AbortSignal }): Promise<OrderHistoryItem[]> {
    const response = await generatedFetcher<GeneratedResponse<OrderHistoryItem[]>>('/api/me/orders', { signal: options?.signal });
    return unwrapGeneratedResponse<OrderHistoryItem[]>(response, [200]);
  },

  /** [297A-15] Estado de las descargas de la cuenta (sesión). El token de
   * descarga nunca viaja por API: solo el estado del grant. */
  async listMyDownloads(options?: { signal?: AbortSignal }): Promise<DownloadHistoryItem[]> {
    const response = await generatedFetcher<GeneratedResponse<DownloadHistoryItem[]>>('/api/me/downloads', { signal: options?.signal });
    return unwrapGeneratedResponse<DownloadHistoryItem[]>(response, [200]);
  },
};
