/* wandori.us — App Registry
 * Catálogo central de aplicaciones del OS.
 * Cada app se registra con id, título, icono, capacidades y función de render.
 * El shell consulta el registry para instanciar apps; las apps no crean chrome. */

import { createEl } from '../../utils/dom';
import type { IconNode } from 'lucide';
import type { AppRenderFn, MountedView, RenderContext } from '../../core/lifecycle';
import { hasCapability, type Capability } from './capability';

export type { Capability } from './capability';

export type ToolbarItemRef =
  | string
  | { readonly id: string; readonly label?: string; readonly icon?: IconNode | null };

export interface AppToolbarGroup {
  readonly label: string;
  readonly items: ToolbarItemRef[];
}

export interface AppDeepLink {
  readonly patterns: readonly string[];
  readonly parse: (params: Readonly<Record<string, string>>) => Record<string, string> | null;
  readonly stringify: (params?: Readonly<Record<string, string>>) => string | null;
}

export interface AppDefinition {
  readonly id: string;
  readonly title: string;
  readonly icon: IconNode;
  readonly iconType?: 'folder' | 'document' | 'application';
  readonly singleton: boolean;
  readonly requires: Capability;
  /** Legacy route patterns; retained while apps migrate to deepLink. */
  readonly routePatterns?: string[];
  /** Canonical public route contract; absent for local/private instances. */
  readonly deepLink?: AppDeepLink;
  readonly layout?: 'padded' | 'full-bleed';
  readonly toolbar?: AppToolbarGroup[];
  /** La ventana abre maximizada (ocupa el workspace completo). */
  readonly openMaximized?: boolean;
  readonly render: AppRenderFn;
}

export interface LazyAppDefinition extends Omit<AppDefinition, 'render'> {
  readonly load: () => Promise<{ render: AppRenderFn }>;
}

class AppRegistryClass {
  private apps = new Map<string, AppDefinition>();
  private lazyApps = new Map<string, LazyAppDefinition>();
  private loadPromises = new Map<string, Promise<AppDefinition>>();

  register(app: AppDefinition): void {
    this.apps.set(app.id, app);
  }

  registerLazy(app: LazyAppDefinition): void {
    this.lazyApps.set(app.id, app);
    this.apps.set(app.id, {
      ...app,
      render: async (ctx) => {
        const resolved = await this.resolveLazy(app.id);
        return resolved.render(ctx);
      },
    });
  }

  private async resolveLazy(id: string): Promise<AppDefinition> {
    const existing = this.loadPromises.get(id);
    if (existing) return existing;

    const lazy = this.lazyApps.get(id);
    if (!lazy) throw new Error(`[AppRegistry] no lazy app: ${id}`);

    const promise = lazy.load().then((mod) => {
      const resolved: AppDefinition = { ...lazy, render: mod.render };
      this.apps.set(id, resolved);
      this.lazyApps.delete(id);
      return resolved;
    });
    this.loadPromises.set(id, promise);
    return promise;
  }

  get(id: string): AppDefinition | undefined {
    return this.apps.get(id);
  }

  /** Diagnóstico de carga: no fuerza la resolución de una app lazy. */
  isLazy(id: string): boolean {
    return this.lazyApps.has(id);
  }

  getAll(): readonly AppDefinition[] {
    return Array.from(this.apps.values());
  }

  getAvailable(currentCapability: Capability): readonly AppDefinition[] {
    return this.getAll().filter(app => hasCapability(currentCapability, app.requires));
  }

  findByRoute(pathname: string): AppDefinition | undefined {
    for (const app of this.apps.values()) {
      const patterns = app.deepLink?.patterns ?? app.routePatterns;
      if (patterns?.some(pattern => matchSimplePattern(pattern, pathname))) {
        return app;
      }
    }
    return undefined;
  }

  async instantiate(appId: string, ctx: RenderContext): Promise<MountedView | null> {
    const app = this.apps.get(appId);
    if (!app) return null;
    try {
      return await app.render(ctx);
    } catch (err) {
      /* Error de render de app — mostrar fallback visual */
      const errorEl = createEl('div');
      errorEl.style.cssText = 'padding:var(--espacio-xl);color:var(--color-texto-secundario);font-size:var(--tamano-pequeno);font-style:italic;';
      errorEl.textContent = `Error al cargar ${app.title}.`;
      return { element: errorEl };
    }
  }
}

function matchSimplePattern(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  for (let i = 0; i < patternParts.length; i++) {
    if (!patternParts[i].startsWith(':') && patternParts[i] !== pathParts[i]) return false;
  }
  return true;
}

export const AppRegistry = new AppRegistryClass();
