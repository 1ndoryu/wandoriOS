/* GAME-01 — Editor de personaje del jugador.
 * Overlay del OS que permite a una cuenta autenticada elegir su personaje del
 * catálogo activo y su nombre visible, y persistirlos con revisión optimista.
 * Los invitados no tienen perfil persistido (política 297A-51): ven el editor
 * con un aviso y no pueden guardar. El id del personaje es inmutable; el tono
 * se muestra como ayuda y alimentará el render cuando existan modelos por tono. */

import { ApiError } from '../../../../api/client';
import type { GameCharacterDefinition, GameProfile } from '../../../../api/types';
import { GameProfileService, isValidDisplayName } from '../../../../services/game-profile.service';
import { createEl } from '../../../../utils/dom';
import { createModal } from '../../../../components/ui/modal';
import { createInput } from '../../../../components/ui/input';
import { createSelect } from '../../../../components/ui/select';
import { showToast } from '../../../../components/ui/toast';

export interface GameCharacterEditorOptions {
  /** Catálogo activo (allowlisted) desde el que elige el jugador. */
  characters: GameCharacterDefinition[];
  /** Estado leído al abrir; revision se usa como expectedRevision. */
  initial: { displayName: string; characterId: string; revision: number };
  isAuthenticated: boolean;
  /** Se invoca solo tras guardar con éxito; recibe el perfil persistido. */
  onSaved: (profile: GameProfile) => void;
}

export function openGameCharacterEditor(options: GameCharacterEditorOptions): void {
  let displayName = options.initial.displayName;
  let characterId = options.initial.characterId;

  const characterField = createSelect({
    label: 'personaje',
    options: options.characters.map(character => ({
      value: character.id,
      label: `${character.displayName} (${character.bodyTone})`,
    })),
    value: characterId,
    onChange: (value) => { characterId = value; },
  });
  const nameField = createInput({
    label: 'nombre visible',
    value: options.initial.displayName,
    placeholder: 'tu nombre en el Bosque',
    required: true,
    onInput: (value) => { displayName = value; },
  });
  const feedback = createEl('p', { className: 'modal-feedback', role: 'status' });

  const btnCancelar = createEl('button', { type: 'button', className: 'boton', textContent: 'cancelar' });
  const btnGuardar = createEl('button', { type: 'button', className: 'boton', textContent: 'guardar' });
  const acciones = createEl('div', { className: 'modal-acciones' }, btnCancelar, btnGuardar);

  const contenido = [characterField, nameField, feedback, acciones];
  if (!options.isAuthenticated) {
    /* [297A-51] Invitado: sin perfil persistido ni estado reclamable. El botón
     * guardar queda deshabilitado y el aviso explica por qué. */
    btnGuardar.disabled = true;
    contenido.splice(2, 0, createEl('p', {
      className: 'modal-feedback',
      textContent: 'inicia sesión para guardar tu personaje; como invitado juegas con la opción por defecto.',
    }));
  }

  const modal = createModal({
    titulo: 'personaje',
    contenido,
    ancho: '420px',
  });

  btnCancelar.addEventListener('click', () => modal.close());
  btnGuardar.addEventListener('click', () => {
    const cleanName = displayName.trim();
    if (!isValidDisplayName(cleanName)) {
      feedback.textContent = 'nombre no válido: entre 1 y 24 caracteres, sin controles.';
      return;
    }
    btnGuardar.disabled = true;
    feedback.textContent = 'guardando...';
    GameProfileService.update({
      displayName: cleanName,
      characterId,
      expectedRevision: options.initial.revision,
    })
      .then((profile) => {
        btnGuardar.disabled = false;
        showToast('personaje actualizado');
        modal.close();
        options.onSaved(profile);
      })
      .catch((error: unknown) => {
        btnGuardar.disabled = false;
        if (error instanceof ApiError && error.status === 401) {
          feedback.textContent = 'inicia sesión para guardar tu personaje.';
        } else if (error instanceof ApiError && error.status === 409) {
          feedback.textContent = 'tu perfil cambió en otra ventana; cierra y vuelve a abrir el editor.';
        } else {
          feedback.textContent = 'no se pudo guardar el personaje.';
        }
      });
  });
}
