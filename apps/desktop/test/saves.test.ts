import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { schema } from '@simloom/db';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { beforeEach, describe, expect, it } from 'vitest';
import { savesRepo } from '../src/lib/saves';

// Chargé à l'exécution : Vite ne reconnaît pas encore le module natif node:sqlite.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite');

/**
 * Reproduit le protocole de src-tauri/src/db.rs : lignes renvoyées sous forme de
 * tableaux, migrations appliquées dans l'ordre des fichiers. Les tests Rust
 * couvrent l'exécution réelle côté SQLite embarqué.
 */
function memoryDb() {
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

describe('parties', () => {
  let repo: ReturnType<typeof savesRepo>;
  beforeEach(() => {
    repo = savesRepo(memoryDb() as never);
  });

  it('crée, liste, renomme et supprime une partie', async () => {
    const created = await repo.create({ gameId: 'tf3', name: '  Europe 1850 ', gameVersion: '1.0' });
    expect(created).toMatchObject({ gameId: 'tf3', name: 'Europe 1850', gameVersion: '1.0', extra: {} });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);

    expect(await repo.list()).toHaveLength(1);

    const renamed = await repo.update(created.id, { name: 'Europe 1900' });
    expect(renamed?.name).toBe('Europe 1900');
    expect(renamed!.updatedAt >= created.updatedAt).toBe(true);

    await repo.remove(created.id);
    expect(await repo.list()).toHaveLength(0);
  });

  it('refuse un jeu inconnu ou un nom vide', async () => {
    await expect(repo.create({ gameId: 'sims' as never, name: 'x' })).rejects.toThrow();
    await expect(repo.create({ gameId: 'pz2', name: '   ' })).rejects.toThrow();
  });
});
