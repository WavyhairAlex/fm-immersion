import { z } from 'zod';

/**
 * Match en cours écrit par le plugin toutes les 15 s pendant un match (`archivix-live.json`, plugin 0.5.0).
 * Lu dans le jeu sur le match du manager humain : score, minute affichée (« 19 min. », « FDM » à la fin),
 * buteurs en texte du jeu (« L. Carrero pen 36', M. Fábry 11', 90+1' »), fin du match.
 */
/**
 * Événement du match tel que le jeu le liste (`HomeEventInfos`) : type 0 but, 2 penalty ; temps affiché (« pen 36' »).
 * En fin de match (plugin 0.5.4, rapport du match), `player` = buteur et `assist` = passeur décisif (null sans passe).
 */
export const fmLiveEventSchema = z
  .object({ type: z.number().nullish(), time: z.string().nullish(), slice: z.number().nullish(), player: z.string().nullish(), assist: z.string().nullish() })
  .passthrough();
export type FmLiveEvent = z.infer<typeof fmLiveEventSchema>;

/**
 * Joueur de la feuille de match (`HomeLineup`/`AwayLineup`), connue en fin de match (plugin 0.5.4) : note et événements
 * bruts du jeu (`events`). Les compteurs `goals`/`assists`/`yellow`/`red` sont prévus pour quand le plugin saura les lire.
 */
export const fmLivePlayerSchema = z
  .object({
    name: z.string(),
    rating: z.number().nullish(),
    events: z.array(z.unknown()).nullish(),
    goals: z.number().nullish(),
    assists: z.number().nullish(),
    yellow: z.boolean().nullish(),
    red: z.boolean().nullish(),
  })
  .passthrough();

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
    homeEvents: z.array(fmLiveEventSchema).nullish(),
    awayEvents: z.array(fmLiveEventSchema).nullish(),
    homeLineup: z.array(fmLivePlayerSchema).nullish(),
    awayLineup: z.array(fmLivePlayerSchema).nullish(),
  })
  .passthrough();

export type FmLive = z.infer<typeof fmLiveSchema>;
export type FmLivePlayer = z.infer<typeof fmLivePlayerSchema>;

/** But sur penalty : le jeu préfixe la minute (« pen 36' »). */
export const isPenalty = (time: string | null | undefined) => /^pen/i.test(time ?? '');

/** But contre son camp : le jeu note la minute « c.s.c. 26' » (« og 26' » en anglais). Le nom est celui du fautif. */
export const isOwnGoal = (time: string | null | undefined) => /^(c\.?\s*s\.?\s*c\.?|o\.?\s*g\.?)(\s|\d|$)/i.test((time ?? '').trim());

/** Passe décisive connue du rapport de match : passeur, buteur, minute, côté. */
export interface LiveAssist {
  side: 'home' | 'away';
  assist: string;
  player: string | null;
  time: string | null;
}

/** Passes décisives du relevé (événements avec `assist`, dans l'ordre du jeu) : vide tant que le rapport n'est pas lu. */
export function liveAssists(l: FmLive): LiveAssist[] {
  const out: LiveAssist[] = [];
  for (const side of ['home', 'away'] as const) {
    for (const e of (side === 'home' ? l.homeEvents : l.awayEvents) ?? []) {
      if (e.assist) out.push({ side, assist: e.assist, player: e.player ?? null, time: e.time ?? null });
    }
  }
  return out;
}

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

/**
 * Ce qu'il faut annoncer entre deux relevés du même match (le premier relevé connu : rien que le tableau).
 * But : côté, buteur, penalty, passeur décisif (quand la feuille de match le donne). Carton : joueur et couleur.
 */
export type LiveNews =
  | { kind: 'goal'; side: 'home' | 'away'; scorer: LiveGoal | null; penalty: boolean; assist: string | null }
  | { kind: 'card'; side: 'home' | 'away'; player: string; card: 'yellow' | 'red' }
  | { kind: 'final' };

export type LiveGoalNews = Extract<LiveNews, { kind: 'goal' }>;
export type LiveCardNews = Extract<LiveNews, { kind: 'card' }>;

const goalId = (g: LiveGoal) => `${g.name}|${g.time}`;

const lineupOf = (l: FmLive, side: 'home' | 'away') => (side === 'home' ? l.homeLineup : l.awayLineup) ?? null;

