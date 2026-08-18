import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    /* [018A-4] El modo local usa un worker y sin paralelismo de archivos para
     * evitar que cada agente degrade el equipo. CI puede sobrescribir límites
     * explícitamente en test:full cuando tenga recursos dedicados. */
    pool: 'threads',
    minWorkers: 1,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
