import { z } from 'zod';
import { gameIdSchema } from './games';

export const LOCALES = ['fr', 'en'] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export const requestCodeInput = z.object({
  email: emailSchema,
  locale: localeSchema.default('fr'),
});
export type RequestCodeInput = z.infer<typeof requestCodeInput>;

export const verifyCodeInput = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/, 'Le code fait 6 chiffres'),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeInput>;

export const createSaveInput = z.object({
  gameId: gameIdSchema,
  name: z.string().trim().min(1).max(80),
  gameVersion: z.string().trim().max(40).optional(),
  notes: z.string().max(10_000).optional(),
});
export type CreateSaveInput = z.infer<typeof createSaveInput>;

export const updateSaveInput = createSaveInput.omit({ gameId: true }).partial();
export type UpdateSaveInput = z.infer<typeof updateSaveInput>;

export interface Me {
  id: string;
  email: string;
  locale: Locale;
}

export interface SaveDto {
  id: string;
  gameId: z.infer<typeof gameIdSchema>;
  name: string;
  gameVersion: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionDto {
  id: string;
  current: boolean;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
}
