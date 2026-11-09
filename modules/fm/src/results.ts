import { normalizePlayer } from './player';
import type { Line } from './positions';
import type { FmSnapshot } from './snapshot';
import { daysUntil, decodeGameDate, snapshotFixtures } from './fixtures';
import { deriveStats, matchStatsFull, type PlayerStats, type RawStats } from './stats';
import { isFriendly } from './rules';
import { gameFormationOf } from './tactic';
import { addDays } from './training';

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
  /** Jour du match d'après le calendrier de l'instantané précédent (un seul match), sinon absent : `date` reste la clé. */
  played?: string | null;
  /** Matchs joués pendant la période (1 = détail exact). */
  matches: number;
  opponent: string | null;
  competition: string | null;
  /** Match amical : montré dans les résultats, mais hors bilan, forme, analyses et temps de jeu. */
  friendly: boolean;
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

/**
 * Différence des cumuls ; null si le joueur n'était pas dans l'instantané précédent ou si la saison a changé.
 * `known` : stats lues dans l'instantané précédent (pour au moins un joueur). Une stat que le plugin ne lisait pas
 * encore n'est pas « zéro » : sans cette précaution, le premier instantané après l'ajout des stats au plugin
 * (14/02/2027 dans la partie de Malženice) faisait de toute la première moitié de saison une période de 20 matchs nuls.
 */
function delta(now: RawStats, ref: RawStats | undefined, known: Set<string>): RawStats | null {
  if (!ref || (now.Minutes ?? 0) < (ref.Minutes ?? 0)) return null;
  const out: RawStats = {};
  for (const [k, v] of Object.entries(now)) if (known.has(k)) out[k] = v - (ref[k] ?? 0);
  return out;
}

const outcomeOf = (d: RawStats): Outcome => ((d.GamesWon ?? 0) > 0 ? 'W' : (d.GamesLost ?? 0) > 0 ? 'L' : 'D');

/**
 * Joueurs du match de l'équipe première quand la période ne contient qu'un match. Les cumuls bougent aussi pour un
 * joueur qui a joué ce jour-là avec la réserve ou les U19 (vu le 08/11/2026 : Frimpong, 90 minutes et un but avec la
 * réserve, compté dans le 3-0 contre Nitra ; Drobný, deux buts de la réserve, qui changeaient le 1-3 de coupe contre
 * Púchov en 2-3). On garde le résultat (victoire, nul, défaite) vu par le plus de titulaires, puis on écarte qui a vu
 * plus de buts que ceux restés tout le match, ou en a vu un autre nombre en étant resté aussi longtemps.
 */
