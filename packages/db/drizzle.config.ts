import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '../../.env' });

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/*.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://simloom:simloom@localhost:5432/simloom',
  },
  // Chaque module a son propre schéma PostgreSQL ; le socle vit dans « core ».
  schemaFilter: ['core'],
});
