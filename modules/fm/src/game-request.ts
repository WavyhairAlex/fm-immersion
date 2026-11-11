import { z } from 'zod';

/**
 * Demande envoyée depuis FM27 par le bouton « FM Immersion » de la fiche d'un joueur (plugin FM Immersion Fiche,
 * fichier `fmimmersion-demande.json` du dossier du plugin). Le plugin ne fait que lire l'écran affiché : il écrit le
 * nom du joueur de la fiche et ce que le joueur veut, l'appli fait le reste.
 */
export const GameRequestSchema = z.object({
  schema: z.literal('fmimmersion-demande/1'),
  /** Identifiant unique de la demande : l'appli retient la dernière traitée. */
  id: z.string().min(1).max(80),
  action: z.enum(['ouvrir']),
  /** Nom du joueur tel qu'affiché en tête de sa fiche dans FM27. */
  nom: z.string().min(1).max(200),
  /** Heure réelle (ISO) de la demande. */
  quand: z.string(),
});
export type GameRequest = z.infer<typeof GameRequestSchema>;

/** Une demande plus vieille ne compte plus (appli fermée au moment du clic). */
export const GAME_REQUEST_MAX_AGE_MS = 2 * 60_000;

/** Demande valide et récente, sinon null. */
export function parseGameRequest(text: string, now = Date.now()): GameRequest | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const r = GameRequestSchema.safeParse(raw);
  if (!r.success) return null;
  const at = Date.parse(r.data.quand);
  if (!Number.isFinite(at) || now - at > GAME_REQUEST_MAX_AGE_MS || at - now > GAME_REQUEST_MAX_AGE_MS) return null;
  return r.data;
}

const fold = (s: string) =>
  s
    .replace(/<[^>]*>/g, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Joueur de l'effectif désigné par le nom de la fiche : même nom complet (accents et casse ignorés), sinon un seul
 * joueur dont le nom finit par le nom de famille affiché (« D. Húska »). Null si personne ou plusieurs.
 */
export function playerForRequest<P extends { id: string; name: string }>(players: readonly P[], nom: string): P | null {
  const want = fold(nom);
  if (!want) return null;
  const exact = players.filter((p) => fold(p.name) === want);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;
  const last = want.split(' ').at(-1)!;
  const initial = /^(\w)\.\s/.exec(want)?.[1];
  const close = players.filter((p) => {
    const n = fold(p.name);
    return n.split(' ').at(-1) === last && (!initial || n.startsWith(initial));
  });
  return close.length === 1 ? close[0]! : null;
}
