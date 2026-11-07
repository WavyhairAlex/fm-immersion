import { z } from 'zod';

/**
 * Match en cours écrit par le plugin toutes les 15 s pendant un match (`archivix-live.json`, plugin 0.5.0).
 * Lu dans le jeu sur le match du manager humain : score, minute affichée (« 19 min. », « FDM » à la fin),
 * buteurs en texte du jeu (« L. Carrero pen 36', M. Fábry 11', 90+1' »), fin du match.
 */
export const fmLiveSchema = z
  .object({
    schema: z.literal('archivix-live/1'),
    gameDate: z.string().nullish(),
    updatedAt: z.string(),
    inMatch: z.boolean().nullish(),
    home: z.string(),
    away: z.string(),
    homeScore: z.number().nullish(),
    awayScore: z.number().nullish(),
    minute: z.string().nullish(),
    final: z.boolean().nullish(),
    scorers: z.string().nullish(),
  })
  .passthrough();

export type FmLive = z.infer<typeof fmLiveSchema>;

/** Un but du texte des buteurs : nom et minute telle que le jeu l'affiche (« pen 36' », « 90+1' »). */
export interface LiveGoal {
  name: string;
  time: string;
}

const MINUTE = /^((?:pen\.?\s+|c\.s\.c\.?\s+|og\s+)?\d+(?:\+\d+)?')$/i;

/**
 * Découpe le texte des buteurs du jeu : « M. Fábry 11', 90+1', A. Mojžiš 26' » donne trois buts.
 * Une minute seule après une virgule appartient au buteur précédent.
 */
export function parseScorers(text: string | null | undefined): LiveGoal[] {
  const goals: LiveGoal[] = [];
  let name = '';
  for (const raw of (text ?? '').split(',')) {
    const part = raw.trim();
    if (!part) continue;
    if (MINUTE.test(part)) {
      if (name) goals.push({ name, time: part });
      continue;
    }
    const m = /^(.*?)\s+((?:pen\.?\s+|c\.s\.c\.?\s+|og\s+)?\d+(?:\+\d+)?')$/i.exec(part);
    if (!m) continue;
    name = m[1]!.trim();
    goals.push({ name, time: m[2]! });
  }
  return goals;
}

/** Même match d'un relevé à l'autre : date de jeu et équipes. */
export const liveKey = (l: FmLive) => `${l.gameDate ?? ''}|${l.home}|${l.away}`;

/** Ce qu'il faut annoncer entre deux relevés du même match (le premier relevé connu : rien que le tableau). */
export type LiveNews = { kind: 'goal'; side: 'home' | 'away'; scorer: LiveGoal | null } | { kind: 'final' };

const goalId = (g: LiveGoal) => `${g.name}|${g.time}`;

/**
 * Buts marqués et fin du match depuis le relevé précédent. Le côté du but vient du score qui a augmenté ;
 * le buteur, du nouveau nom apparu dans le texte des buteurs (null si le jeu ne l'a pas encore écrit).
 */
export function liveNews(prev: FmLive | null, cur: FmLive): LiveNews[] {
  if (!prev || liveKey(prev) !== liveKey(cur)) return [];
  const news: LiveNews[] = [];
  const known = new Set(parseScorers(prev.scorers).map(goalId));
  const fresh = parseScorers(cur.scorers).filter((g) => !known.has(goalId(g)));
  for (const side of ['home', 'away'] as const) {
    const before = (side === 'home' ? prev.homeScore : prev.awayScore) ?? 0;
    const after = (side === 'home' ? cur.homeScore : cur.awayScore) ?? 0;
    for (let i = before; i < after; i++) news.push({ kind: 'goal', side, scorer: null });
  }
  const goals = news.filter((n): n is Extract<LiveNews, { kind: 'goal' }> => n.kind === 'goal');
  // Un seul but : le nouveau nom est forcément le sien. Plusieurs buts d'un coup : on ne devine pas.
  if (goals.length === 1 && fresh.length === 1) goals[0]!.scorer = fresh[0]!;
  if (cur.final && !prev.final) news.push({ kind: 'final' });
  return news;
}

/** Relevé encore frais : le plugin réécrit le fichier toutes les 15 s pendant le match. */
export function liveIsFresh(l: FmLive, now: number, maxAgeMs = 120_000) {
  const t = Date.parse(l.updatedAt);
  return Number.isFinite(t) && now - t <= maxAgeMs;
}

/**
 * Minute de jeu du relevé : « 62 min. » → 62, « 90+3' » → 93, mi-temps (« MT », « HT ») → 45, sinon null
 * (« FDM », vide).
 */
export function liveMinute(text: string | null | undefined): number | null {
  const m = /(\d+)(?:\s*\+\s*(\d+))?/.exec(text ?? '');
  if (m) return Number(m[1]) + Number(m[2] ?? 0);
  return /^\s*(mt|ht|mi-temps|half)/i.test(text ?? '') ? 45 : null;
}

/** Match en cours vu du club du joueur, pour la feuille de match de FM Coach. */
export interface LiveCoach {
  side: 'home' | 'away';
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  /** Écart de buts pour le club (+1 = en tête d'un but). */
  diff: number;
  /** Minute de jeu (90 une fois le match fini, 0 avant le coup d'envoi). */
  minute: number;
  final: boolean;
}

/**
 * État du match en direct pour le club du joueur : le relevé doit être frais et concerner son club, reconnu par
 * son nom (`club`) ou, à défaut, par l'adversaire du prochain match (`opponent`). Sinon null : la feuille de match
 * reste en saisie manuelle.
 */
export function liveCoachState(l: FmLive, club: string | null | undefined, opponent: string | null | undefined, now: number): LiveCoach | null {
  if (!liveIsFresh(l, now) || l.inMatch === false) return null;
  const side: 'home' | 'away' | null =
    club && club === l.home ? 'home' : club && club === l.away ? 'away' : opponent && opponent === l.away ? 'home' : opponent && opponent === l.home ? 'away' : null;
  if (!side) return null;
  const home = l.homeScore ?? 0;
  const away = l.awayScore ?? 0;
  const goalsFor = side === 'home' ? home : away;
  const goalsAgainst = side === 'home' ? away : home;
  const final = !!l.final;
  return {
    side,
    opponent: side === 'home' ? l.away : l.home,
    goalsFor,
    goalsAgainst,
    diff: goalsFor - goalsAgainst,
    minute: final ? Math.max(90, liveMinute(l.minute) ?? 90) : (liveMinute(l.minute) ?? 0),
    final,
  };
}
