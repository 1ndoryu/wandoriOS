import { describe, expect, it } from 'vitest';
import { AppRegistry } from '../app-registry';
import '../app-registration';
import { ADMIN_NODES, DEFAULT_RELEASE } from './default-release';
import {
  findWorkspaceAppContractIssues,
  getWorkspaceAppRefs,
} from './workspace-app-contract';
import type { WorkspaceNode } from './types';

describe('workspace/AppRegistry anti-drift contract', () => {
  it('registra todas las apps referenciadas por el release público y admin', () => {
    const refs = getWorkspaceAppRefs([
      DEFAULT_RELEASE.nodes,
      ADMIN_NODES,
    ]);
    const issues = findWorkspaceAppContractIssues(
      refs,
      (appId) => AppRegistry.get(appId) !== undefined,
    );

    expect(refs).toEqual([
      { nodeId: 'about', appId: 'about' },
      { nodeId: 'admin', appId: 'admin' },
      { nodeId: 'analytics', appId: 'analytics' },
      { nodeId: 'downloads', appId: 'downloads' },
      { nodeId: 'gamePlayable', appId: 'game-playable' },
      { nodeId: 'mediaLibrary', appId: 'media-library' },
      { nodeId: 'orders', appId: 'orders' },
      { nodeId: 'projects', appId: 'projects' },
      { nodeId: 'settings', appId: 'settings' },
      { nodeId: 'store', appId: 'store' },
      { nodeId: 'trash', appId: 'trash' },
    ]);
    expect(issues).toEqual([]);
  });

  it('detecta el caso de regresión de un nodo app sin registro', () => {
    const orphan: WorkspaceNode = {
      id: 'orphan-app-node',
      parentId: 'desktop',
      type: 'app',
      label: 'App eliminada',
      refId: 'deleted-app',
      requires: 'public',
    };
    const refs = getWorkspaceAppRefs([{ orphan }]);

    expect(findWorkspaceAppContractIssues(refs, (appId) => AppRegistry.get(appId) !== undefined))
      .toEqual(['orphan-app-node:unregistered-app:deleted-app']);
  });

  it('detecta un nodo app sin refId', () => {
    const broken: WorkspaceNode = {
      id: 'broken-app-node',
      parentId: 'desktop',
      type: 'app',
      label: 'App incompleta',
      requires: 'public',
    };
    const refs = getWorkspaceAppRefs([{ broken }]);

    expect(findWorkspaceAppContractIssues(refs, () => true))
      .toEqual(['broken-app-node:missing-refId']);
  });

  it('no exige que toda app registrada tenga un icono en el workspace', () => {
    const refs = getWorkspaceAppRefs([
      DEFAULT_RELEASE.nodes,
      ADMIN_NODES,
    ]);
    const registeredIds = AppRegistry.getAll().map((app) => app.id);

    expect(registeredIds).toContain('account');
    expect(refs.map((ref) => ref.appId)).not.toContain('account');
    expect(findWorkspaceAppContractIssues(refs, (appId) => AppRegistry.get(appId) !== undefined))
      .toEqual([]);
  });

  it('conserva cada nodo app para diagnóstico y omite shortcuts y carpetas', () => {
    const folder: WorkspaceNode = {
      id: 'folder', parentId: 'desktop', type: 'folder', label: 'Carpeta', refId: 'finder',
    };
    const shortcut: WorkspaceNode = {
      id: 'shortcut', parentId: 'desktop', type: 'shortcut', label: 'Perfil', refId: 'shell-profile',
    };
    const app: WorkspaceNode = {
      id: 'app', parentId: 'desktop', type: 'app', label: 'About', refId: 'about',
    };
    const duplicate: WorkspaceNode = { ...app, id: 'app-2' };

    expect(getWorkspaceAppRefs([{ folder, shortcut, app, duplicate }]))
      .toEqual([
        { nodeId: 'app', appId: 'about' },
        { nodeId: 'app-2', appId: 'about' },
      ]);
  });
});
