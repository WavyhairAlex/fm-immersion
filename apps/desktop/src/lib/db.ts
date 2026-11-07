import { schema } from '@fm-immersion/db';
import { invoke } from '@tauri-apps/api/core';
import { drizzle } from 'drizzle-orm/sqlite-proxy';

type Method = 'run' | 'all' | 'values' | 'get';

/** Pour `get`, Drizzle attend une seule ligne (ou rien), pas une liste. */
const shape = (rows: unknown[][], method: Method) => (method === 'get' ? rows[0] : rows);

/**
 * Base SQLite locale. Les requêtes sont construites ici avec Drizzle,
 * puis exécutées côté Rust (src-tauri/src/db.rs).
 */
export const db = drizzle(
  async (sql, params, method) => {
    const rows = await invoke<unknown[][]>('db_query', { sql, params });
    return { rows: shape(rows, method) as unknown[] };
  },
  async (queries) => {
    const results = await invoke<unknown[][][]>('db_batch', {
      queries: queries.map(({ sql, params }) => ({ sql, params })),
    });
    return results.map((rows, i) => ({ rows: shape(rows, queries[i]!.method) as unknown[] }));
  },
  { schema },
);

export type Db = typeof db;
