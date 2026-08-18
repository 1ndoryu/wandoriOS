/* wandori.us — Settings Repository (perfil/redes)
 * Persistencia de la configuración de perfil y redes del OS.
 * [297A-29 F1] Se retiró la configuración de fuentes/tamaños (estáticos en
 * variables.css). Este módulo solo persiste lo que sigue siendo configurable:
 * dimensiones/borde de la foto de perfil, tamaño/separación de las redes,
 * enlaces sociales, layout de redes, imagen y entradas en inicio. */

import { safeRun } from '../../utils/safe-async';
import { profileStore, profileImage, siteConfig, socialLinksStore, redesLayoutStore } from '../../store';
import { SettingsService } from '../../services';

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function saveProfileSettings(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const p = profileStore.get();
    await safeRun(SettingsService.save({
        profile_width: String(p.profileWidth), profile_height: String(p.profileHeight),
        profile_border: String(p.profileBorder), redes_size: String(p.redesSize),
        redes_gap: String(p.redesGap),
      }), 'error al guardar configuración');
  }, 500);
}

export async function loadProfileSettings(): Promise<void> {
  let config = {
    profileWidth: 120, profileHeight: 120, profileBorder: true,
    redesSize: 13, redesGap: 8,
  };

  try {
    const settings = await SettingsService.getPublic();
    if (settings && Object.keys(settings).length > 0) {
      config = {
        profileWidth: settings.profile_width !== undefined ? Number(settings.profile_width) : config.profileWidth,
        profileHeight: settings.profile_height !== undefined ? Number(settings.profile_height) : config.profileHeight,
        profileBorder: settings.profile_border !== undefined ? settings.profile_border === 'true' : config.profileBorder,
        redesSize: settings.redes_size !== undefined ? Number(settings.redes_size) : config.redesSize,
        redesGap: settings.redes_gap !== undefined ? Number(settings.redes_gap) : config.redesGap,
      };
    }
    if (settings.profile_image) profileImage.set(settings.profile_image);
    if (settings.show_entries_on_home !== undefined) {
      siteConfig.update(s => ({ ...s, showEntriesOnHome: settings.show_entries_on_home === 'true' }));
    }
    if (settings.social_links) {
      try {
        const links = JSON.parse(settings.social_links) as Array<{ nombre: string; url: string }>;
        if (Array.isArray(links)) socialLinksStore.set(links);
      } catch { /* JSON invalido */ }
    }
    if (settings.redes_layout === 'stacked' || settings.redes_layout === 'inline') {
      redesLayoutStore.set(settings.redes_layout as 'inline' | 'stacked');
    }
  } catch { /* Backend no disponible */ }

  profileStore.set(config);
}
