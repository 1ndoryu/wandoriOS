/* wandori.us — Tests del puente media → Documentos [018A-87]. */
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyMediaToWorkspace,
  buildMediaNode,
  DOCUMENTOS_FOLDER_ID,
  MEDIA_FOLDERS,
} from './media-gallery-sync';
import type { MediaChangedEvent } from '../media-events';
import { workspaceStore, overlayStore, EMPTY_OVERLAY } from './workspace-store';
import type { ResolvedWorkspace, WorkspaceNode } from './types';

const originalWorkspace = workspaceStore.get();
const originalOverlay = overlayStore.get();

afterEach(() => {
  workspaceStore.set(originalWorkspace);
  overlayStore.set(originalOverlay);
});

const uploadedImage: MediaChangedEvent = {
  mediaId: '11111111-1111-1111-1111-111111111111',
  operation: 'uploaded',
  fileType: 'image',
  label: 'Mi foto',
};

describe('buildMediaNode', () => {
  it('construye el nodo resource en la subcarpeta según tipo', () => {
    const node = buildMediaNode(uploadedImage);

    expect(node.id).toBe(`media-${uploadedImage.mediaId}`);
    expect(node.parentId).toBe(MEDIA_FOLDERS.image);
    expect(node.type).toBe('resource');
    expect(node.label).toBe('Mi foto');
    expect(node.refId).toBe(uploadedImage.mediaId);
    expect(node.resourceKind).toBe('image');
    expect(node.requires).toBe('public');
  });

  it('mapea cada tipo a su subcarpeta', () => {
    const casos: Array<[MediaChangedEvent['fileType'], string, WorkspaceNode['resourceKind']]> = [
      ['image', MEDIA_FOLDERS.image, 'image'],
      ['audio', MEDIA_FOLDERS.audio, 'audio'],
      ['video', MEDIA_FOLDERS.video, 'video'],
      ['document', MEDIA_FOLDERS.document, 'document'],
    ];
    for (const [fileType, folderId, kind] of casos) {
      const node = buildMediaNode({ mediaId: 'm', fileType, label: 'x' });
      expect(node.parentId).toBe(folderId);
      expect(node.resourceKind).toBe(kind);
    }
  });
});

describe('applyMediaToWorkspace', () => {
  it('crea Documentos, la subcarpeta del tipo y añade el nodo al subir', () => {
    /* El release v2 ya trae las carpetas; este test fuerza un estado sin ellas
     * para cubrir la creación por overlay (release v1 o carpetas borradas). */
    workspaceStore.set({ releaseVersion: 1, nodes: {} });
    overlayStore.set(EMPTY_OVERLAY);

    applyMediaToWorkspace(uploadedImage);

    const overlay = overlayStore.get();
    expect(overlay.addedItems[DOCUMENTOS_FOLDER_ID]).toMatchObject({
      type: 'folder',
      parentId: 'desktop',
      label: 'Documentos',
      requires: 'public',
    });
    expect(overlay.addedItems[MEDIA_FOLDERS.image]).toMatchObject({
      type: 'folder',
      parentId: DOCUMENTOS_FOLDER_ID,
      label: 'Imágenes',
      requires: 'public',
    });
    expect(overlay.addedItems[`media-${uploadedImage.mediaId}`]).toMatchObject({
      type: 'resource',
      parentId: MEDIA_FOLDERS.image,
      resourceKind: 'image',
      label: 'Mi foto',
    });
  });

  it('reutiliza las carpetas existentes sin duplicarlas', () => {
    const withFolders: ResolvedWorkspace = {
      releaseVersion: 1,
      nodes: {
        [DOCUMENTOS_FOLDER_ID]: {
          id: DOCUMENTOS_FOLDER_ID,
          parentId: 'desktop',
          type: 'folder',
          label: 'Documentos',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
        [MEDIA_FOLDERS.image]: {
          id: MEDIA_FOLDERS.image,
          parentId: DOCUMENTOS_FOLDER_ID,
          type: 'folder',
          label: 'Imágenes',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
      },
    };
    workspaceStore.set(withFolders);

    applyMediaToWorkspace(uploadedImage);

    const overlay = overlayStore.get();
    expect(overlay.addedItems[DOCUMENTOS_FOLDER_ID]).toBeUndefined();
    expect(overlay.addedItems[MEDIA_FOLDERS.image]).toBeUndefined();
    expect(overlay.addedItems[`media-${uploadedImage.mediaId}`]).toBeDefined();
  });

  it('restaura carpetas con tombstone previo y limpia el tombstone', () => {
    const withTombstoned: ResolvedWorkspace = {
      releaseVersion: 1,
      nodes: {},
    };
    workspaceStore.set(withTombstoned);
    overlayStore.set({
      version: 0,
      addedItems: {},
      fieldOverrides: {},
      tombstones: [DOCUMENTOS_FOLDER_ID, MEDIA_FOLDERS.image],
    });

    applyMediaToWorkspace(uploadedImage);

    const overlay = overlayStore.get();
    expect(overlay.tombstones).not.toContain(DOCUMENTOS_FOLDER_ID);
    expect(overlay.tombstones).not.toContain(MEDIA_FOLDERS.image);
    expect(overlay.addedItems[DOCUMENTOS_FOLDER_ID]).toBeDefined();
    expect(overlay.addedItems[MEDIA_FOLDERS.image]).toBeDefined();
  });

  it('retira el icono del media al moverlo a la papelera', () => {
    const nodeId = `media-${uploadedImage.mediaId}`;
    workspaceStore.set({
      releaseVersion: 1,
      nodes: {
        [nodeId]: {
          id: nodeId,
          parentId: MEDIA_FOLDERS.image,
          type: 'resource',
          label: 'Mi foto',
          refId: uploadedImage.mediaId,
          resourceKind: 'image',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
      },
    });

    applyMediaToWorkspace({ ...uploadedImage, operation: 'deleted' });

    expect(overlayStore.get().tombstones).toContain(nodeId);
  });

  it('restaura el nodo al restaurar el media', () => {
    applyMediaToWorkspace({ ...uploadedImage, operation: 'restored' });

    const overlay = overlayStore.get();
    expect(overlay.tombstones).not.toContain(`media-${uploadedImage.mediaId}`);
    expect(overlay.addedItems[`media-${uploadedImage.mediaId}`]).toMatchObject({
      type: 'resource',
      parentId: MEDIA_FOLDERS.image,
      resourceKind: 'image',
    });
  });

  it('sincroniza la etiqueta con un fieldOverride cuando el nodo ya existe', () => {
    const nodeId = `media-${uploadedImage.mediaId}`;
    workspaceStore.set({
      releaseVersion: 1,
      nodes: {
        [nodeId]: {
          id: nodeId,
          parentId: MEDIA_FOLDERS.image,
          type: 'resource',
          label: 'Nombre anterior',
          refId: uploadedImage.mediaId,
          resourceKind: 'image',
          requires: 'public',
          origin: 'release',
        } as WorkspaceNode & { origin: 'release' },
      },
    });

    applyMediaToWorkspace({ ...uploadedImage, label: 'Nuevo nombre' });

    expect(overlayStore.get().fieldOverrides[nodeId]?.label).toBe('Nuevo nombre');
    expect(overlayStore.get().addedItems[nodeId]).toBeUndefined();
  });
});
