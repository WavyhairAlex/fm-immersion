import { saves, type Save } from '@fm-immersion/db';
import { createSaveInput, updateSaveInput, type CreateSaveInput, type UpdateSaveInput } from '@fm-immersion/shared';
import { desc, eq } from 'drizzle-orm';
import type { Db } from './db';

export type { Save };

/** Parties du joueur. Tout est stocké en local, rien ne quitte le PC. */
export function savesRepo(db: Db) {
  return {
    list: () => db.select().from(saves).orderBy(desc(saves.updatedAt)),

    async create(input: CreateSaveInput): Promise<Save> {
      const [row] = await db.insert(saves).values(createSaveInput.parse(input)).returning();
      return row!;
    },

    async update(id: string, input: UpdateSaveInput): Promise<Save | undefined> {
      const [row] = await db
        .update(saves)
        .set({ ...updateSaveInput.parse(input), updatedAt: new Date().toISOString() })
        .where(eq(saves.id, id))
        .returning();
      return row;
    },

    remove: (id: string) => db.delete(saves).where(eq(saves.id, id)),
  };
}
