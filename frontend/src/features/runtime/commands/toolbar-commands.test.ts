/* [2026-08-18] El frente de juego quedó archivado (_archivo/juego): los
 * comandos game:character y game:settings se retiraron del registry. */

import { describe, it, expect } from 'vitest';
import { CommandRegistry } from '../command-registry';

import './toolbar-commands';

describe('toolbar commands (juego archivado)', () => {
  it('ya no registra comandos del juego', () => {
    expect(CommandRegistry.get('game:character')).toBeUndefined();
    expect(CommandRegistry.get('game:settings')).toBeUndefined();
  });
});
