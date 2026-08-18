/* wandori.us — Workspace Types
 * Data model para el árbol del workspace: release inmutable, draft admin, overlay invitado.
 * Flat-map con parentId para merges eficientes sin deep nesting.
 * [Plan 297A-11 §9.1] Contratos versionados. */

import type { Capability } from '../capability';

export type NodeId = string;

/** Tipo de recurso del workspace/backend.
 * Unificado con ResourceKind de resource-type-registry.ts para eliminar duplicación.
 * Los tipos 'folder' y 'shortcut' existen aquí por completitud pero en el workspace
 * se usan como WorkspaceNodeType, no como resourceKind. */
export type WorkspaceResourceKind = 'article' | 'about' | 'project' | 'product' | 'image' | 'audio' | 'video' | 'document' | 'folder' | 'shortcut' | 'generic';

/** Tipo de nodo en el workspace (alinea con manual §6.2). */
export type WorkspaceNodeType = 'folder' | 'shortcut' | 'app' | 'resource';

/** Referencia pública allowlisted para abrir un recurso sin exponer refId. */
export interface PublicResourceLocator {
  readonly appId: string;
  readonly params: Readonly<Record<string, string>>;
}

/** Posición snap-grid en el escritorio. */
export interface GridPosition {
  col: number;
  row: number;
}

/** Un nodo del workspace: carpeta, acceso directo a recurso, o app. */
export interface WorkspaceNode {
  /** ID estable (UUID o slug determinístico). */
  readonly id: NodeId;
  /** Padre: 'desktop' = raíz, otro NodeId = subcarpeta, null = papelera/huérfano. */
  parentId: NodeId | 'desktop' | null;
  /** Tipo de nodo. */
  readonly type: WorkspaceNodeType;
  /** Etiqueta visible. */
  label: string;
  /** ID de referencia: appId para 'app', resource UUID para 'shortcut'/'resource'. */
  readonly refId?: string;
  /** Tipo de recurso editorial/comercial (solo para type: 'resource'). */
  readonly resourceKind?: WorkspaceResourceKind;
  /** Locator público; nunca contiene el UUID interno del recurso. */
  readonly publicLocator?: PublicResourceLocator;
  /** Posición persistente en el grid desktop/tablet. */
  position?: GridPosition;
  /** Posición persistente en el grid compacto del launcher móvil. */
  mobilePosition?: GridPosition;
  /** Orden móvil legacy; solo fallback para nodos sin mobilePosition. */
  mobileOrder?: number;
  /** Capacidad requerida para ver este nodo. */
  readonly requires?: Capability;
}

/** Árbol completo del workspace (release o draft). */
export interface WorkspaceTree {
  /** Versión del schema para migración. */
  readonly version: number;
  /** Nodos indexados por ID. */
  readonly nodes: Readonly<Record<NodeId, WorkspaceNode>>;
}

/** Capas de personalización del invitado/usuario. */
export interface WorkspaceOverlay {
  /** Versión del schema. */
  readonly version: number;
  /** Nodos nuevos añadidos por el usuario (carpetas, atajos). */
  readonly addedItems: Record<NodeId, WorkspaceNode>;
  /** Overrides de campos sobre nodos del release (posiciones, label, parentId). */
  readonly fieldOverrides: Record<NodeId, Partial<Pick<WorkspaceNode, 'position' | 'mobilePosition' | 'label' | 'parentId' | 'mobileOrder'>>>;
  /** IDs eliminados por el usuario (tombstones). */
  readonly tombstones: NodeId[];
}

/** Nodo resuelto tras merge (lo que se renderiza). */
export interface ResolvedNode extends WorkspaceNode {
  /** Origen del nodo: 'release' del admin o 'overlay' del usuario. */
  readonly origin: 'release' | 'overlay';
}

/** Resultado del merge: árbol plano listo para renderizar. */
export interface ResolvedWorkspace {
  /** Versión del release base. */
  readonly releaseVersion: number;
  /** Nodos resueltos indexados por ID. */
  readonly nodes: Readonly<Record<NodeId, ResolvedNode>>;
}
