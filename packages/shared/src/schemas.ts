import { z } from 'zod';
import { gameIdSchema } from './games';

export const LOCALES = ['fr', 'en'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const createSaveInput = z.object({
  gameId: gameIdSchema,
  name: z.string().trim().min(1).max(80),
  gameVersion: z.string().trim().max(40).optional(),
  notes: z.string().max(10_000).optional(),
});
export type CreateSaveInput = z.infer<typeof createSaveInput>;

export const updateSaveInput = createSaveInput.omit({ gameId: true }).partial();
export type UpdateSaveInput = z.infer<typeof updateSaveInput>;
