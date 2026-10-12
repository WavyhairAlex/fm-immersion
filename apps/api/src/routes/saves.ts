import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { saves } from '@simloom/db';
import { createSaveInput, updateSaveInput, type GameId, type SaveDto } from '@simloom/shared';
import type { AppDeps } from '../app';

type SaveRow = typeof saves.$inferSelect;

function toDto(s: SaveRow): SaveDto {
  return {
    id: s.id,
    gameId: s.gameId as GameId,
    name: s.name,
    gameVersion: s.gameVersion,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

/** Parties de l'utilisateur connecté. Privées : jamais visibles d'un autre compte. */
export async function saveRoutes(app: FastifyInstance, deps: AppDeps) {
  const { db } = deps;

  app.addHook('preHandler', async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'unauthenticated' });
  });

  app.get('/saves', async (request) => {
    const rows = await db
      .select()
      .from(saves)
      .where(eq(saves.userId, request.user!.id))
      .orderBy(desc(saves.updatedAt));
    return rows.map(toDto);
  });

  app.post('/saves', async (request, reply) => {
    const parsed = createSaveInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.issues });
    const [row] = await db
      .insert(saves)
      .values({ ...parsed.data, userId: request.user!.id })
      .returning();
    return reply.code(201).send(toDto(row!));
  });

  app.patch<{ Params: { id: string } }>('/saves/:id', async (request, reply) => {
    const parsed = updateSaveInput.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_input', issues: parsed.error.issues });
    const [row] = await db
      .update(saves)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(saves.id, request.params.id), eq(saves.userId, request.user!.id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'not_found' });
    return toDto(row);
  });

  app.delete<{ Params: { id: string } }>('/saves/:id', async (request, reply) => {
    await db.delete(saves).where(and(eq(saves.id, request.params.id), eq(saves.userId, request.user!.id)));
    return reply.code(204).send();
  });
}