function firstTeamRows<T extends { d: RawStats }>(rows: T[]): T[] {
  let kept = rows;
  if (rows.some((r) => r.d.GamesWon != null || r.d.GamesLost != null)) {
    const weight = new Map<Outcome, number>();
    for (const r of rows) weight.set(outcomeOf(r.d), (weight.get(outcomeOf(r.d)) ?? 0) + Math.max(0, r.d.StartingAppearances ?? 0) + (r.d.Minutes ?? 0) / 10_000);
    const best = [...weight].sort((a, b) => b[1] - a[1])[0]![0];
    kept = rows.filter((r) => outcomeOf(r.d) === best);
  }
  const longest = Math.max(...kept.map((r) => r.d.Minutes ?? 0));
  const seen = kept.filter((r) => (r.d.Minutes ?? 0) >= longest && r.d.TeamGoals != null).map((r) => r.d.TeamGoals!);
  if (seen.length) {
    const count = new Map<number, number>();
    for (const g of seen) count.set(g, (count.get(g) ?? 0) + 1);
    const tg = [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    kept = kept.filter((r) => r.d.TeamGoals == null || (r.d.TeamGoals <= tg && ((r.d.Minutes ?? 0) < longest || r.d.TeamGoals === tg)));
  }
  return kept.length ? kept : rows;
}

/** Prochain match annoncé par un instantané, s'il tombe avant `until`. */
function nextOpponent(snap: FmSnapshot, until: string): { opponent: string | null; competition: string | null; home: boolean | null; played: string | null } {
  const none = { opponent: null, competition: null, home: null, played: null };
  const next = (snap.nextMatch ?? null) as Raw | null;
  const fx = snapshotFixtures(snap).filter((f) => f.date > snap.gameDate || days(snap.gameDate, f.date) === 0);
  const first = fx[0];
  // « Dans 3 jours », « Demain » : texte du jeu, pas un nombre.
  const inDays = typeof next?.inDays === 'number' ? next.inDays : daysUntil(next?.inDays);
  const date = first?.date ?? null;
  if (date ? days(date, until) < 0 : inDays == null || inDays > days(snap.gameDate, until)) return none;
  const location = typeof next?.location === 'string' ? next.location.toLowerCase() : '';
  return {
    opponent: first?.opponent ?? (typeof next?.opponent === 'string' ? next.opponent : null),
    competition: first?.competition ?? (typeof next?.competition === 'string' ? next.competition : null),
    home: first?.home ?? (/dom|home/.test(location) ? true : /ext|away/.test(location) ? false : null),
    played: date ?? (inDays != null ? addDays(snap.gameDate, inDays) : null),
  };
}

type Tactic = { name: string | null; formation?: string | null; formationSource?: unknown };

/**
 * Tactique d'un instantané : son nom, sinon le nom lu à part par chemins.json (`custom.tactique.nomTactique`, lu même
 * quand la lecture complète de la tactique échoue, comme au printemps 2027 dans la partie de Malženice). Null si aucun
 * nom : on prend alors l'instantané d'avant le match.
 */
function matchTactic(snap: FmSnapshot): Tactic | null {
  const t = (snap.tactic ?? null) as Partial<Tactic> | null;
  const custom = ((snap as Raw).custom as { tactique?: { nomTactique?: unknown } } | undefined)?.tactique?.nomTactique;
  const name = typeof t?.name === 'string' && t.name ? t.name : typeof custom === 'string' && custom && !custom.startsWith('FM.UI.') ? custom : null;
  return name ? { ...t, name } : null;
}

/** Le match (ou les matchs) joué(s) entre deux instantanés, ou null s'il n'y en a pas. */
export function resultBetween(prev: FmSnapshot, cur: FmSnapshot): MatchResult | null {
  // Changement de club entre les deux : les cumuls n'ont rien à voir.
  if (prev.club !== cur.club) return null;
  const before = matchStatsFull(prev);
  const after = matchStatsFull(cur);
  const prevPlayers = new Map(prev.players.map((p) => [String(p.id), p]));
  const read = new Set([...before.values()].flatMap((m) => Object.keys(m.raw)));
  // Le plugin ne lisait pas encore les stats de match : rien à comparer.
  if (!read.has('Minutes') || !read.has('StartingAppearances')) return null;
  let rows: { id: string; d: RawStats }[] = [];
  let reset = 0;
  for (const [id, m] of after) {
    const ref = before.get(id);
    if (ref && (m.raw.Minutes ?? 0) < (ref.raw.Minutes ?? 0)) reset++;
    const d = delta(m.raw, ref?.raw, read);
    if (d && (d.Minutes ?? 0) > 0) rows.push({ id, d });
  }
  // Nouvelle saison entre les deux : les cumuls repartent de zéro, la différence ne veut rien dire.
  if (reset > rows.length) return null;
  // Personne n'a joué deux matchs : un seul match de l'équipe première, on écarte la réserve et les U19.
  if (rows.length && Math.max(...rows.map((r) => apps(r.d))) === 1) rows = firstTeamRows(rows);
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
  const { played, ...opp } = matches === 1 ? nextOpponent(prev, cur.gameDate) : { opponent: null, competition: null, home: null, played: null };
  const tactic = matchTactic(cur) ?? matchTactic(prev);
  return {
    date: cur.gameDate,
    since: prev.gameDate,
    played,
    matches,
    ...opp,
    friendly: isFriendly(opp.competition),
    outcome,
    wins: known ? wins : 0,
    draws,
    losses: known ? losses : 0,
    goalsFor: gf,
    goalsAgainst: ga,
    xg: xgs.length ? Math.round(sum(xgs) * 100) / 100 : null,
    tactic: tactic?.name ?? null,
    // Pas la « formation la plus utilisée » du jeu (souvent « Personnalisée ») : elle ne dit rien du match.
    formation: gameFormationOf(tactic),
    players,
  };
}

/** L'instantané porte les cumuls du Centre de données (au moins les minutes d'un joueur). */
export function hasStats(snap: FmSnapshot): boolean {
  for (const m of matchStatsFull(snap).values()) if (m.raw.Minutes != null) return true;
  return false;
}

/** Dernier match joué tel que le jeu l'écrit (`custom.equipe.dernierMatch*`) : repère du match et score domicile-extérieur. */
function lastFixture(snap: FmSnapshot): { key: string; date: string | null; home: number; away: number; opponent: string | null } | null {
  const e = ((snap as Raw).custom as { equipe?: Raw } | undefined)?.equipe;
  const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : null);
  const home = num(e?.dernierMatchScoreDomicile);
  const away = num(e?.dernierMatchScoreExterieur);
  if (!e || home == null || away == null) return null;
  const opponent = typeof e.dernierAdvNom === 'string' && e.dernierAdvNom.trim() && !/^(FM|SI)\./.test(e.dernierAdvNom) ? e.dernierAdvNom.trim() : null;
  return { key: `${String(e.dernierMatchDate ?? '')}|${opponent ?? ''}|${home}-${away}`, date: decodeGameDate(e.dernierMatchDate), home, away, opponent };
}

