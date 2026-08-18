/* wandori.us — Workspace Service
 * Capa de servicio para el workspace (releases, draft, overlay).
 * [Auditoría v4 §4.2] — Separa flatten (puro) de publish (HTTP).
 * [Plan §9.2] — Preparación para 297A-11 draft/release y 297A-13 overlay remoto.
 * [018A-35] El transporte es generado; las conversiones conservan el modelo
 * rico del runtime sin exponerlo al contrato HTTP. */

import { unwrapGeneratedResponse } from '../api/client';
import {
  getActiveRelease,
  getReleaseByVersion,
  listReleases,
  publishRelease,
  getWorkspaceControl,
  validateRelease,
  activateRelease,
} from '../api/generated/workspace-handler/workspace-handler';
import {
  getOverlay,
  updateOverlay,
} from '../api/generated/workspace-overlay-handler/workspace-overlay-handler';
import type { WorkspaceOverlay, WorkspaceTree } from '../features/runtime/workspace/types';

export interface ReleaseInfo {
  version: number;
  tree: WorkspaceTree;
  published_at: string;
}

export interface ReleaseListItem {
  id: string;
  version: number;
  published_at: string;
  published_by: string | null;
  is_active: boolean;
  node_count: number;
  diff_from: number | null;
  summary: Record<string, unknown>;
}

export interface ReleaseControl {
  active_version: number | null;
  active_node_count: number | null;
  active_published_at: string | null;
  active_published_by: string | null;
  latest_version: number | null;
  total_releases: number;
}

export interface ReleaseValidation {
  version: number;
  valid: boolean;
  issues: Array<{ node_id: string; message: string }>;
  broken_refs: Array<{ id: string; ref_id: string; label: string }>;
}

export interface WorkspaceOverlayResponse {
  overlay: WorkspaceOverlay;
  revision: number;
  updated_at: string;
}

export interface UpdateWorkspaceOverlayRequest {
  overlay: WorkspaceOverlay;
  expected_revision: number;
}

function toReleaseInfo(data: {
  version: number;
  tree: Record<string, unknown>;
  published_at: string;
}): ReleaseInfo {
  return {
    version: data.version,
    published_at: data.published_at,
    tree: data.tree as unknown as WorkspaceTree,
  };
}

function toOverlayResponse(data: {
  overlay: Record<string, unknown>;
  revision: number;
  updated_at: string;
}): WorkspaceOverlayResponse {
  return {
    overlay: data.overlay as unknown as WorkspaceOverlay,
    revision: data.revision,
    updated_at: data.updated_at,
  };
}

export const WorkspaceService = {
  /** Obtener el release activo (público). */
  async getActiveRelease(): Promise<ReleaseInfo | null> {
    const response = await getActiveRelease();
    if (response.status === 404) return null;
    return toReleaseInfo(unwrapGeneratedResponse(response, [200]));
  },

  /** Obtener un release por versión (admin). */
  async getReleaseByVersion(version: number): Promise<ReleaseInfo> {
    const response = await getReleaseByVersion(version);
    return toReleaseInfo(unwrapGeneratedResponse(response, [200]));
  },

  /** Listar historial de releases (admin). */
  async listReleases(): Promise<ReleaseListItem[]> {
    const response = await listReleases();
    const result = unwrapGeneratedResponse<{ items: Array<{
      id: string;
      version: number;
      publishedAt: string;
      publishedBy?: string | null;
      isActive: boolean;
      nodeCount: number;
      diffFrom?: number | null;
      summary: Record<string, unknown>;
    }> }>(response, [200]);
    return result.items.map((item) => ({
      id: item.id,
      version: item.version,
      published_at: item.publishedAt,
      published_by: item.publishedBy ?? null,
      is_active: item.isActive,
      node_count: item.nodeCount,
      diff_from: item.diffFrom ?? null,
      summary: item.summary,
    }));
  },

  /** Estado actual de la gobernanza del workspace (admin — dashboard). */
  async getControl(): Promise<ReleaseControl> {
    const response = await getWorkspaceControl();
    const data = unwrapGeneratedResponse<{
      activeVersion?: number | null;
      activeNodeCount?: number | null;
      activePublishedAt?: string | null;
      activePublishedBy?: string | null;
      latestVersion?: number | null;
      totalReleases: number;
    }>(response, [200]);
    return {
      active_version: data.activeVersion ?? null,
      active_node_count: data.activeNodeCount ?? null,
      active_published_at: data.activePublishedAt ?? null,
      active_published_by: data.activePublishedBy ?? null,
      latest_version: data.latestVersion ?? null,
      total_releases: data.totalReleases,
    };
  },

  /** Validación dry-run de una release publicada (admin). */
  async validateVersion(version: number): Promise<ReleaseValidation> {
    const response = await validateRelease(version);
    const data = unwrapGeneratedResponse<{
      version: number;
      valid: boolean;
      issues?: Array<{ nodeId?: string; message: string }>;
      brokenRefs?: Array<{ id: string; refId?: string; label?: string }>;
    }>(response, [200]);
    return {
      version: data.version,
      valid: data.valid,
      issues: (data.issues ?? []).map((issue) => ({
        node_id: issue.nodeId ?? '',
        message: issue.message,
      })),
      broken_refs: (data.brokenRefs ?? []).map((ref) => ({
        id: ref.id,
        ref_id: ref.refId ?? '',
        label: ref.label ?? '',
      })),
    };
  },

  /** Activar una release existente (admin). */
  async activateVersion(version: number, force = false): Promise<ReleaseInfo> {
    const response = await activateRelease(
      version,
      force ? { force: true } : undefined,
    );
    const data = unwrapGeneratedResponse<{
      version: number;
      tree: Record<string, unknown>;
      published_at: string;
    }>(response, [200]);
    return toReleaseInfo(data);
  },

  /** Publicar un nuevo release (admin). */
  async publish(tree: WorkspaceTree): Promise<ReleaseInfo> {
    const response = await publishRelease({ tree: tree as unknown as Record<string, unknown> });
    return toReleaseInfo(unwrapGeneratedResponse(response, [201]));
  },

  /** Guardar/actualizar el overlay remoto con revisión optimista. */
  async saveOverlay(request: UpdateWorkspaceOverlayRequest): Promise<WorkspaceOverlayResponse> {
    const response = await updateOverlay(request);
    return toOverlayResponse(unwrapGeneratedResponse(response, [200]));
  },

  /** Obtener el overlay remoto de la cuenta autenticada. */
  async getOverlay(): Promise<WorkspaceOverlayResponse> {
    const response = await getOverlay();
    return toOverlayResponse(unwrapGeneratedResponse(response, [200]));
  },
};
