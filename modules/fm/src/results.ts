import { normalizePlayer, toNumber } from './player';
import type { Line } from './positions';
import type { FmSnapshot } from './snapshot';
import { snapshotFixtures } from './fixtures';
import { deriveStats, matchStatsFull, type PlayerStats, type RawStats } from './stats';
import { gameFormationOf } from './tactic';

/**
 * Résultats des matchs et stats de chaque joueur par match, retrouvés sans nouvelle lecture dans le jeu : entre deux
 * instantanés successifs, la différence des cumuls de saison (stats `stat_*` du Centre de données, matchs, buts et
 * note moyenne) donne ce qui s'est passé pendant la période.
 * - Un seul match dans la période (le cas normal quand l'instantané est relu après chaque match) : score exact
 *   (`TeamGoals` / `TeamConceded` d'un joueur resté 90 minutes), victoire/nul/défaite, onze de départ, note du match.
 * - Plusieurs matchs regroupés : bilan de la période seulement (relire après chaque match pour le détail).
 * L'adversaire vient du « prochain match » de l'instantané précédent ; la tactique, de l'instantané qui suit le match.
 * Puis on croise : bilan par tactique, points pris avec ou sans chaque titulaire, buts contre occasions.
 */

export type Outcome = 'W' | 'D' | 'L';
export const POINTS: Record<Outcome, number> = { W: 3, D: 1, L: 0 };

export interface MatchPlayer {
  id: string;
  name: string;
  line: Line | null;
  minutes: number;
  started: boolean;
  /** Note du match (moyenne de la période si plusieurs matchs), d'après la note moyenne et le nombre de matchs. */
  rating: number | null;
  goals: number | null;
  /** Élu homme du match par le jeu (compteur ManOfMatch qui augmente). */
  potm?: boolean;
  stats: PlayerStats;
}

export interface MatchResult {
  /** Date de l'instantané qui suit le match (ou date du match quand le calendrier la donne). */
  date: string;
  /** Date de l'instantané précédent : le match a eu lieu entre les deux. */
  since: string;
  /** Matchs joués pendant la période (1 = détail exact). */
  matches: number;
  opponent: string | null;
  competition: string | null;
  home: boolean | null;
  outcome: Outcome | null;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number | null;
  goalsAgainst: number | null;
  /** Buts attendus de l'équipe (somme des xG des joueurs). */
  xg: number | null;
  tactic: string | null;
  formation: string | null;
  players: MatchPlayer[];
}

type Raw = Record<string, unknown>;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const apps = (r: RawStats) => (r.StartingAppearances ?? 0) + (r.SubAppearances ?? 0);
const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);

/** Différence des cumuls ; null si le joueur n'était pas dans l'instantané précédent ou si la saison a changé. */
function delta(now: RawStats, ref: RawStats | undefined): RawStats | null {
  if (!ref || (now.Minutes ?? 0) < (ref.Minutes ?? 0)) return null;
  const out: RawStats = {};
  for (const [k, v] of Object.entries(now)) out[k] = v - (ref[k] ?? 0);
  return out;
}

/** Prochain match annoncé par un instantané, s'il tombe avant `until`. */
function nextOpponent(snap: FmSnapshot, until: string): { opponent: string | null; competition: string | null; home: boolean | null } {
  const none = { opponent: null, competition: null, home: null };
  const next = (snap.nextMatch ?? null) as Raw | null;
  const fx = snapshotFixtures(snap).filter((f) => f.date > snap.gameDate || days(snap.gameDate, f.date) === 0);
  const first = fx[0];
  const inDays = toNumber(next?.inDays);
  const date = first?.date ?? null;
  if (date ? days(date, until) < 0 : inDays == null || inDays > days(snap.gameDate, until)) return none;
  const location = typeof next?.location === 'string' ? next.location.toLowerCase() : '';
  return {
    opponent: first?.opponent ?? (typeof next?.opponent === 'string' ? next.opponent : null),
    competition: first?.competition ?? (typeof next?.competition === 'string' ? next.competition : null),
    home: first?.home ?? (/dom|home/.test(location) ? true : /ext|away/.test(location) ? false : null),
  };
}

