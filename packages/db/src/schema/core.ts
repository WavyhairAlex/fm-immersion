import { sql } from 'drizzle-orm';
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const now = () => new Date().toISOString();

/**
 * Une partie : un réseau de transport, un zoo, une carrière…
 * Les tables des modules sont préfixées par l'id du jeu (fm_…)
 * et référencent saves.id.
 */
export const saves = sqliteTable(
  'saves',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gameId: text('game_id').notNull(),
    name: text('name').notNull(),
    gameVersion: text('game_version'),
    /** Notes libres : l'outil doit rester aussi souple qu'un tableur. */
    notes: text('notes'),
    /** Champs ajoutés par l'utilisateur (JSON). */
    extra: text('extra', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
    createdAt: text('created_at').notNull().$defaultFn(now),
    updatedAt: text('updated_at').notNull().$defaultFn(now),
  },
  (t) => [index('saves_game_idx').on(t.gameId)],
);

export type Save = typeof saves.$inferSelect;
export type NewSave = typeof saves.$inferInsert;
