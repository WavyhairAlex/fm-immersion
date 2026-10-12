import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { loginCodes, sessions, users } from '@simloom/db';
import { requestCodeInput, verifyCodeInput, type SessionDto } from '@simloom/shared';
import { generateLoginCode, hashLoginCode, safeEqualHex } from '../lib/crypto';
import { clearSessionCookie, createSession, setSessionCookie } from '../lib/session';
import type { AppDeps } from '../app';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;

export async function authRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db, env, mailer } = deps;
  const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  /**
   * Demande d'un code. Répond toujours 204, que l'adresse existe ou non,
   * pour ne pas révéler qui a un compte. Le compte est créé à la première connexion.
   */
  app.post('/auth/request-code', { config: authLimit }, async (request, reply) => {
    const parsed = requestCodeInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { email, locale } = parsed.data;

    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), gt(loginCodes.createdAt, new Date(Date.now() - 60 * 60 * 1000))));

    if ((recent?.n ?? 0) >= MAX_CODES_PER_HOUR) {
      request.log.warn({ email }, 'login code throttled');
      return reply.code(204).send();
    }

    const code = generateLoginCode();
    await db.insert(loginCodes).values({
      email,
      codeHash: hashLoginCode(env.AUTH_SECRET, email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    await mailer.sendLoginCode(email, code, locale);
    return reply.code(204).send();
  });

  app.post('/auth/verify-code', { config: authLimit }, async (request, reply) => {
    const parsed = verifyCodeInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input' });
    const { email, code } = parsed.data;

    const [pending] = await db
      .select()
      .from(loginCodes)
      .where(and(eq(loginCodes.email, email), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, new Date())))
      .orderBy(desc(loginCodes.createdAt))
      .limit(1);

    if (!pending || pending.attempts >= MAX_ATTEMPTS) {
      return reply.code(400).send({ error: 'invalid_code' });
    }

    await db
      .update(loginCodes)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(loginCodes.id, pending.id));

    if (!safeEqualHex(pending.codeHash, hashLoginCode(env.AUTH_SECRET, email, code))) {
      return reply.code(400).send({ error: 'invalid_code' });
    }

    await db.update(loginCodes).set({ consumedAt: new Date() }).where(eq(loginCodes.id, pending.id));

    await db.insert(users).values({ email }).onConflictDoNothing({ target: users.email });
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return reply.code(500).send({ error: 'user_creation_failed' });

    const token = await createSession(db, user.id, request.headers['user-agent'] ?? null);
    setSessionCookie(reply, token, env.NODE_ENV === 'production');
    return reply.send({ id: user.id, email: user.email, locale: user.locale });
  });

  app.get('/auth/me', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'unauthenticated' });
    return request.user;
  });

  app.post('/auth/logout', async (request, reply) => {
    if (request.sessionId) await db.delete(sessions).where(eq(sessions.id, request.sessionId));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  /** Appareils connectés, pour la déconnexion à distance. */
  app.get('/auth/sessions', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'unauthenticated' });
    const rows = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, request.user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt));
    const list: SessionDto[] = rows.map((s) => ({
      id: s.id,
      current: s.id === request.sessionId,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    }));
    return list;
  });

  app.delete<{ Params: { id: string } }>('/auth/sessions/:id', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'unauthenticated' });
    await db
      .delete(sessions)
      .where(and(eq(sessions.id, request.params.id), eq(sessions.userId, request.user.id)));
    return reply.code(204).send();
  });
}