/** Le match (ou les matchs) joué(s) entre deux instantanés, ou null s'il n'y en a pas. */
export function resultBetween(prev: FmSnapshot, cur: FmSnapshot): MatchResult | null {
  // Changement de club entre les deux : les cumuls n'ont rien à voir.
  if (prev.club !== cur.club) return null;
  const before = matchStatsFull(prev);
  const after = matchStatsFull(cur);
  const prevPlayers = new Map(prev.players.map((p) => [String(p.id), p]));
  const rows: { id: string; d: RawStats }[] = [];
  let reset = 0;
  for (const [id, m] of after) {
    const ref = before.get(id);
    if (ref && (m.raw.Minutes ?? 0) < (ref.raw.Minutes ?? 0)) reset++;
    const d = delta(m.raw, ref?.raw);
    if (d && (d.Minutes ?? 0) > 0) rows.push({ id, d });
  }
  // Nouvelle saison entre les deux : les cumuls repartent de zéro, la différence ne veut rien dire.
  if (reset > rows.length) return null;
  // Un match de l'équipe première = 11 titularisations chez nous. Les cumuls bougent aussi pour un joueur qui joue
  // avec la réserve ou les U19, ou une recrue qui arrive avec ses stats d'un autre club : ce n'est pas un match.
  const starts = sum(rows.map((r) => Math.max(0, r.d.StartingAppearances ?? 0)));
  const matches = Math.min(Math.round(starts / 11), Math.max(0, ...rows.map((r) => apps(r.d))));
  if (!matches) return null;

  // Le joueur resté le plus longtemps sur le terrain voit tout le score (souvent le gardien).
  const full = [...rows].sort((a, b) => (b.d.Minutes ?? 0) - (a.d.Minutes ?? 0))[0]!;
  const seesAll = (full.d.Minutes ?? 0) >= 90 * matches;
  const gf = rows.some((r) => r.d.TeamGoals != null) ? Math.max(...rows.map((r) => r.d.TeamGoals ?? 0)) : null;
  const ga = rows.some((r) => r.d.TeamConceded != null) ? Math.max(...rows.map((r) => r.d.TeamConceded ?? 0)) : null;

  // Score exact quand un joueur a tout vu ; sinon bilan vu par le joueur le plus présent (GamesWon / GamesLost).
  const exact = matches === 1 && seesAll && gf != null && ga != null;
  const ref = [...rows].sort((a, b) => apps(b.d) - apps(a.d) || (b.d.Minutes ?? 0) - (a.d.Minutes ?? 0))[0]!;
  const known = exact || ref.d.GamesWon != null || ref.d.GamesLost != null;
  const wins = exact ? Number(gf! > ga!) : Math.max(0, ref.d.GamesWon ?? 0);
  const losses = exact ? Number(gf! < ga!) : Math.max(0, ref.d.GamesLost ?? 0);
  const draws = known ? Math.max(0, matches - wins - losses) : 0;
  const outcome: Outcome | null = matches === 1 && known ? (wins ? 'W' : losses ? 'L' : 'D') : null;

  const players: MatchPlayer[] = rows.map(({ id, d }) => {
    const now = cur.players.find((p) => String(p.id) === id);
    const old = prevPlayers.get(id);
    const p = now ? normalizePlayer(now) : null;
    const n1 = now?.apps ?? null;
    const n0 = old?.apps ?? null;
    const a1 = now?.avgRating ?? null;
    const a0 = old?.avgRating ?? null;
    const played = n1 != null && n0 != null ? n1 - n0 : 0;
    const rating = played > 0 && a1 != null ? (a1 * n1! - (a0 ?? 0) * n0!) / played : null;
    const g1 = now?.goals ?? null;
    return {
      id,
      name: p?.name ?? id,
      line: p?.line ?? null,
      minutes: d.Minutes ?? 0,
      started: (d.StartingAppearances ?? 0) > 0,
      rating: rating != null && rating > 0 && rating <= 10 ? Math.round(rating * 100) / 100 : null,
      goals: g1 != null ? g1 - (old?.goals ?? 0) : null,
      potm: (d.ManOfMatch ?? 0) > 0,
      stats: deriveStats(d),
    };
  });
  players.sort((a, b) => Number(b.started) - Number(a.started) || b.minutes - a.minutes);

  const xgs = rows.map((r) => r.d.ExpectedGoals).filter((x): x is number => x != null);
  const opp = matches === 1 ? nextOpponent(prev, cur.gameDate) : { opponent: null, competition: null, home: null };
  const tactic = (cur.tactic ?? prev.tactic ?? null) as { name?: string | null; formation?: string | null } | null;
  return {
    date: cur.gameDate,
    since: prev.gameDate,
    matches,
    ...opp,
    outcome,
    wins: known ? wins : 0,
    draws,
    losses: known ? losses : 0,
    goalsFor: gf,
    goalsAgainst: ga,
    xg: xgs.length ? Math.round(sum(xgs) * 100) / 100 : null,
    tactic: typeof tactic?.name === 'string' ? tactic.name : null,
    formation: gameFormationOf(tactic) ?? (typeof tactic?.formation === 'string' ? tactic.formation : null),
    players,
  };
}

