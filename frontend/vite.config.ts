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
        manualChunks: {
          tiptap: ['@tiptap/core', '@tiptap/starter-kit'],
        },
      },
    },
  },
});