/**
 * Match retrouvé sans les cumuls des joueurs : quand le plugin n'a pas pu les lire (jeu ralenti, lecture coupée), le
 * « dernier match » du jeu a quand même changé. On en tire le score et l'adversaire ; le onze, les notes et les stats
 * manquent (`players` vide) jusqu'à ce qu'une lecture complète revienne.
 */
function lightResult(prev: FmSnapshot, cur: FmSnapshot): MatchResult | null {
  if (prev.club !== cur.club) return null;
  const before = lastFixture(prev);
  const after = lastFixture(cur);
  if (!before || !after || before.key === after.key) return null;
  const { played, ...opp } = nextOpponent(prev, cur.gameDate);
  // Sans le lieu, impossible de savoir de quel côté du score on est (sauf score nul).
  if (opp.home == null && after.home !== after.away) return null;
  const gf = opp.home === false ? after.away : after.home;
  const ga = opp.home === false ? after.home : after.away;
  const tactic = matchTactic(cur) ?? matchTactic(prev);
  return {
    date: cur.gameDate,
    since: prev.gameDate,
    played: after.date ?? played,
    matches: 1,
    opponent: after.opponent ?? opp.opponent,
    competition: opp.competition,
    home: opp.home,
    friendly: isFriendly(opp.competition),
    outcome: gf > ga ? 'W' : gf < ga ? 'L' : 'D',
    wins: Number(gf > ga),
    draws: Number(gf === ga),
    losses: Number(gf < ga),
    goalsFor: gf,
    goalsAgainst: ga,
    xg: null,
    tactic: tactic?.name ?? null,
    formation: gameFormationOf(tactic),
    players: [],
  };
}

/**
 * Tous les matchs retrouvés dans l'historique (du plus ancien au plus récent).
 * Un instantané sans cumuls (lecture incomplète du plugin) ne casse plus la suite : le match est d'abord repris du
 * « dernier match » du jeu, puis, quand les cumuls reviennent, la différence est faite avec le dernier instantané
 * complet, par-dessus le trou.
 */
export function matchResults(history: { gameDate: string; data: FmSnapshot }[]): MatchResult[] {
  const out: MatchResult[] = [];
  const full = history.map((h) => hasStats(h.data));
  // Le plugin lisait-il déjà les cumuls à cette date ? (avant, un instantané sans cumuls est la règle, pas un trou)
  let reading = false;
  let lastFull = -1;
  const found: (MatchResult | null)[] = history.map(() => null);
  /** Résultats « légers » du trou en cours, remplacés ou gardés quand les cumuls reviennent. */
  let light: number[] = [];
  for (let i = 0; i < history.length; i++) {
    const cur = history[i]!.data;
    if (i === 0) {
      if (full[0]) { reading = true; lastFull = 0; }
      continue;
    }
    const prev = history[i - 1]!.data;
    if (full[i]) {
      const gap = reading && lastFull >= 0 && lastFull < i - 1 && history[lastFull]!.data.club === cur.club;
      if (!gap) found[i] = resultBetween(prev, cur);
      else {
        const r = resultBetween(history[lastFull]!.data, cur);
        const seen = light.filter((k) => found[k]);
        if (r && seen.length === r.matches && r.matches > 1) {
          // Chaque match du trou a déjà son score exact : on les garde, le bilan groupé n'apporterait rien de plus.
        } else if (r) {
          // Un seul match : le détail complet (onze, notes), placé au jour où le match a été vu.
          const first = seen.length === 1 && r.matches === 1 ? found[seen[0]!]! : null;
          for (const k of seen) found[k] = null;
          const at = first ? seen[0]! : i;
          found[at] = first ? { ...r, date: first.date, since: first.since, played: first.played ?? r.played, opponent: r.opponent ?? first.opponent, competition: r.competition ?? first.competition, home: r.home ?? first.home, friendly: r.competition ? r.friendly : first.friendly } : r;
        }
      }
      reading = true;
      lastFull = i;
      light = [];
    } else if (reading && prev.club === cur.club) {
      found[i] = lightResult(prev, cur);
      if (found[i]) light.push(i);
    } else if (prev.club !== cur.club) {
      reading = false;
      lastFull = -1;
      light = [];
    }
  }
  for (let i = 1; i < history.length; i++) {
    const r = found[i];
    if (!r) continue;
    out.push(r.players.length ? lateScorers(r, history[i - 1]!.data, history[i + 1]?.data, !found[i + 1]) : r);
  }
  return out;
}

