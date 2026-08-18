/* wandori.us — Resource Type Registry
 * [Plan §7] Asociación de tipos de archivo/programa.
 * Registry resourceKind/mime → appId + preview + acciones + icono oficial.
 * [018A-79] Fuente única del icono por resourceKind: escritorio, Finder y
 * launcher móvil consumen resolveResourceIcon en vez de mapas locales.
 * Separado del AppRegistry pero validado contra él.
 * Extensión y MIME del cliente no son autoridad; backend entrega tipo normalizado. */

import { AppRegistry } from './app-registry';
import { File, FileText, Folder, Image, Music, Package, Video, type IconNode } from 'lucide';
import type { Capability } from './capability';
import { hasCapability } from './capability';

/** Tipo de recurso conocido por el OS. */
export type ResourceKind =
  | 'article'
  | 'about'
  | 'project'
  | 'product'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'folder'
  | 'shortcut'
  | 'generic';

/** Acciones disponibles por tipo de recurso. */
export type ResourceAction =
  | 'open'
  | 'preview'
  | 'edit'
  | 'publish'
  | 'unpublish'
  | 'copy_reference'
  | 'trash'
  | 'restore'
  | 'download'
  | 'properties';

/** Tipo semántico del pictograma (clase CSS del icono). */
export type ResourceIconType = 'folder' | 'document' | 'application';

/** Entrada de asociación tipo → app. */
export interface ResourceTypeEntry {
  /** Tipo de recurso. */
  readonly kind: ResourceKind;
  /** ID de la app que maneja este tipo. */
  readonly appId: string;
  /** Si esta app puede previsualizar (vs abrir completo). */
  readonly canPreview: boolean;
  /** Acciones disponibles para este tipo. */
  readonly actions: readonly ResourceAction[];
  /** MIME types que este tipo acepta (para resolver desde MIME). */
  readonly mimePatterns?: readonly string[];
  /** Si requiere capacidad específica. */
  readonly requires?: Capability;
  /** Icono Lucide oficial del tipo (trazo del sistema). Fuente única para escritorio/Finder/móvil. */
  readonly icon: IconNode;
  /** Tipo semántico del pictograma (clase CSS); por defecto 'document'. */
  readonly iconType?: ResourceIconType;
}

/* === Catálogo de asociaciones === */

const registry = new Map<ResourceKind, ResourceTypeEntry>();

/** Registrar asociación de tipo de recurso. */
export function registerResourceType(entry: ResourceTypeEntry): void {
  /* Validar que la app existe en AppRegistry */
  const app = AppRegistry.get(entry.appId);
  if (!app) {
    /* app no registrada aún — skip silently (init order) */
    return;
  }
  registry.set(entry.kind, entry);
}

/** Resolver tipo de recurso → entrada de asociación. */
export function resolveResourceType(kind: ResourceKind): ResourceTypeEntry | undefined {
  return registry.get(kind);
}

/** [018A-79] Icono oficial del tipo de recurso. Fuente única para escritorio, Finder y móvil. */
export function resolveResourceIcon(kind: ResourceKind): IconNode {
  return registry.get(kind)?.icon ?? File;
}

/** [018A-79] Tipo semántico del pictograma (clase CSS del icono). */
export function resolveResourceIconType(kind: ResourceKind): ResourceIconType {
  return registry.get(kind)?.iconType ?? 'document';
}

/** Resolver MIME type → entrada de asociación. */
export function resolveByMime(mime: string): ResourceTypeEntry | undefined {
  for (const entry of registry.values()) {
    if (entry.mimePatterns?.some(pattern => {
      if (pattern.endsWith('/*')) {
        return mime.startsWith(pattern.slice(0, -1));
      }
      return mime === pattern;
    })) {
      return entry;
    }
  }
  return undefined;
}

/** Obtener acciones disponibles para un tipo de recurso. */
export function getResourceActions(kind: ResourceKind, capability?: Capability): readonly ResourceAction[] {
  const entry = registry.get(kind);
  if (!entry) return ['properties']; /* Fallback seguro */
  if (!hasCapability(capability ?? 'public', entry.requires)) {
    return ['open', 'properties']; /* Público solo abre y ve propiedades */
  }
  return entry.actions;
}

