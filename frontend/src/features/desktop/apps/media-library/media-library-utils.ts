/* wandori.us — Media Library Utils
 * Helpers puros de la biblioteca de media. Sin DOM ni I/O.
 * [297A-14 F4] El cliente solo es espejo UX; la autoridad MIME/límites es el backend.
 */

/** Límite de subida espejo del backend (10MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Extensiones aceptadas (misma allowlist que el backend). */
const ALLOWED_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif',
  'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac',
  'mp4', 'webm', 'mov', 'mkv',
]);

/* [018A-88] Filtro `accept` del input file derivado de la allowlist (fuente
 * única con el backend). Se usa en el menú contextual del Finder y en la
 * biblioteca de media. */
export const MEDIA_ACCEPT = [...ALLOWED_EXTENSIONS].map((ext) => `.${ext}`).join(',');

/** Extraer extensión en minúsculas de un nombre de archivo. */
export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Clasificación espejo del cliente (el backend es la autoridad). */
export function classifyClientType(extension: string): 'image' | 'audio' | 'video' | null {
  const ext = extension.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext)) return 'audio';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  return null;
}

/** Validación UX previa a la subida (no sustituye al backend). */
export function isAllowedUpload(file: File): { ok: boolean; reason?: string } {
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: 'el archivo supera 10MB' };
  }
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'tipo de archivo no soportado' };
  }
  return { ok: true };
}

/** Formatear tamaño legible (B/KB/MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Nombre de archivo desde la ruta servida (/uploads/x.png → x.png). */
export function fileNameFromPath(filePath: string): string {
  const parts = filePath.split('/');
  return parts[parts.length - 1] || filePath;
}

/** Etiqueta legible del estado de asset. */
export function assetStateLabel(state: string): string {
  switch (state) {
    case 'processing': return 'procesando';
    case 'rejected': return 'rechazado';
    default: return 'limpio';
  }
}
