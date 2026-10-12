import { defineConfig } from 'tsup';

// Les paquets du workspace sont en TypeScript source : on les embarque dans le bundle.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  clean: true,
  sourcemap: true,
  noExternal: [/^@simloom\//],
});
