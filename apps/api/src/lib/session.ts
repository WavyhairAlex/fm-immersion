import { and, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { sessions, users, type Db } from '@simloom/db';
import type { Locale, Me } from '@simloom/shared';
import { generateSessionToken, hashSessionToken } from './crypto';

export const SESSION_COOKIE = 'simloom_session';
const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY;

export async function createSession(db: Db, userId: string, userAgent: string | null) {
  const token = generateSessionToken();
  const now = new Date();
  await db.insert(sessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    userAgent: userAgent?.slice(0, 300) ?? null,
    lastSeenAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
  });
  return token;
}

export function setSessionCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Retrouve la session depuis le cookie. Session glissante : si la dernière
 * activité date de plus d'un jour, on repousse l'expiration à 30 jours.
 */
export async function resolveSession(
  db: Db,
  request: FastifyRequest,
): Promise<{ sessionId: string; user: Me } | null> {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;

  const now = new Date();
  const rows = await db
    .select({
      sessionId: sessions.id,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      email: users.email,
      locale: users.locale,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashSessionToken(token)), gt(sessions.expiresAt, now)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (now.getTime() - row.lastSeenAt.getTime() > DAY) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
      .where(eq(sessions.id, row.sessionId));
  }

  return {
    sessionId: row.sessionId,
    user: { id: row.userId, email: row.email, locale: row.locale as Locale },
  };
}
