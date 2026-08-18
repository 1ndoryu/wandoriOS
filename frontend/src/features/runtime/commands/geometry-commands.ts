/* wandori.us — Geometry Commands
 * Comandos de teclado para mover y redimensionar ventanas. [Plan §4.1] */

import { CommandRegistry, type CommandResult } from '../command-registry';
import { getFocusedWindow, updateWindowBounds } from '../window-manager';

const KB_STEP = 20;
const KB_STEP_LARGE = 60;

/* === Mover ventana === */

CommandRegistry.register({
  id: 'window:move-up',
  label: 'Mover ventana arriba',
  shortcut: 'Ctrl+ArrowUp',
  order: 20,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.moved',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    updateWindowBounds(win.instanceId, { y: win.bounds.y - KB_STEP });
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'window:move-down',
  label: 'Mover ventana abajo',
  shortcut: 'Ctrl+ArrowDown',
  order: 21,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.moved',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    updateWindowBounds(win.instanceId, { y: win.bounds.y + KB_STEP });
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'window:move-left',
  label: 'Mover ventana izquierda',
  shortcut: 'Ctrl+ArrowLeft',
  order: 22,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.moved',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    updateWindowBounds(win.instanceId, { x: win.bounds.x - KB_STEP });
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'window:move-right',
  label: 'Mover ventana derecha',
  shortcut: 'Ctrl+ArrowRight',
  order: 23,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.moved',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    updateWindowBounds(win.instanceId, { x: win.bounds.x + KB_STEP });
    return { status: 'success' };
  },
});

/* === Resize direccional === */

CommandRegistry.register({
  id: 'window:resize-right',
  label: 'Expandir derecha',
  shortcut: 'Ctrl+Shift+ArrowRight',
  order: 24,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.resized',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    updateWindowBounds(win.instanceId, { w: win.bounds.w + KB_STEP_LARGE });
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'window:resize-left',
  label: 'Expandir izquierda',
  shortcut: 'Ctrl+Shift+ArrowLeft',
  order: 25,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.resized',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    const newW = Math.max(240, win.bounds.w + KB_STEP_LARGE);
    const dx = newW - win.bounds.w;
    updateWindowBounds(win.instanceId, { x: win.bounds.x - dx, w: newW });
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'window:resize-down',
  label: 'Expandir abajo',
  shortcut: 'Ctrl+Shift+ArrowDown',
  order: 26,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.resized',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    updateWindowBounds(win.instanceId, { h: win.bounds.h + KB_STEP_LARGE });
    return { status: 'success' };
  },
});

CommandRegistry.register({
  id: 'window:resize-up',
  label: 'Expandir arriba',
  shortcut: 'Ctrl+Shift+ArrowUp',
  order: 27,
  contexts: ['window'],
  undoPolicy: 'local',
  analyticsEvent: 'window.resized',
  isAvailable: () => {
    return getFocusedWindow() ? { state: 'enabled' } : { state: 'disabled', reason: 'no focused window' };
  },
  execute: (): CommandResult => {
    const win = getFocusedWindow();
    if (!win) return { status: 'failure', reason: 'no focused window' };
    const newH = Math.max(180, win.bounds.h + KB_STEP_LARGE);
    const dy = newH - win.bounds.h;
    updateWindowBounds(win.instanceId, { y: win.bounds.y - dy, h: newH });
    return { status: 'success' };
  },
});
