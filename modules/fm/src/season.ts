import { cupPending, cupRuns, type CupRun } from './cups';
import { leaguePosition } from './gazette';
import { normalizePlayer } from './player';
import { lineOf, type PosCode } from './positions';
import { officialResults, type MatchResult } from './results';
import { competitionKind } from './rules';
import type { FmSnapshot } from './snapshot';
import { assignMax, FORMATIONS } from './tactic';

/**
 * Bilan de la saison : numéro spécial de la gazette, écrit quand le dernier match de championnat est joué.
 * La fin de saison vient du calendrier lu par le plugin (`custom.equipe.calendrierChampionnatRestant`, matchs de
 * championnat restants) : la liste passe de « au moins un match » à vide. Le reste vient des instantanés de la saison.
 */

type Entry = { gameDate: string; data: FmSnapshot };

export interface SeasonPlayer {
  id: string;
  name: string;
  value: number;
}

export interface SeasonMatch {
  date: string;
  opponent: string | null;
  goalsFor: number;
  goalsAgainst: number;
}

/** Joueur de l'équipe type, à son poste sur le terrain (coordonnées en % : x de gauche à droite, y du but adverse). */
export interface TeamSlot {
  pos: PosCode;
  x: number;
  y: number;
  player: { id: string; name: string; rating: number; apps: number; goals: number } | null;
}

/**
 * Moment fort de la saison, du plus marquant au plus banal : un triplé (ou plus), une large victoire (3 buts d'écart
 * ou plus), une longue série sans défaite (8 matchs ou plus), sinon la plus large victoire.
 */
export type SeasonMoment =
  | { kind: 'hatTrick'; id: string; name: string; goals: number; match: SeasonMatch }
  | { kind: 'bigWin'; match: SeasonMatch }
  | { kind: 'unbeaten'; count: number }
  | { kind: 'cupWin'; competition: string };

export interface SeasonReview {
  club: string;
  /** Premier et dernier instantané de la saison suivie (ISO). */
  start: string;
  end: string;
  /** « 2026/27 » d'après les dates de la saison. */
  label: string;
  /** Place finale au championnat, et son évolution (une valeur par changement). */
  position: number | null;
  positions: { date: string; position: number }[];
  played: number;
  /**
   * Bilan du seul championnat (sans les coupes), comme le classement du jeu : c'est lui qu'affichent les cases
   * « V-N-D » et « buts » de la gazette. Les matchs de compétition inconnue y sont comptés.
   */
  league: { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number };
  /** Matchs joués sans détail connu (plusieurs matchs entre deux instantanés), hors bilan chiffré. */
  untracked: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Bilans à domicile et à l'extérieur (matchs seuls, lieu connu). */
  home: { wins: number; draws: number; losses: number };
  away: { wins: number; draws: number; losses: number };
  /** Matchs sans but encaissé. */
  cleanSheets: number;
  /** Buts attendus de l'équipe sur la saison (somme des xG des joueurs), null si le plugin ne les lit pas. */
  xg: number | null;
  yellow: number;
  red: number;
  biggestWin: SeasonMatch | null;
  worstLoss: SeasonMatch | null;
  /** Plus longue série sans défaite. */
  unbeaten: number;
  topScorer: SeasonPlayer | null;
  /** Le plus souvent élu homme du match par le jeu. */
  potm: SeasonPlayer | null;
  /** Meilleure note moyenne sur les matchs suivis (au moins un tiers des matchs du plus utilisé). */
  bestRated: SeasonPlayer | null;
  /** Le plus de minutes jouées. */
  mostUsed: SeasonPlayer | null;
  /** Arrivées et départs de la saison, les plus forts d'abord (5 au plus). */
  arrivals: string[];
  departures: string[];
  /** Trois meilleurs buteurs (buts des matchs suivis). */
  topScorers: SeasonPlayer[];
  /** Équipe type : schéma le plus joué, meilleures notes moyennes à chaque poste (au moins 3 matchs notés). */
  team: { formation: string; slots: TeamSlot[] } | null;
  moment: SeasonMoment | null;
  /** Saison pas encore finie (aperçu de la carte en cours de route). */
  ongoing: boolean;
  /** Parcours en coupes nationales et européennes (éliminé, qualifié, vainqueur). */
  cups: CupRun[];
}

