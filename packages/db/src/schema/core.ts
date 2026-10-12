import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Schéma du socle. Les modules de jeu ont chacun leur propre schéma
 * (tf3, pz2, fm…) et leurs tables référencent core.saves(id).
 */
export const core = pgSchema('core');

export const users = core.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Toujours stockée en minuscules. Seule donnée personnelle collectée. */
    email: text('email').notNull(),
    locale: text('locale').notNull().default('fr'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)],
);

/** Codes de connexion à usage unique (6 chiffres, 10 minutes). Seul le hash est stocké. */
export const loginCodes = core.table(
  'login_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('login_codes_email_idx').on(t.email, t.createdAt)],
);

/** Sessions de 30 jours, prolongées à chaque visite. Seul le hash du jeton est stocké. */
export const sessions = core.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex('sessions_token_idx').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

/** Une partie : un réseau de zoos, une carrière, un réseau de transport… */
export const saves = core.table(
  'saves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    gameId: text('game_id').notNull(),
    name: text('name').notNull(),
    gameVersion: text('game_version'),
    /** Notes libres : l'outil doit rester aussi souple qu'un tableur. */
    notes: text('notes'),
    /** Champs ajoutés par l'utilisateur. */
    extra: jsonb('extra').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('saves_user_idx').on(t.userId)],
);