/** Tous les matchs retrouvés dans l'historique (du plus ancien au plus récent). */
export function matchResults(history: { gameDate: string; data: FmSnapshot }[]): MatchResult[] {
  const out: MatchResult[] = [];
  for (let i = 1; i < history.length; i++) {
    const r = resultBetween(history[i - 1]!.data, history[i]!.data);
    if (r) out.push(r);
  }
  return out;
}

/* ---------- Ce qui marche ou pas ---------- */

export interface Record3 {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Points par match. */
  ppm: number | null;
}

export interface TacticRecord extends Record3 {
  key: string;
  tactic: string | null;
  formation: string | null;
}

export interface PlayerImpact {
  id: string;
  name: string;
  line: Line | null;
  starts: number;
  /** Points par match quand il est titulaire, et quand il ne l'est pas. */
  ppmWith: number | null;
  ppmWithout: number | null;
  impact: number | null;
  avgRating: number | null;
  goals: number;
}

export type InsightKind = 'tacticBest' | 'tacticWorst' | 'playerPlus' | 'playerMinus' | 'wasteful' | 'lucky' | 'leaky' | 'merged';
export interface Insight {
  kind: InsightKind;
  params: Record<string, string | number>;
}

export interface ResultsAnalysis {
  /** Du plus récent au plus ancien. */
  results: MatchResult[];
  /** 5 derniers résultats connus, du plus ancien au plus récent. */
  form: Outcome[];
  record: Record3;
  byTactic: TacticRecord[];
  players: PlayerImpact[];
  insights: Insight[];
}

/** Matchs minimum de chaque côté pour comparer (avec / sans un joueur, une tactique à une autre). */
export const MIN_SAMPLE = 3;
/** Écart de points par match jugé parlant. */
export const PPM_GAP = 0.5;

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

function record(rs: MatchResult[]): Record3 {
  const matches = sum(rs.map((r) => r.matches));
  const wins = sum(rs.map((r) => r.wins));
  const draws = sum(rs.map((r) => r.draws));
  const losses = sum(rs.map((r) => r.losses));
  const points = 3 * wins + draws;
  const decided = wins + draws + losses;
  return {
    matches,
    wins,
    draws,
    losses,
    points,
    goalsFor: sum(rs.map((r) => r.goalsFor ?? 0)),
    goalsAgainst: sum(rs.map((r) => r.goalsAgainst ?? 0)),
    ppm: decided ? round(points / decided) : null,
  };
}