const equipe = (s: FmSnapshot): Record<string, unknown> => (s as { custom?: { equipe?: Record<string, unknown> } }).custom?.equipe ?? {};

/** Matchs de championnat restants d'après le plugin, ou null s'il ne lit pas le calendrier. */
export function leagueFixturesLeft(s: FmSnapshot): number | null {
  const left = equipe(s).calendrierChampionnatRestant;
  return Array.isArray(left) ? left.length : null;
}

/** Le dernier match de championnat vient d'être joué entre ces deux instantanés du même club. */
export function seasonEndedBetween(prev: FmSnapshot, cur: FmSnapshot) {
  const before = leagueFixturesLeft(prev);
  return prev.club === cur.club && before != null && before > 0 && leagueFixturesLeft(cur) === 0;
}

const seasonLabel = (start: string, end: string) => {
  const y1 = Number(end.slice(0, 4));
  const y0 = Number(start.slice(0, 4));
  return y0 < y1 ? `${y1 - 1}/${String(y1).slice(2)}` : end.slice(0, 4);
};

function exact(r: MatchResult): SeasonMatch | null {
  return r.matches === 1 && r.goalsFor != null && r.goalsAgainst != null
    ? { date: r.date, opponent: r.opponent, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst }
    : null;
}

/** Bilan d'une suite d'instantanés quelconque (une saison, ou tout un passage au club pour le hors-série du départ). */
export const reviewOf = (entries: Entry[], ongoing = false) => review(entries, ongoing);

