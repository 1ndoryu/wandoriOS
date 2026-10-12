import { defineConfig } from 'vite';

export default defineConfig({
  /* Sin plugins de framework — vanilla TS puro */
  server: {
    port: 5173,
    /* Proxy API requests al backend Rust en desarrollo */
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/swagger-ui': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api-docs': {
        target: 'http://localhost:3000',
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