/** Joueurs d'une équipe dont le compteur (`assists`, `goals`) a augmenté entre deux feuilles de match. */
function increased(prev: FmLivePlayer[], cur: FmLivePlayer[], key: 'assists' | 'goals'): string[] {
  const before = new Map(prev.map((p) => [p.name, p[key] ?? 0]));
  return cur.filter((p) => (p[key] ?? 0) > (before.get(p.name) ?? 0)).map((p) => p.name);
}

/**
 * Cartons apparus entre deux feuilles de match. Un joueur dont le rouge apparaît (second jaune compris) n'est annoncé
 * que pour le rouge. Sans feuille de match au relevé précédent, rien : on ne rejoue pas les cartons déjà pris.
 */
export function liveCards(prev: FmLive, cur: FmLive): LiveCardNews[] {
  const out: LiveCardNews[] = [];
  for (const side of ['home', 'away'] as const) {
    const before = lineupOf(prev, side);
    const after = lineupOf(cur, side);
    if (!before || !after) continue;
    const was = new Map(before.map((p) => [p.name, p]));
    for (const p of after) {
      const w = was.get(p.name);
      if (p.red && !w?.red) out.push({ kind: 'card', side, player: p.name, card: 'red' });
      else if (p.yellow && !w?.yellow) out.push({ kind: 'card', side, player: p.name, card: 'yellow' });
    }
  }
  return out;
}

/**
 * Buts marqués, cartons et fin du match depuis le relevé précédent. Le côté du but vient du score qui a augmenté ;
 * le buteur, du nouveau nom apparu dans le texte des buteurs (null si le jeu ne l'a pas encore écrit) ; le penalty,
 * du préfixe « pen » de sa minute ; le passeur, du seul joueur de l'équipe dont les passes décisives ont augmenté.
 */
export function liveNews(prev: FmLive | null, cur: FmLive): LiveNews[] {
  if (!prev || liveKey(prev) !== liveKey(cur)) return [];
  const news: LiveNews[] = [];
  const known = new Set(parseScorers(prev.scorers).map(goalId));
  const fresh = parseScorers(cur.scorers).filter((g) => !known.has(goalId(g)));
  for (const side of ['home', 'away'] as const) {
    const before = (side === 'home' ? prev.homeScore : prev.awayScore) ?? 0;
    const after = (side === 'home' ? cur.homeScore : cur.awayScore) ?? 0;
    for (let i = before; i < after; i++) news.push({ kind: 'goal', side, scorer: null, penalty: false, assist: null });
  }
  const goals = news.filter((n): n is LiveGoalNews => n.kind === 'goal');
  // Un seul but : le nouveau nom est forcément le sien. Plusieurs buts d'un coup : on ne devine pas.
  if (goals.length === 1 && fresh.length === 1) {
    const g = goals[0]!;
    g.scorer = fresh[0]!;
    g.penalty = isPenalty(g.scorer.time);
    const before = lineupOf(prev, g.side);
    const after = lineupOf(cur, g.side);
    if (before && after) {
      const passers = increased(before, after, 'assists').filter((n) => n !== g.scorer!.name);
      if (passers.length === 1) g.assist = passers[0]!;
    }
    // Rapport de match déjà là (but dans les dernières minutes) : le passeur est sur l'événement du but.
    if (!g.assist) {
      const ev = liveAssists(cur).find((a) => a.side === g.side && a.time === g.scorer!.time);
      if (ev) g.assist = ev.assist;
    }
  }
  news.push(...liveCards(prev, cur));
  if (cur.final && !prev.final) news.push({ kind: 'final' });
  return news;
}

/** Cartons de la feuille de match (jaunes puis rouges, chaque équipe), pour l'encart : vide sans feuille de match. */
export function liveCardList(l: FmLive): { side: 'home' | 'away'; player: string; card: 'yellow' | 'red' }[] {
  const out: { side: 'home' | 'away'; player: string; card: 'yellow' | 'red' }[] = [];
  for (const side of ['home', 'away'] as const) {
    for (const p of lineupOf(l, side) ?? []) {
      if (p.red) out.push({ side, player: p.name, card: 'red' });
      else if (p.yellow) out.push({ side, player: p.name, card: 'yellow' });
    }
  }
  return out;
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
