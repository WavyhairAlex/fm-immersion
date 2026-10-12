import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { Db } from '@simloom/db';
import type { Me } from '@simloom/shared';
import type { Env } from './env';
import type { Mailer } from './lib/mailer';
import { resolveSession } from './lib/session';
import { authRoutes } from './routes/auth';
import { saveRoutes } from './routes/saves';

declare module 'fastify' {
  interface FastifyRequest {
    user: Me | null;
    sessionId: string | null;
  }
}

export interface AppDeps {
  env: Env;
  db: Db;
  mailer: Mailer;
}

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: deps.env.NODE_ENV === 'test' ? false : { level: deps.env.NODE_ENV === 'production' ? 'info' : 'debug' },
    trustProxy: true,
  });

  await app.register(helmet);
  await app.register(cors, { origin: deps.env.WEB_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  // Protection CSRF : cookie SameSite=Lax + refus des requêtes d'écriture venant d'une autre origine.
  app.addHook('onRequest', async (request, reply) => {
    if (!UNSAFE_METHODS.has(request.method)) return;
    const origin = request.headers.origin;
    if (origin && origin !== deps.env.WEB_ORIGIN) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }
  });

  app.addHook('preHandler', async (request) => {
    const session = await resolveSession(deps.db, request);
    request.user = session?.user ?? null;
    request.sessionId = session?.sessionId ?? null;
  });

  app.get('/health', async () => ({ status: 'ok' }));

  await app.register(
    async (api) => {
      // Chaque groupe est un plugin encapsulé : le hook 401 des parties ne doit pas toucher /auth.
      await api.register(async (scope) => authRoutes(scope, deps));
      await api.register(async (scope) => saveRoutes(scope, deps));
    },
    { prefix: '/api/v1' },
  );

  return app;
}
