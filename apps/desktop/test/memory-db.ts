import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { schema } from '@fm-immersion/db';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

// Chargé à l'exécution : Vite ne reconnaît pas encore le module natif node:sqlite.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * Reproduit le protocole de src-tauri/src/db.rs : lignes renvoyées sous forme de
 * tableaux, migrations appliquées dans l'ordre des fichiers. Les tests Rust
 * couvrent l'exécution réelle côté SQLite embarqué.
 */
export function memoryDb() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = join(__dirname, '../src-tauri/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(join(dir, file), 'utf8'));
  }
  const run = (sql: string, params: unknown[]) => {
    const stmt = sqlite.prepare(sql);
    if (stmt.columns().length === 0) {
      stmt.run(...(params as never[]));
      return [];
    }
    stmt.setReturnArrays(true);
    return stmt.all(...(params as never[])) as unknown as unknown[][];
  };
  return drizzle(
    async (sql, params, method) => {
      const rows = run(sql, params);
      return { rows: (method === 'get' ? rows[0] : rows) as unknown[] };
    },
    { schema },
  );
}