export function analyzeResults(history: { gameDate: string; data: FmSnapshot }[]): ResultsAnalysis {
  const all = matchResults(history);
  const singles = all.filter((r) => r.outcome);
  const rec = record(all);

  const groups = new Map<string, MatchResult[]>();
  for (const r of all) {
    const key = r.tactic ?? r.formation ?? '?';
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const byTactic: TacticRecord[] = [...groups].map(([key, rs]) => ({ key, tactic: rs.at(-1)!.tactic, formation: rs.at(-1)!.formation, ...record(rs) }));
  byTactic.sort((a, b) => b.matches - a.matches);

  // Avec / sans chaque joueur titulaire, sur les matchs au résultat connu.
  const ids = new Map<string, MatchPlayer>();
  for (const r of singles) for (const p of r.players) ids.set(p.id, p);
  const players: PlayerImpact[] = [...ids.values()].map((p) => {
    const withP = singles.filter((r) => r.players.some((x) => x.id === p.id && x.started));
    const without = singles.filter((r) => !withP.includes(r));
    const ppm = (rs: MatchResult[]) => (rs.length ? round(sum(rs.map((r) => POINTS[r.outcome!])) / rs.length) : null);
    const ratings = all.flatMap((r) => r.players.filter((x) => x.id === p.id && x.rating != null).map((x) => x.rating!));
    const a = ppm(withP);
    const b = ppm(without);
    return {
      id: p.id,
      name: p.name,
      line: p.line,
      starts: withP.length,
      ppmWith: a,
      ppmWithout: b,
      impact: a != null && b != null && withP.length >= MIN_SAMPLE && without.length >= MIN_SAMPLE ? round(a - b) : null,
      avgRating: ratings.length ? round(sum(ratings) / ratings.length) : null,
      goals: sum(all.flatMap((r) => r.players.filter((x) => x.id === p.id).map((x) => x.goals ?? 0))),
    };
  });
  players.sort((a, b) => (b.impact ?? -99) - (a.impact ?? -99) || b.starts - a.starts);

  const insights: Insight[] = [];
  const ranked = byTactic.filter((t) => t.matches >= MIN_SAMPLE && t.ppm != null).sort((a, b) => b.ppm! - a.ppm!);
  if (ranked.length >= 2 && ranked[0]!.ppm! - ranked.at(-1)!.ppm! >= PPM_GAP) {
    const best = ranked[0]!;
    const worst = ranked.at(-1)!;
    insights.push({ kind: 'tacticBest', params: { name: best.key, ppm: best.ppm!, matches: best.matches, other: worst.key, otherPpm: worst.ppm! } });
  }
  for (const p of players.filter((x) => x.impact != null && x.impact >= PPM_GAP).slice(0, 3))
    insights.push({ kind: 'playerPlus', params: { name: p.name, with: p.ppmWith!, without: p.ppmWithout!, starts: p.starts } });
  for (const p of players.filter((x) => x.impact != null && x.impact <= -PPM_GAP).slice(-2))
    insights.push({ kind: 'playerMinus', params: { name: p.name, with: p.ppmWith!, without: p.ppmWithout!, starts: p.starts } });
  // Buts contre occasions : seulement les matchs où les deux sont connus.
  const withXg = all.filter((r) => r.xg != null && r.goalsFor != null);
  const n = sum(withXg.map((r) => r.matches));
  if (n >= MIN_SAMPLE) {
    const g = sum(withXg.map((r) => r.goalsFor!)) / n;
    const x = sum(withXg.map((r) => r.xg!)) / n;
    if (g < x - 0.3) insights.push({ kind: 'wasteful', params: { goals: round(g), xg: round(x) } });
    else if (g > x + 0.3) insights.push({ kind: 'lucky', params: { goals: round(g), xg: round(x) } });
  }
  if (rec.matches >= MIN_SAMPLE && rec.goalsAgainst / rec.matches >= 1.5) insights.push({ kind: 'leaky', params: { ga: round(rec.goalsAgainst / rec.matches) } });
  const merged = all.filter((r) => r.matches > 1).length;
  if (merged) insights.push({ kind: 'merged', params: { count: merged } });

  return {
    results: [...all].reverse(),
    form: singles.slice(-5).map((r) => r.outcome!),
    record: rec,
    byTactic,
    players,
    insights,
  };
}
