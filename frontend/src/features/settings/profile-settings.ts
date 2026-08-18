/* wandori.us — Profile Settings Panel
 * [297A-29 F3] Controles de perfil extraídos del panel legacy: imagen,
 * dimensiones de la foto, borde, entradas en inicio y redes sociales.
 * Se monta DENTRO de la ventana Perfil (no es un modal global) y se abre
 * con el comando admin-only 'profile:settings' del toolbar.
 * Reutiliza recetas compartidas: config-tab-content, campo-etiqueta,
 * checkbox-personalizado, enlaces-editor y slider del sistema. */

import { safeRun, safeClick } from '../../utils/safe-async';
import { profileStore, profileImage, siteConfig } from '../../store';
import { MediaService, SettingsService } from '../../services';
import { showToast } from '../../components/ui/toast';
import { createSizeSlider } from '../../components/ui/slider';
import { renderSocialLinksSection } from './social-links';
import { saveProfileSettings } from './settings-repo';
import { createEl } from '../../utils/dom';

export function createProfileSettingsPanel(): HTMLElement {
  const panel = createEl('div', { className: 'profile-settings-panel config-tab-content' });

  function updateSize(key: 'profileWidth' | 'profileHeight' | 'redesSize' | 'redesGap', value: number): void {
    profileStore.update(s => ({ ...s, [key]: value }));
    saveProfileSettings();
  }

  const cfg = profileStore.get();

  const imgPreview = createEl('img', { className: 'config-imagen-preview', src: profileImage.get() });
  imgPreview.onerror = () => { imgPreview.classList.add('oculto'); };

  const imgInput = createEl('input', { type: 'file' });
  imgInput.accept = 'image/*';
  imgInput.classList.add('oculto');

  const btnImg = createEl('button', { className: 'boton', textContent: 'cambiar imagen' });
  btnImg.addEventListener('click', () => imgInput.click());

  imgInput.addEventListener('change', safeClick(async () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    const result = await safeRun(MediaService.upload(file), 'error al subir imagen');
    if (result.ok) {
      profileImage.set(result.value.url);
      imgPreview.src = result.value.url;
      imgPreview.classList.remove('oculto');
      SettingsService.save({ profile_image: result.value.url }).catch(() => { /* fire-and-forget save */ });
      showToast('imagen actualizada');
    }
  }));

  const entradasCheck = createEl('input', { type: 'checkbox' });
  entradasCheck.checked = siteConfig.get().showEntriesOnHome;
  entradasCheck.addEventListener('change', () => {
    siteConfig.update(s => ({ ...s, showEntriesOnHome: entradasCheck.checked }));
    SettingsService.save({ show_entries_on_home: String(entradasCheck.checked) }).catch(() => { /* fire-and-forget save */ });
  });
  const entradasLabel = createEl('label', { className: 'checkbox-personalizado' }, entradasCheck, 'mostrar entradas en inicio');

  const imgSizeSlider = createSizeSlider('Tamaño', 40, 600, cfg.profileWidth, (v) => {
    updateSize('profileWidth', v);
    updateSize('profileHeight', v);
  });
  const imgWidthSlider = createSizeSlider('Ancho', 40, 600, cfg.profileWidth, (v) => updateSize('profileWidth', v));
  const imgHeightSlider = createSizeSlider('Alto', 40, 600, cfg.profileHeight, (v) => updateSize('profileHeight', v));

  const borderCheck = createEl('input', { type: 'checkbox' });
  borderCheck.checked = cfg.profileBorder;
  borderCheck.addEventListener('change', () => {
    profileStore.update(s => ({ ...s, profileBorder: borderCheck.checked }));
    saveProfileSettings();
  });
  const borderLabel = createEl('label', { className: 'checkbox-personalizado' }, borderCheck, 'borde');

  const imgLabel = createEl('label', { className: 'campo-etiqueta', textContent: 'Imagen' });
  const separador = createEl('div', { className: 'config-tab-separador' });
  const socialElements = renderSocialLinksSection(cfg, updateSize as (k: string, v: number) => void);

  panel.append(imgLabel, imgPreview, btnImg, imgInput, imgSizeSlider, imgWidthSlider, imgHeightSlider, borderLabel, entradasLabel, separador, ...socialElements);
  return panel;
}
