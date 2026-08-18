/* wandori.us — Trash (Papelera) App
 * Muestra nodos tombstoneados del workspace con opción de restaurar.
 * [Plan 297A-11 §9.3] Papelera personal separada de recursos. */

import { createElement, RotateCcw } from 'lucide';
import { createEl } from '../../../../utils/dom';
import { getTombstonedNodes, restoreNode, workspaceStore } from '../../../runtime/workspace/workspace-store';
import { reconcileChildren } from '../../../../utils/reconcile';

export function createTrashPreview(): HTMLElement {
  const container = createEl('div', { className: 'trash-app' });
  const list = createEl('ul', { className: 'trash-app__list' });
  const emptyMsg = createEl('div', { className: 'trash-app__empty', textContent: 'La papelera está vacía.' });
  emptyMsg.style.display = 'none';

  container.append(emptyMsg, list);

  function render(): void {
    const tombstoned = getTombstonedNodes();

    if (tombstoned.length === 0) {
      emptyMsg.style.display = '';
      list.style.display = 'none';
      return;
    }

    emptyMsg.style.display = 'none';
    list.style.display = '';

    reconcileChildren(
      list,
      tombstoned,
      (node) => node.id,
      (node) => {
        const restoreBtn = createEl('button', { type: 'button', className: 'trash-app__restore-btn', ariaLabel: `Restaurar ${node.label}` },
          createElement(RotateCcw),
        );
        restoreBtn.addEventListener('click', () => { restoreNode(node.id); });

        return createEl('li', { className: 'trash-app__item' },
          createEl('span', { className: 'trash-app__item-label', textContent: node.label }),
          createEl('span', { className: 'trash-app__item-type', textContent: node.type }),
          restoreBtn,
        );
      },
      (el, node) => {
        const label = el.querySelector('.trash-app__item-label');
        if (label && label.textContent !== node.label) label.textContent = node.label;
        const type = el.querySelector('.trash-app__item-type');
        if (type && type.textContent !== node.type) type.textContent = node.type;
      },
    );
  }

  workspaceStore.subscribe(() => { render(); });

  return container;
}
