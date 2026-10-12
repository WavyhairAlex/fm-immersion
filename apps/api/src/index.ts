import { createDb } from '@simloom/db';
import { buildApp } from './app';
import { loadEnv } from './env';
import { createMailer } from './lib/mailer';

const env = loadEnv();
const { db, close } = createDb(env.DATABASE_URL);
const app = await buildApp({ env, db, mailer: createMailer(env) });

const shutdown = async () => {
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: env.PORT, host: '0.0.0.0' });
