/* wandori.us — Control Panel (Configuración, 297A-29)
 * Panel de control del OS: apariencia (fondo de pantalla, fuente, escala con
 * restauración), ajustes de cuenta (nombre de sesión + foto de perfil) y, para
 * el admin, fijar los valores como default global del sistema.
 * No conoce HTTP: la apariencia cambia vía appearanceStore (source 'user' →
 * appearance-sync lo sincroniza por campo con la cuenta). */

import { createEl } from '../../utils/dom';
import { safeRun, safeClick } from '../../utils/safe-async';
import { authStore, authAccountName } from '../../store';
import { MediaService, SettingsService } from '../../services';
import { showToast } from '../../components/ui/toast';
import { createSizeSlider } from '../../components/ui/slider';
import { appearanceStore, setAppearanceField, DEFAULT_APPEARANCE, type OsFont } from '../runtime/appearance-store';
import { createProfileSettingsPanel } from './profile-settings';

const FONT_OPTIONS: ReadonlyArray<{ value: OsFont; label: string }> = [
  { value: 'system', label: 'sistema (mono)' },
  { value: 'mono', label: 'mono' },
  { value: 'sans', label: 'sans' },
];

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const heading = createEl('h2', { className: 'preferences-conflict__title', textContent: title });
  return createEl('section', { className: 'control-panel__seccion' }, heading, ...children);
}

function hint(text: string): HTMLElement {
  return createEl('p', { className: 'account-app__message', textContent: text });
}

/** Selector de fuente del OS (system/mono/sans). */
function buildFontSelector(current: OsFont, disabled: boolean): HTMLElement {
  const label = createEl('span', { className: 'preferences-panel__etiqueta', textContent: 'fuente' });
  const options = createEl('div', { className: 'preferences-panel__temas', role: 'group', 'aria-label': 'Seleccionar fuente' });
  for (const option of FONT_OPTIONS) {
    const button = createEl('button', {
      className: 'boton preferences-panel__tema',
      type: 'button',
      textContent: option.label,
      'aria-pressed': String(option.value === current),
      'aria-label': `fuente ${option.label}`,
    });
    if (disabled) button.disabled = true;
    button.addEventListener('click', () => setAppearanceField('font', option.value));
    options.append(button);
  }
  return createEl('div', { className: 'preferences-panel__selector' }, label, options);
}

/** Fondo de pantalla: subir imagen (MediaService) o restaurar la trama. */
function buildWallpaperControl(current: string): HTMLElement {
  const preview = createEl('div', { className: 'control-panel__wallpaper-vista' });
  const fileInput = createEl('input', { type: 'file', accept: 'image/*' });
  fileInput.classList.add('oculto');

  const uploadButton = createEl('button', {
    className: 'boton',
    textContent: current ? 'cambiar fondo' : 'elegir imagen de fondo',
  });
  uploadButton.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', safeClick(async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const result = await safeRun(MediaService.upload(file), 'no se pudo subir la imagen');
    if (!result.ok) return;
    setAppearanceField('wallpaper', result.value.url);
    showToast('fondo de pantalla actualizado');
  }));

  const restoreButton = createEl('button', {
    className: 'boton',
    textContent: 'restaurar fondo por defecto',
  });
  restoreButton.addEventListener('click', () => setAppearanceField('wallpaper', ''));

  return createEl('div', { className: 'control-panel__wallpaper' }, preview, uploadButton, fileInput, restoreButton);
}

/** Escala del shell (0.85–1.3) con restauración. */
function buildScaleControl(current: number): HTMLElement {
  const slider = createSizeSlider('escala', 85, 130, Math.round(current * 100), (value) => {
    setAppearanceField('scale', value / 100);
  }, '%', 5);
  const restore = createEl('button', {
    className: 'boton',
    textContent: 'restaurar escala',
  });
  restore.addEventListener('click', () => setAppearanceField('scale', DEFAULT_APPEARANCE.scale));
  return createEl('div', { className: 'control-panel__escala' }, slider, restore);
}

/** Nombre de la sesión + foto de perfil (reutiliza profile-settings). */
function buildAccountSection(): HTMLElement {
  const name = createEl('p', {
    className: 'account-app__message',
    textContent: `sesión: ${authAccountName(authStore.get())}`,
  });
  const profilePanel = createProfileSettingsPanel();
  return section('cuenta', name, profilePanel);
}

/** Admin: fijar la apariencia actual como default global del sistema. */
function buildAdminDefaults(): HTMLElement | null {
  if (authStore.get().capability !== 'admin') return null;
  const button = createEl('button', {
    className: 'boton',
    textContent: 'guardar como default del sistema',
    'aria-label': 'Fijar la apariencia actual como configuración por defecto del sistema',
  });
  button.addEventListener('click', () => {
    const a = appearanceStore.get();
    void SettingsService.save({
      appearance_wallpaper: a.wallpaper,
      appearance_font: a.font,
      appearance_scale: String(a.scale),
    }).then(() => showToast('default del sistema actualizado')).catch(() => showToast('no se pudo guardar el default'));
  });
  return section('default del sistema', hint('los invitados y las cuentas nuevas heredan estos valores.'), button);
}

/** Panel de control reactivo. */
export function createControlPanel(): { element: HTMLElement; destroy: () => void } {
  const element = createEl('div', { className: 'control-panel' });
  let stopped = false;

  const render = (): void => {
    if (stopped) return;
    element.replaceChildren();
    const a = appearanceStore.get();
    const title = createEl('h1', { className: 'account-app__title', textContent: 'configuración' });
    const apariencia = section(
      'apariencia',
      hint('fondo de pantalla, fuente y escala se aplican al instante; cada campo tiene restauración.'),
      buildFontSelector(a.font, false),
      buildWallpaperControl(a.wallpaper),
      buildScaleControl(a.scale),
    );
    const adminDefaults = buildAdminDefaults();
    const account = buildAccountSection();
    element.append(title, apariencia);
    if (adminDefaults) element.append(adminDefaults);
    element.append(account);
  };

  const stopAppearance = appearanceStore.subscribeSimple(render);
  const stopAuth = authStore.subscribeSimple(() => render());
  const destroy = (): void => {
    if (stopped) return;
    stopped = true;
    stopAppearance();
    stopAuth();
  };
  render();
  return { element, destroy };
}
