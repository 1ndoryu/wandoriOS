import { defineConfig } from 'orval';

const openApiTarget = process.env.OPENAPI_INPUT ?? 'http://localhost:3000/api-docs/openapi.json';

export default defineConfig({
  glory: {
    input: {
      /* El servidor sigue siendo el origen por defecto; CI/codegen local puede
       * usar el export estático para no arrancar BD ni dejar procesos vivos. */
      target: openApiTarget,
    },
    output: {
      /* Vanilla TS usa el cliente fetch compartido; tags-split evita un
       * generated.ts monolítico y permite regenerar por dominio. */
      target: './src/api/generated/index.ts',
      client: 'fetch',
      mode: 'tags-split',
      override: {
        mutator: {
          path: './src/api/generated-fetch.ts',
          name: 'customFetcher',
        },
      },
    },
  },
});
