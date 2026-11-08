import { saves } from '@fm-immersion/db';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ChallengeCertificate, ChallengeParams, Rewind } from './challenges';
import type { GazetteWriting } from './gazette';
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
  // Un seul instantané par date de jeu (unique depuis la 0.1.75 ; les doublons d'avant sont retirés par la migration).
  (t) => [uniqueIndex('fm_snapshots_save_date_idx').on(t.saveId, t.gameDate)],
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

/**
 * Défis communautaires suivis par une partie (`challenges.ts`). Une ligne par inscription ; `rewinds` garde les retours
 * en arrière de la date de jeu vus à l'import, avec les résultats connus à ce moment-là (contrôle des matchs rejoués).
 */
export const fmChallenges = sqliteTable(
  'fm_challenges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    saveId: text('save_id')
      .notNull()
      .references(() => saves.id, { onDelete: 'cascade' }),
    challengeId: text('challenge_id').notNull(),
    params: text('params', { mode: 'json' }).$type<ChallengeParams>().notNull(),
    /** Date de jeu de l'inscription : seuls les instantanés de cette date et après comptent. */
    startDate: text('start_date').notNull(),
    /** Manager sans club au moment de l'inscription (lu dans l'état du plugin). */
    unemployedStart: integer('unemployed_start', { mode: 'boolean' }).notNull().default(false),
    rewinds: text('rewinds', { mode: 'json' }).$type<Rewind[]>().notNull(),
    /** Abandonné par le joueur : gardé pour l'historique, plus suivi. */
    abandoned: integer('abandoned', { mode: 'boolean' }).notNull().default(false),
    enrolledAt: text('enrolled_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [index('fm_challenges_save_idx').on(t.saveId)],
);

export type FmChallengeRow = typeof fmChallenges.$inferSelect;

/**
 * Certificats de défi reçus d'autres joueurs (ou les siens), pour le classement dans l'appli. Pas liés à une partie :
 * `digest` (SHA-256 du certificat) les identifie, `verified` = résultat de la vérification faite ici.
 */
export const fmChallengeCerts = sqliteTable('fm_challenge_certs', {
  digest: text('digest').primaryKey(),
  challengeId: text('challenge_id').notNull(),
  coach: text('coach').notNull(),
  status: text('status').notNull(),
  verified: integer('verified', { mode: 'boolean' }).notNull(),
  data: text('data', { mode: 'json' }).$type<ChallengeCertificate>().notNull(),
  importedAt: text('imported_at')
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export type FmChallengeCertRow = typeof fmChallengeCerts.$inferSelect;

/**
 * Gazettes rédigées par l'IA (une par partie et par semaine de jeu). `facts` est l'empreinte des faits envoyés à
 * l'IA : tant qu'ils ne changent pas, la gazette garde le même texte d'une ouverture à l'autre ; une semaine qui
 * s'enrichit (nouvel instantané) est réécrite.
 */
export const fmGazetteWriting = sqliteTable(
  'fm_gazette_writing',
  {
    saveId: text('save_id')
      .notNull()
      .references(() => saves.id, { onDelete: 'cascade' }),
    weekStart: text('week_start').notNull(),
    facts: text('facts').notNull(),
    content: text('content', { mode: 'json' }).$type<GazetteWriting>().notNull(),
    /** Fournisseur et modèle qui l'ont écrite (« ollama/gemma3:12b »). */
    model: text('model').notNull(),
    writtenAt: text('written_at')
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (t) => [primaryKey({ columns: [t.saveId, t.weekStart] })],
);

export type FmGazetteWritingRow = typeof fmGazetteWriting.$inferSelect;