/**
 * Buteurs d'un match : le jeu met à jour les buts des joueurs (`goals`) un jour après les cumuls du Centre de données
 * qui révèlent le match (vu le 08/11/2026 : le but de Fábry du 29/08 n'apparaît que dans l'instantané du 30/08). Quand
 * il manque des buts et que l'instantané suivant ne contient pas d'autre match, on reprend les buts de celui-ci.
 */
function lateScorers(r: MatchResult, prev: FmSnapshot, next: FmSnapshot | undefined, quiet: boolean): MatchResult {
  const counted = sum(r.players.map((p) => Math.max(0, p.goals ?? 0)));
  if (r.matches !== 1 || r.goalsFor == null || counted >= r.goalsFor || !next || !quiet || next.club !== prev.club) return r;
  const before = new Map(prev.players.map((p) => [String(p.id), p.goals ?? 0]));
  const after = new Map(next.players.map((p) => [String(p.id), p.goals ?? null]));
  const players = r.players.map((p) => {
    const g = after.get(p.id);
    return g == null ? p : { ...p, goals: Math.max(0, g - (before.get(p.id) ?? 0)) };
  });
  const total = sum(players.map((p) => p.goals ?? 0));
  return total > counted && total <= r.goalsFor ? { ...r, players } : r;
}

/** Matchs officiels seulement (sans les amicaux) : bilans, forme, analyses, temps de jeu. */
export const officialResults = (history: { gameDate: string; data: FmSnapshot }[]): MatchResult[] => matchResults(history).filter((r) => !r.friendly);

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
  // Les amicaux restent dans la liste des résultats, mais ne comptent ni dans le bilan ni dans les analyses.
  const listed = matchResults(history);
  const all = listed.filter((r) => !r.friendly);
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
    results: [...listed].reverse(),
    form: singles.slice(-5).map((r) => r.outcome!),
    record: rec,
    byTactic,
    players,
    insights,
  };
}

/**
 * Matchs vus seulement par les apparitions, quand le plugin ne lisait pas encore les stats du Centre de données
 * (premiers jours d'une partie : chez Vänersborgs, rien avant le 03/10/2026). Le nombre de matchs de chaque joueur
 * (`apps`) et ses buts bougent quand même : au moins 11 joueurs qui gagnent un match = un match de l'équipe. On ne
 * sait ni le résultat ni les buts encaissés ; les buts marqués oublient les buts contre son camp de l'adversaire.
 * Null si les stats complètes sont lues (`resultBetween` s'en charge) ou s'il n'y a pas eu de match.
 */
export function appearanceMatches(prev: FmSnapshot, cur: FmSnapshot): { matches: number; goalsFor: number; scorers: Map<string, { name: string; goals: number }> } | null {
  if (prev.club !== cur.club) return null;
  const read = new Set([...matchStatsFull(prev).values()].flatMap((m) => Object.keys(m.raw)));
  if (read.has('Minutes') && read.has('StartingAppearances')) return null;
  const before = new Map(prev.players.map((p) => [String(p.id), p]));
  const moved: number[] = [];
  let goals = 0;
  let reset = 0;
  const scorers = new Map<string, { name: string; goals: number }>();
  for (const p of cur.players) {
    const o = before.get(String(p.id));
    if (!o || typeof p.apps !== 'number' || typeof o.apps !== 'number') continue;
    const d = p.apps - o.apps;
    if (d < 0) reset++;
    if (d > 0) {
      moved.push(d);
      if (typeof p.goals === 'number' && typeof o.goals === 'number' && p.goals > o.goals) {
        goals += p.goals - o.goals;
        scorers.set(String(p.id), { name: p.name, goals: p.goals - o.goals });
      }
    }
  }
  // Nouvelle saison : les compteurs repartent de zéro.
  if (reset > moved.length) return null;
  if (moved.length < 11) return null;
  // Plusieurs matchs entre deux relevés : autant que la plupart des titulaires en ont joué (un joueur qui joue aussi
  // avec la réserve ne compte pas pour un match de plus).
  let matches = 1;
  while (moved.filter((d) => d >= matches + 1).length >= 7) matches++;
  return { matches, goalsFor: goals, scorers };
}