/** Verificar si un tipo tiene app registrada. */
export function hasRegisteredApp(kind: ResourceKind): boolean {
  return registry.has(kind);
}

/** Obtener appId para un tipo (con fallback seguro). */
export function getAppForResource(kind: ResourceKind): string | undefined {
  return registry.get(kind)?.appId;
}

/* === Inicialización del catálogo === */

/** Registrar catálogo inicial de tipos. Llamar después de AppRegistry. */
export function initResourceTypeRegistry(): void {
  /* Artículo → Reader */
  registerResourceType({
    kind: 'article',
    appId: 'reader',
    canPreview: true,
    actions: ['open', 'preview', 'edit', 'publish', 'unpublish', 'copy_reference', 'trash', 'restore', 'properties'],
    requires: 'public',
    icon: FileText,
    iconType: 'document',
  });

  /* About → Reader */
  registerResourceType({
    kind: 'about',
    appId: 'reader',
    canPreview: true,
    actions: ['open', 'preview', 'edit', 'copy_reference', 'properties'],
    requires: 'public',
    icon: FileText,
    iconType: 'document',
  });

  /* Proyecto → Projects */
  registerResourceType({
    kind: 'project',
    appId: 'projects',
    canPreview: true,
    actions: ['open', 'preview', 'edit', 'publish', 'unpublish', 'copy_reference', 'trash', 'restore', 'properties'],
    requires: 'public',
    icon: Package,
    iconType: 'document',
  });

  /* Producto → Finder (vista tienda) o Editor según capacidad */
  registerResourceType({
    kind: 'product',
    appId: 'finder',
    canPreview: true,
    actions: ['open', 'preview', 'edit', 'publish', 'unpublish', 'copy_reference', 'trash', 'restore', 'download', 'properties'],
    requires: 'public',
    icon: Package,
    iconType: 'document',
  });

  /* Imagen → Finder */
  registerResourceType({
    kind: 'image',
    appId: 'finder',
    canPreview: true,
    actions: ['open', 'preview', 'download', 'copy_reference', 'trash', 'restore', 'properties'],
    mimePatterns: ['image/*'],
    requires: 'public',
    icon: Image,
    iconType: 'document',
  });

  /* Audio → Finder */
  registerResourceType({
    kind: 'audio',
    appId: 'finder',
    canPreview: true,
    actions: ['open', 'preview', 'download', 'copy_reference', 'trash', 'restore', 'properties'],
    mimePatterns: ['audio/*'],
    requires: 'public',
    icon: Music,
    iconType: 'document',
  });

  /* Video → Finder */
  registerResourceType({
    kind: 'video',
    appId: 'finder',
    canPreview: true,
    actions: ['open', 'preview', 'download', 'copy_reference', 'trash', 'restore', 'properties'],
    mimePatterns: ['video/*'],
    requires: 'public',
    icon: Video,
    iconType: 'document',
  });

  /* Documento genérico → Finder */
  registerResourceType({
    kind: 'document',
    appId: 'finder',
    canPreview: false,
    actions: ['open', 'download', 'copy_reference', 'properties'],
    mimePatterns: ['application/pdf', 'text/*'],
    requires: 'public',
    icon: FileText,
    iconType: 'document',
  });

  /* Carpeta → Finder */
  registerResourceType({
    kind: 'folder',
    appId: 'finder',
    canPreview: true,
    actions: ['open', 'copy_reference', 'trash', 'restore', 'properties'],
    requires: 'public',
    icon: Folder,
    iconType: 'folder',
  });

  /* Genérico → propiedades/download si hay grant */
  registerResourceType({
    kind: 'generic',
    appId: 'finder',
    canPreview: false,
    actions: ['properties', 'download'],
    requires: 'public',
    icon: File,
    iconType: 'document',
  });
}