function review(season: Entry[], ongoing = false): SeasonReview {
  const first = season[0]!;
  const last = season[season.length - 1]!;
  const all = officialResults(season);
  // Plusieurs matchs entre deux instantanés sans victoires ni défaites connues : on ne sait pas les compter.
  const results = all.filter((r) => r.outcome || r.wins || r.losses);
  // Avant le premier match suivi en détail : cumuls d'avant l'arrivée du coach (ou du suivi), pas sa saison.
  const firstKnown = all.findIndex((r) => results.includes(r));
  const sum = (f: (r: MatchResult) => number) => results.reduce((a, r) => a + f(r), 0);

  const positions: { date: string; position: number }[] = [];
  for (const e of season) {
    const p = leaguePosition(e.data);
    if (p != null && positions.at(-1)?.position !== p) positions.push({ date: e.gameDate, position: p });
  }

  const singles = results.map(exact).filter((m): m is SeasonMatch => !!m);
  const margin = (m: SeasonMatch) => m.goalsFor - m.goalsAgainst;
  const wins = singles.filter((m) => margin(m) > 0).sort((a, b) => margin(b) - margin(a) || b.goalsFor - a.goalsFor);
  const losses = singles.filter((m) => margin(m) < 0).sort((a, b) => margin(a) - margin(b) || b.goalsAgainst - a.goalsAgainst);

  let unbeaten = 0;
  let run = 0;
  for (const r of results) {
    run = r.losses ? 0 : run + r.matches;
    unbeaten = Math.max(unbeaten, run);
  }

  // Buts et notes des matchs suivis seulement (les cumuls du jeu comptent aussi ceux d'avant l'arrivée du coach).
  const squad = last.data.players.map(normalizePlayer);
  const perPlayer = new Map<string, { id: string; name: string; goals: number; minutes: number; ratings: number[]; lines: Map<string, number> }>();
  let hatTrick: Extract<SeasonMoment, { kind: 'hatTrick' }> | null = null;
  let yellow = 0;
  let red = 0;
  for (const r of results)
    for (const p of r.players) {
      const x = perPlayer.get(p.id) ?? { id: p.id, name: p.name, goals: 0, minutes: 0, ratings: [], lines: new Map<string, number>() };
      x.goals += p.goals ?? 0;
      if (p.line && p.minutes > 0) x.lines.set(p.line, (x.lines.get(p.line) ?? 0) + p.minutes);
      const m = exact(r);
      if (m && (p.goals ?? 0) >= 3 && (p.goals ?? 0) > (hatTrick?.goals ?? 0)) hatTrick = { kind: 'hatTrick', id: p.id, name: p.name, goals: p.goals!, match: m };
      x.minutes += p.minutes;
      yellow += Math.max(0, p.stats.yellow ?? 0);
      red += Math.max(0, p.stats.red ?? 0);
      if (p.rating != null && r.matches === 1) x.ratings.push(p.rating);
      perPlayer.set(p.id, x);
    }
  const stats = [...perPlayer.values()];
  const scorer = stats.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals)[0];
  const maxApps = Math.max(0, ...stats.map((p) => p.ratings.length));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const rated = stats.filter((p) => p.ratings.length >= Math.max(3, maxApps / 3)).sort((a, b) => avg(b.ratings) - avg(a.ratings))[0];
  const used = [...stats].sort((a, b) => b.minutes - a.minutes)[0];
  const venue = (home: boolean) => {
    const ms = results.filter((r) => r.matches === 1 && r.home === home && r.outcome);
    return {
      wins: ms.filter((r) => r.outcome === 'W').length,
      draws: ms.filter((r) => r.outcome === 'D').length,
      losses: ms.filter((r) => r.outcome === 'L').length,
    };
  };
  const xgs = results.map((r) => r.xg).filter((x): x is number => x != null);
  const potmCount = new Map<string, SeasonPlayer>();
  for (const r of results) for (const p of r.players) if (p.potm) potmCount.set(p.id, { id: p.id, name: p.name, value: (potmCount.get(p.id)?.value ?? 0) + 1 });
  const potm = [...potmCount.values()].sort((a, b) => b.value - a.value)[0] ?? null;

  const topScorers = stats
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.minutes - b.minutes)
    .slice(0, 3)
    .map((p) => ({ id: p.id, name: p.name, value: p.goals }));

  // Postes connus de chaque joueur : dernier instantané de la saison où il apparaît (les partis aussi).
  const posOf = new Map<string, PosCode[]>();
  for (const e of season) for (const raw of e.data.players) posOf.set(String(raw.id), normalizePlayer(raw).positions);
  const team = teamOfSeason(results, stats, posOf, avg);

  const big = wins[0] && margin(wins[0]) >= 3 ? wins[0] : null;
  const ht = hatTrick as Extract<SeasonMoment, { kind: 'hatTrick' }> | null;
  const cups = cupRuns(results, last.data, { seasonOver: !ongoing, seasonEnd: last.gameDate });
  const cupWon = cups.find((c) => c.status === 'won');
  const moment: SeasonMoment | null = cupWon
    ? { kind: 'cupWin', competition: cupWon.competition }
    : ht
    ? ht
    : big
      ? { kind: 'bigWin', match: big }
      : unbeaten >= 8
        ? { kind: 'unbeaten', count: unbeaten }
        : wins[0]
          ? { kind: 'bigWin', match: wins[0] }
          : null;

  const before = new Map(first.data.players.map((p) => [String(p.id), normalizePlayer(p)]));
  const after = new Map(squad.map((p) => [p.id, p]));
  const strongest = (xs: { name: string; level: number | null }[]) =>
    xs
      .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
      .slice(0, 5)
      .map((p) => p.name);

  return {
    club: last.data.club,
    start: first.gameDate,
    end: last.gameDate,
    label: seasonLabel(first.gameDate, last.gameDate),
    position: leaguePosition(last.data) ?? positions.at(-1)?.position ?? null,
    positions,
    played: sum((r) => r.matches),
    league: (() => {
      const ls = results.filter((r) => !['cup', 'europe', 'friendly'].includes(competitionKind(r.competition)));
      const add = (f: (r: MatchResult) => number) => ls.reduce((a, r) => a + f(r), 0);
      return { played: add((r) => r.matches), wins: add((r) => r.wins), draws: add((r) => r.draws), losses: add((r) => r.losses), goalsFor: add((r) => r.goalsFor ?? 0), goalsAgainst: add((r) => r.goalsAgainst ?? 0) };
    })(),
    untracked: firstKnown < 0 ? 0 : all.filter((r, i) => i > firstKnown && !results.includes(r)).reduce((a, r) => a + r.matches, 0),
    wins: sum((r) => r.wins),
    draws: sum((r) => r.draws),
    losses: sum((r) => r.losses),
    goalsFor: sum((r) => r.goalsFor ?? 0),
    goalsAgainst: sum((r) => r.goalsAgainst ?? 0),
    points: sum((r) => 3 * r.wins + r.draws),
    home: venue(true),
    away: venue(false),
    cleanSheets: singles.filter((m) => m.goalsAgainst === 0).length,
    xg: xgs.length ? Math.round(xgs.reduce((a, b) => a + b, 0) * 10) / 10 : null,
    yellow,
    red,
    biggestWin: wins[0] ?? null,
    worstLoss: losses[0] ?? null,
    unbeaten,
    topScorer: scorer ? { id: scorer.id, name: scorer.name, value: scorer.goals } : null,
    potm,
    bestRated: rated ? { id: rated.id, name: rated.name, value: Math.round(avg(rated.ratings) * 100) / 100 } : null,
    mostUsed: used && used.minutes > 0 ? { id: used.id, name: used.name, value: used.minutes } : null,
    arrivals: strongest(squad.filter((p) => !before.has(p.id))),
    departures: strongest([...before.values()].filter((p) => !after.has(p.id))),
    topScorers,
    team,
    moment,
    ongoing,
    cups,
  };
}

