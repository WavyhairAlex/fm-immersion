import { defineConfig } from 'drizzle-kit';

/**
 * La base vit sur le PC du joueur (SQLite). Les migrations générées ici sont
 * embarquées dans l'exécutable par src-tauri/build.rs et appliquées au démarrage.
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/schema/*.ts', '../../modules/*/src/schema.ts'],
  out: '../../apps/desktop/src-tauri/migrations',
});
