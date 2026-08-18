/* wandori.us — Workspace Overlay Conflict UI
 * Presentación única del conflicto de sincronización del workspace.
 * No conoce HTTP ni muta stores: delega en resolveOverlayConflict().
 * [297A-13] */

import { createModal, type ModalOptions } from '../../../components/ui/modal';
import { createEl } from '../../../utils/dom';
import { authStore } from '../../../store';
import { overlayStore } from './stores';
import {
  overlaySyncStore,
  resolveOverlayConflict,
  type OverlaySyncState,
} from './overlay-sync';

let activeModal: { close: () => void } | null = null;
let activeUserId: string | null = null;
let activeRevision: number | null = null;
let stopSubscription: (() => void) | null = null;
let sharedCleanup: (() => void) | null = null;

function overlaySummary(overlay: OverlaySyncState['remoteOverlay']): string {
  if (!overlay) return 'sin datos remotos';
  const added = Object.keys(overlay.addedItems).length;
  const modified = Object.keys(overlay.fieldOverrides).length;
  const removed = overlay.tombstones.length;
  return `${added} añadidos · ${modified} modificados · ${removed} eliminados`;
}

function closeActiveModal(): void {
  activeModal?.close();
  activeModal = null;
  activeUserId = null;
  activeRevision = null;
}

function openConflictModal(state: OverlaySyncState): void {
  if (!state.remoteOverlay || state.revision === null || !state.userId) return;
  if (activeModal && activeUserId === state.userId && activeRevision === state.revision) return;

  closeActiveModal();
  const localOverlay = overlayStore.get();
  const title = createEl('h2', {
    className: 'workspace-overlay-conflict__title',
    textContent: 'workspace actualizado',
  });
  title.id = 'workspace-overlay-conflict-title';
  const message = createEl('p', {
    className: 'workspace-overlay-conflict__message',
    textContent: 'La cuenta cambió la organización del escritorio. Elige qué estado conservar.',
  });
  const values = createEl('dl', { className: 'workspace-overlay-conflict__values' });
  values.append(
    createEl('dt', { textContent: 'en este dispositivo' }),
    createEl('dd', { textContent: overlaySummary(localOverlay) }),
    createEl('dt', { textContent: 'en tu cuenta' }),
    createEl('dd', { textContent: overlaySummary(state.remoteOverlay) }),
  );
  /* [018A-64] Etiquetas simplificadas: "lo de este dispositivo" / "lo de mi
   * cuenta" dicen qué estado se conserva sin jerga de dominio. */
  const keepLocal = createEl('button', {
    className: 'boton workspace-overlay-conflict__action',
    type: 'button',
    textContent: 'conservar lo de este dispositivo',
    'aria-label': 'Conservar la organización de este dispositivo',
  });
  const useRemote = createEl('button', {
    className: 'boton workspace-overlay-conflict__action',
    type: 'button',
    textContent: 'usar lo de mi cuenta',
    'aria-label': 'Usar la organización de mi cuenta',
  });
  const actions = createEl(
    'div',
    { className: 'workspace-overlay-conflict__actions' },
    keepLocal,
    useRemote,
  );
  const content = createEl(
    'section',
    { className: 'workspace-overlay-conflict' },
    title,
    message,
    values,
    actions,
  );

  const options: ModalOptions = {
    contenido: content,
    ancho: '480px',
    closeOnBackdrop: false,
    closeOnEscape: false,
    ariaLabelledby: title.id,
  };
  activeUserId = state.userId;
  activeRevision = state.revision;
  activeModal = createModal(options);

  keepLocal.addEventListener('click', () => resolveOverlayConflict('local'));
  useRemote.addEventListener('click', () => resolveOverlayConflict('remote'));
  keepLocal.focus();
}

function render(state: OverlaySyncState): void {
  /* [018A-66] La sesión admin publica el release global y nunca resuelve un
   * conflicto de overlay personal. Esta guardia evita un flash si el estado
   * de auth y el store de sync notifican en distinto orden. */
  if (authStore.get().capability === 'admin') {
    closeActiveModal();
    return;
  }
  if (state.status === 'conflict') openConflictModal(state);
  else closeActiveModal();
}

/** Monta una única UI para conflictos del overlay remoto. */
export function initOverlayConflictUI(): () => void {
  if (sharedCleanup) return sharedCleanup;
  stopSubscription = overlaySyncStore.subscribe(render);

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    stopSubscription?.();
    stopSubscription = null;
    sharedCleanup = null;
    closeActiveModal();
  };
  sharedCleanup = cleanup;
  return cleanup;
}