/**
 * Équipe type de la saison : sur le schéma le plus joué (4-3-3 s'il est inconnu), chaque poste reçoit le joueur à la
 * meilleure note moyenne, de préférence à son poste naturel, sinon sur sa ligne (attribution d'ensemble, pas poste
 * par poste). Seuls comptent les joueurs notés sur au moins 3 matchs (ou un quart des matchs du plus utilisé).
 */
function teamOfSeason(
  results: MatchResult[],
  stats: { id: string; name: string; goals: number; minutes: number; ratings: number[]; lines: Map<string, number> }[],
  posOf: Map<string, PosCode[]>,
  avg: (xs: number[]) => number,
): SeasonReview['team'] {
  const maxApps = Math.max(0, ...stats.map((p) => p.ratings.length));
  const pool = stats.filter((p) => p.ratings.length >= Math.max(3, Math.ceil(maxApps / 4)));
  if (pool.length < 5) return null;
  const counts = new Map<string, number>();
  for (const r of results) if (r.formation && FORMATIONS[r.formation]) counts.set(r.formation, (counts.get(r.formation) ?? 0) + r.matches);
  const formation = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '4-3-3';
  const slots = FORMATIONS[formation]!;
  const mainLine = (p: (typeof pool)[number]) => [...p.lines].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const value = slots.map(([pos]) =>
    pool.map((p) => {
      const natural = posOf.get(p.id)?.includes(pos);
      const line = natural || mainLine(p) === lineOf(pos) || (posOf.get(p.id) ?? []).some((q) => lineOf(q) === lineOf(pos));
      if (!line) return null;
      // Le gardien ne joue que dans le but, et personne d'autre n'y va.
      if ((pos === 'GB') !== (mainLine(p) === 'GB' || !!posOf.get(p.id)?.includes('GB'))) return null;
      return avg(p.ratings) + (natural ? 0.6 : 0) + Math.min(p.ratings.length, 38) / 100;
    }),
  );
  const pick = assignMax(value);
  return {
    formation,
    slots: slots.map(([pos, x, y], i) => {
      const p = pool[pick[i]!];
      return {
        pos,
        x,
        y,
        player: p ? { id: p.id, name: p.name, rating: Math.round(avg(p.ratings) * 100) / 100, apps: p.ratings.length, goals: p.goals } : null,
      };
    }),
  };
}

