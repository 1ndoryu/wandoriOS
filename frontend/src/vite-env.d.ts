/// <reference types="vite/client" />

interface ImportMetaEnv {
  /* VITE_API_URL es el destino del proxy de Vite (servidor), no del navegador. */
  readonly VITE_API_URL?: string;
  /* Prefijo opcional del cliente; vacío = ruta relativa (proxy en dev, mismo origen en prod). */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
