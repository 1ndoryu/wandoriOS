/* Tests del panel de configuración de Perfil [297A-29 F3].
 * Verifica que renderiza los controles esperados y que el toggle de borde
 * escribe el token --profile-border (regresión del fix que ignoraba la
 * preferencia del usuario en la ventana Perfil). */

import { describe, it, expect } from 'vitest';
import { createProfileSettingsPanel } from './profile-settings';
import { profileStore } from '../../store';

describe('createProfileSettingsPanel', () => {
  it('renderiza los controles de perfil (imagen, sliders, checkboxes, redes)', () => {
    const panel = createProfileSettingsPanel();
    expect(panel.classList.contains('profile-settings-panel')).toBe(true);
    expect(panel.classList.contains('config-tab-content')).toBe(true);

    /* Imagen: preview + botón cambiar imagen + input file oculto */
    expect(panel.querySelector('.config-imagen-preview')).not.toBeNull();
    const btnImg = [...panel.querySelectorAll('button.boton')]
      .find(b => b.textContent?.includes('cambiar imagen'));
    expect(btnImg).toBeDefined();
    expect(panel.querySelector('input[type="file"]')).not.toBeNull();

    /* Sliders: Tamaño, Ancho, Alto (perfil) + tamaño/separación redes */
    const sliders = panel.querySelectorAll('input.slider-input[type="range"]');
    expect(sliders.length).toBeGreaterThanOrEqual(3);

    /* Checkboxes: borde + entradas en inicio + layout redes */
    const checks = panel.querySelectorAll('input[type="checkbox"]');
    expect(checks.length).toBeGreaterThanOrEqual(2);

    /* Sección de enlaces sociales */
    expect([...panel.querySelectorAll('.campo-etiqueta')]
      .some(e => e.textContent === 'Enlaces')).toBe(true);
  });

  it('el toggle de borde escribe el token --profile-border (regresión fix)', () => {
    const panel = createProfileSettingsPanel();

    const borderLabel = [...panel.querySelectorAll('label.checkbox-personalizado')]
      .find(l => l.textContent?.includes('borde'));
    expect(borderLabel).toBeDefined();
    const borderCheck = borderLabel!.querySelector('input[type="checkbox"]') as HTMLInputElement;

    const root = document.documentElement;
    /* Estado inicial del store (por defecto borde activo) */
    root.style.setProperty('--profile-border', profileStore.get().profileBorder ? 'var(--borde)' : 'none');

    borderCheck.checked = false;
    borderCheck.dispatchEvent(new Event('change'));

    expect(profileStore.get().profileBorder).toBe(false);
    expect(root.style.getPropertyValue('--profile-border')).toBe('none');

    borderCheck.checked = true;
    borderCheck.dispatchEvent(new Event('change'));

    expect(profileStore.get().profileBorder).toBe(true);
    expect(root.style.getPropertyValue('--profile-border')).toBe('var(--borde)');
  });
});
