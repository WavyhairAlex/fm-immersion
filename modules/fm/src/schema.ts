import { saves } from '@fm-immersion/db';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
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

/**
 * Cibles du mercato : joueurs d'autres clubs lus dans les listes du jeu (liste de suivi, cibles du recrutement),
 * gardés d'un instantané à l'autre. Une ligne par joueur et par partie ; `data` = dernière fiche lue (format du plugin).
 */
export const fmTargets = sqliteTable(
  'fm_targets',
  {
    saveId: text('save_id')
      .notNull()
      .references(() => saves.id, { onDelete: 'cascade' }),
    /** Identifiant du joueur dans FM27 (UniqueId). */
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    club: text('club'),
    /** Dates dans la partie (ISO) : première et dernière fois où le joueur figurait dans une liste du jeu. */
    firstSeen: text('first_seen').notNull(),
    lastSeen: text('last_seen').notNull(),
    inList: integer('in_list', { mode: 'boolean' }).notNull().default(true),
    /** Écartée à la main dans FM Immersion (masquée, le jeu n'est pas modifié). */
    dismissed: integer('dismissed', { mode: 'boolean' }).notNull().default(false),
    data: text('data', { mode: 'json' }).notNull(),
    updatedAt: text('updated_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [primaryKey({ columns: [t.saveId, t.playerId] })],
);

export type FmTargetRow = typeof fmTargets.$inferSelect;
