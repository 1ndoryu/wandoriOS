/* wandori.us — Commands Index
 * Barrel import que registra todos los comandos del OS como side-effects.
 * Reemplaza el antiguo command-registration.ts monolítico. */

import './window-commands';
import './geometry-commands';
import './app-commands';
import './workspace-commands';
import './workspace-node-commands';
import './workspace-reorder-commands';
import './toolbar-commands';
import './finder-commands';
import './navigation-commands';
import './theme-commands';
import './profile-commands';
import './resource-commands';

export { initKeyboardShortcuts } from './keyboard-handler';
