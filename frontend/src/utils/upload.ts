/* wandori.us — Upload Helper
 * Sube archivos al backend via /api/media.
 * Retorna la URL del archivo subido. */

import { createEl } from '../utils/dom';
import { MediaService } from '../services';
import { tryCatch } from '../utils/result';
import { publishMediaChanged, type MediaChangedFileType } from '../features/runtime/media-events';
import type { MediaUpload } from '../api/types';

export interface UploadResult {
  url: string;
  media: MediaUpload;
}

export async function uploadFile(
  file: File,
  articleId?: string,
  altText?: string,
): Promise<UploadResult> {
  const media = await MediaService.upload(file, { articleId, altText });
  /* [018A-87] Toda subida de media (editor de artículos, portadas) también
   * aterriza como nodo en su subcarpeta de Documentos vía media-gallery-sync. */
  publishMediaChanged({
    mediaId: media.id,
    operation: 'uploaded',
    fileType: media.file_type as MediaChangedFileType,
    label: media.alt_text || media.file_name,
  });
  return { url: media.url, media };
}

export async function pickAndUpload(
  accept: string,
  articleId?: string,
): Promise<UploadResult | null> {
  return new Promise((resolve, reject) => {
    const input = createEl('input', { type: 'file', accept });
    input.style.display = 'none';

    function cleanup(): void {
      if (input.parentNode) input.parentNode.removeChild(input);
    }

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }

      const result = await tryCatch(uploadFile(file, articleId));
      if (result.ok) {
        resolve(result.value);
      } else {
        reject(new Error(result.error));
      }
    });

    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });

    document.body.appendChild(input);
    input.click();
  });
}
