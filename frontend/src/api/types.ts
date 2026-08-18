/* wandori.us — API Types
 * Tipos TypeScript para las respuestas de la API.
 * La superficie se migra gradualmente a los contratos generados por Orval. */

import type {
  AssetProcessingState,
  MediaAdminResponse,
  MediaPublicResponse,
  MediaUploadResponse,
} from './generated/index.schemas';

/* === Auth === */
export interface LoginRequest {
  email: string;
  password: string;
}

/* === Articles === */
/* [018A-38] Separar identidad, contenido y estado mantiene ISP sin cambiar
 * el nombre público `Article` que consumen las vistas/editor y servicios. */
interface ArticleIdentity {
  id: string;
  title: string;
  slug: string;
  created_at: string;
  updated_at: string;
}

interface ArticleContent {
  content: Record<string, unknown>; /* TipTap JSON */
  excerpt: string;
  cover_image: string | null;
}

interface ArticlePublication {
  status: 'draft' | 'published';
  is_pinned: boolean;
  published_at: string | null;
}

export interface Article extends ArticleIdentity, ArticleContent, ArticlePublication {}

export interface CreateArticleRequest {
  title: string;
  content: Record<string, unknown>;
  excerpt?: string;
  cover_image?: string;
  status?: 'draft' | 'published';
  is_pinned?: boolean;
}

export interface UpdateArticleRequest {
  title?: string;
  content?: Record<string, unknown>;
  excerpt?: string;
  cover_image?: string;
  status?: 'draft' | 'published';
  is_pinned?: boolean;
}

export interface PaginatedArticles {
  items: Article[];
  total: number;
  page: number;
  per_page: number;
}

/* === Media === */
export type AssetState = AssetProcessingState;
export type MediaPublic = MediaPublicResponse;
export type MediaAdmin = MediaAdminResponse;
/* La subida conserva la misma metadata base que la biblioteca admin. */
export type MediaUpload = MediaUploadResponse;

/* === Products === */
export interface Product {
  id: string;
  article_id: string | null;
  name: string;
  description: string;
  price_cents: number;
  currency: string;
  is_active: boolean;
  created_at: string;
}

export interface CreateProductRequest {
  article_id?: string;
  name: string;
  description?: string;
  price_cents: number;
  currency?: string;
  is_active?: boolean;
}

/* [297A-15] Historial de compras y descargas. El contrato backend nunca
 * expone session/intent del proveedor, idempotency_key ni el token: el
 * cliente solo ve el estado de la entrega. */
export interface OrderHistoryItem {
  id: string;
  product_id: string;
  product_name: string;
  price_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  delivered_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

export interface DownloadHistoryItem {
  product_name: string;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface UpdateProductRequest {
  name?: string;
  description?: string;
  price_cents?: number;
  currency?: string;
  is_active?: boolean;
}

/* === Orders === */
export interface Order {
  id: string;
  product_id: string;
  customer_email: string;
  status: 'pending' | 'paid' | 'delivered' | 'failed';
  paid_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

/* === Projects === */
export interface ProjectAdminResponse {
  id: string;
  title: string;
  description: string;
  url: string | null;
  /** [018A-85] URL de la imagen de portada (null = sin portada). */
  cover_image: string | null;
  sort_order: number;
  is_visible: boolean;
  created_at: string;
}

export interface ProjectPublicResponse {
  id: string;
  title: string;
  description: string;
  url: string | null;
  /** [018A-85] URL de la imagen de portada (null = sin portada). */
  cover_image: string | null;
  created_at: string;
}

/** Alias de compatibilidad para editores administrativos existentes. */
export type Project = ProjectAdminResponse;

export interface CreateProjectRequest {
  title: string;
  description?: string;
  url?: string;
  cover_image?: string;
  sort_order?: number;
  is_visible?: boolean;
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string;
  url?: string | null;
  /** [018A-85] Ausente = no tocar; null = limpiar; string = reemplazar. */
  cover_image?: string | null;
  sort_order?: number;
  is_visible?: boolean;
}

/* === Game === */
export interface GameProfile {
  displayName: string;
  characterId: string;
  revision: number;
  updatedAt: string;
}

export interface GameCharacterDefinition {
  id: string;
  displayName: string;
  bodyTone: 'ink' | 'middle' | 'paper';
}

/* === Settings === */
export interface SiteSettings {
  [key: string]: string;
}

/* === Analytics === */
export interface AnalyticsEvent {
  event_id?: string;
  event_type: string;
  target_type?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsStats {
  total_page_views: number;
  total_clicks: number;
  total_downloads: number;
  total_purchases: number;
  top_articles: Array<{ id: string; title: string; views: number }>;
  recent_events: Array<{
    event_type: string;
    target_type: string;
    created_at: string;
  }>;
}
