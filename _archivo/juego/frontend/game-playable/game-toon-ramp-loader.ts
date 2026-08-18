/* 138A-15 — Carga de una rampa toon desde dataURL para el panel de Textura:
 * muestrea la fila central de la imagen como gradiente de 8 bandas. */

import * as THREE from 'three';

export function loadToonRampFromDataUrl(dataUrl: string): Promise<THREE.DataTexture> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      try {
        const size = 8;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('canvas 2d no disponible');
        /* Muestrea la fila central de la imagen como gradiente toon. */
        const sourceY = Math.floor(image.height / 2);
        context.drawImage(image, 0, sourceY, image.width, 1, 0, 0, size, 1);
        const pixels = context.getImageData(0, 0, size, 1).data;
        const data = new Uint8Array(size * 4);
        for (let i = 0; i < size; i += 1) {
          data[i * 4] = pixels[i * 4];
          data[i * 4 + 1] = pixels[i * 4 + 1];
          data[i * 4 + 2] = pixels[i * 4 + 2];
          data[i * 4 + 3] = 255;
        }
        const ramp = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
        ramp.minFilter = THREE.NearestFilter;
        ramp.magFilter = THREE.NearestFilter;
        ramp.generateMipmaps = false;
        ramp.colorSpace = THREE.NoColorSpace;
        ramp.needsUpdate = true;
        resolve(ramp);
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('imagen no cargable'));
    image.src = dataUrl;
  });
}
