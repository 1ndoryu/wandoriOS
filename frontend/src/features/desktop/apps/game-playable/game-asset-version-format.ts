/* GAME-01 — Formateadores compartidos del panel de versiones de Assets 3D
 * (Assets 3D, 297A-73). SRP: solo presentación de tamaños/fechas/resúmenes;
 * no contiene lógica de dominio ni llamadas al servicio. */

import type { GameAssetPreviewSummary } from './game-asset-preview';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

export function formatSummary(summary: GameAssetPreviewSummary): string {
  const parts = [
    `${summary.nodes} nodos`,
    `${summary.meshes} mallas`,
    `${summary.triangles.toLocaleString()} triángulos`,
    `${summary.materials} materiales`,
  ];
  if (summary.animations > 0) parts.push(`${summary.animations} animaciones`);
  if (summary.hasTextures) parts.push('con texturas');
  return parts.join(' · ');
}
