import { saves } from '@simloom/db';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { FmSnapshot } from './snapshot';

/**
 * Instantanés de l'effectif importés depuis le plugin, un par date de jeu.
 * Garder l'historique permet de suivre la progression des joueurs semaine après semaine.
 */
export const fmSnapshots = sqliteTable(
  'fm_snapshots',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    saveId: text('save_id')
      .notNull()
      .references(() => saves.id, { onDelete: 'cascade' }),
    /** Date dans la partie (ISO), pas la date réelle. */
    gameDate: text('game_date').notNull(),
    club: text('club').notNull(),
    playerCount: integer('player_count').notNull(),
    data: text('data', { mode: 'json' }).$type<FmSnapshot>().notNull(),
    importedAt: text('imported_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('fm_snapshots_save_idx').on(t.saveId, t.gameDate)],
);

export type FmSnapshotRow = typeof fmSnapshots.$inferSelect;