/**
 * Bilans de toutes les saisons terminées de l'historique, de la plus récente à la plus ancienne. Une saison commence
 * au premier instantané du club (après la fin de la précédente ou un changement de club) et finit à l'instantané où
 * il ne reste plus de match de championnat.
 */
export function seasonReviews(history: Entry[]): SeasonReview[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  return seasonSegments(sorted)
    .filter((x) => x.ended)
    .map((x) => review(x.entries))
    .reverse();
}

/** Minutes de la saison cumulées par tout l'effectif (stats du jeu) ; elles repartent de zéro à la nouvelle saison. */
function seasonMinutes(s: FmSnapshot): number | null {
  const joueurs = (s as { custom?: { joueurs?: Record<string, { stat_Minutes?: unknown }> } }).custom?.joueurs;
  if (!joueurs) return null;
  let n = 0;
  for (const j of Object.values(joueurs)) n += typeof j?.stat_Minutes === 'number' ? j.stat_Minutes : 0;
  return n;
}

/** Les cumuls de saison du jeu ont été remis à zéro entre ces deux instantanés : une nouvelle saison a commencé. */
export function statsResetBetween(prev: FmSnapshot, cur: FmSnapshot) {
  const a = seasonMinutes(prev);
  const b = seasonMinutes(cur);
  return a != null && b != null && a > 0 && b < a * 0.5;
}

/**
 * Découpe l'historique (trié) en saisons : changement de club, ou fin du championnat (incluse dans sa saison). Si une
 * coupe reste à jouer à la fin du championnat (finale, barrage, coupe d'Europe), la saison continue jusqu'au relevé
 * où plus aucun match de coupe n'est au calendrier (au plus tard la remise à zéro des stats de la saison suivante).
 */
export function seasonSegments(sorted: Entry[]): { entries: Entry[]; ended: boolean }[] {
  const out: { entries: Entry[]; ended: boolean }[] = [];
  let start = 0;
  let leagueOver = false;
  const close = (end: number, ended: boolean) => {
    out.push({ entries: sorted.slice(start, end), ended });
    start = end;
    leagueOver = false;
  };
  for (let i = 1; i <= sorted.length; i++) {
    const prev = sorted[i - 1]!.data;
    const cur = sorted[i]?.data;
    if (!cur) {
      // Fin de l'historique : championnat fini et plus de coupe en vue = saison finie.
      out.push({ entries: sorted.slice(start), ended: leagueOver && !cupPending(prev) });
      break;
    }
    if (prev.club !== cur.club) close(i, leagueOver);
    // Coupe attendue après le championnat mais nouvelle saison commencée (calendrier mal lu) : on clôt quand même.
    else if (leagueOver && statsResetBetween(prev, cur)) close(i, true);
    else if (seasonEndedBetween(prev, cur)) {
      leagueOver = true;
      if (!cupPending(cur)) close(i + 1, true);
    } else if (leagueOver && !cupPending(cur)) close(i + 1, true);
  }
  return out.filter((x) => x.entries.length);
}

/**
 * Saison en cours à une date, pour l'encadré « Les chiffres » de la gazette de la semaine : bilan du club depuis le
 * début de la saison (ou son arrivée). Pendant l'intersaison, tant qu'aucun match de la saison suivante n'est joué,
 * c'est le bilan de la saison finie. Null sans instantané.
 */
export function seasonSoFar(history: Entry[], date: string): SeasonReview | null {
  const segs = seasonSegments([...history].filter((e) => e.gameDate <= date).sort((a, b) => a.gameDate.localeCompare(b.gameDate)));
  const last = segs.at(-1);
  if (!last) return null;
  const r = review(last.entries, !last.ended);
  const prev = segs.at(-2);
  if (!r.played && prev?.ended && prev.entries[0]!.data.club === r.club) return review(prev.entries);
  return r;
}
