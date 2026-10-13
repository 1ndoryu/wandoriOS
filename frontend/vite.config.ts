import { defineConfig } from 'vite';

/* [por que] Arranque (workspace-manager) pone el backend en 3104 y declara
 * VITE_API_URL en el proceso de Vite (registro.json, env). El proxy fijo a 3000
 * servia /api/img desde otro servicio (404). Fuera de Arranque, 3000 como antes. */
const API_PROXY_TARGET = process.env.VITE_API_URL || 'http://localhost:3000';

export default defineConfig({
  /* Sin plugins de framework — vanilla TS puro */
  server: {
    port: 5173,
    /* Proxy API requests al backend Rust en desarrollo */
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
      '/uploads': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
      '/swagger-ui': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
      '/api-docs': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    minify: 'terser',
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) exige función; el objeto de Vite 7 da "manualChunks is not a function".
        manualChunks(id) {
          if (/node_modules[\\/]@tiptap[\\/](core|starter-kit)[\\/]/.test(id)) return 'tiptap';
        },
      },
    },
  },
});
