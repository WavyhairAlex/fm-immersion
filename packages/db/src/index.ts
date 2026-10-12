import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as coreSchema from './schema/core';

export * from './schema/core';

export const schema = { ...coreSchema };

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  return { db, close: () => client.end() };
}

export type Db = ReturnType<typeof createDb>['db'];
