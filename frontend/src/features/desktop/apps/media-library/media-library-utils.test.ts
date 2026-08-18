/* wandori.us — Media Library Utils Tests
 * [297A-14 F4] Helpers puros: validación UX espejo, formato y clasificación. */

import { describe, expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  assetStateLabel,
  classifyClientType,
  fileNameFromPath,
  formatFileSize,
  getFileExtension,
  isAllowedUpload,
} from './media-library-utils';

describe('media-library-utils', () => {
  it('extrae la extensión en minúsculas', () => {
    expect(getFileExtension('foto.PNG')).toBe('png');
    expect(getFileExtension('sin-extension')).toBe('');
    expect(getFileExtension('.gitignore')).toBe('gitignore');
  });

  it('clasifica tipos de imagen/audio/video', () => {
    expect(classifyClientType('webp')).toBe('image');
    expect(classifyClientType('mp3')).toBe('audio');
    expect(classifyClientType('MOV')).toBe('video');
    expect(classifyClientType('exe')).toBeNull();
  });

  it('valida tamaño y extensión antes de subir', () => {
    const ok = new File([new Uint8Array(1024)], 'foto.png', { type: 'image/png' });
    expect(isAllowedUpload(ok)).toEqual({ ok: true });

    const big = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'grande.mp4');
    expect(isAllowedUpload(big).ok).toBe(false);

    const bad = new File([new Uint8Array(10)], 'script.exe');
    expect(isAllowedUpload(bad).ok).toBe(false);
  });

  it('formatea tamaños legibles', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('deriva el nombre de archivo de la ruta servida', () => {
    expect(fileNameFromPath('/uploads/123-foto.png')).toBe('123-foto.png');
    expect(fileNameFromPath('foto.png')).toBe('foto.png');
  });

  it('etiqueta los estados de asset', () => {
    expect(assetStateLabel('processing')).toBe('procesando');
    expect(assetStateLabel('rejected')).toBe('rechazado');
    expect(assetStateLabel('clean')).toBe('limpio');
    expect(assetStateLabel('desconocido')).toBe('limpio');
  });
});
