import { leaguePosition } from './gazette';
import { normalizePlayer } from './player';
import { matchResults, type MatchResult } from './results';
import type { FmSnapshot } from './snapshot';

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
  /** Matchs joués sans détail connu (plusieurs matchs entre deux instantanés), hors bilan chiffré. */
  untracked: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  biggestWin: SeasonMatch | null;
  worstLoss: SeasonMatch | null;
  /** Plus longue série sans défaite. */
  unbeaten: number;
  topScorer: SeasonPlayer | null;
  /** Le plus souvent élu homme du match par le jeu. */
  potm: SeasonPlayer | null;
  /** Meilleure note moyenne (au moins un tiers des matchs joués). */
  bestRated: SeasonPlayer | null;
  /** Arrivées et départs de la saison, les plus forts d'abord (5 au plus). */
  arrivals: string[];
  departures: string[];
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

function review(season: Entry[]): SeasonReview {
  const first = season[0]!;
  const last = season[season.length - 1]!;
  const all = matchResults(season);
  // Plusieurs matchs entre deux instantanés sans victoires ni défaites connues : on ne sait pas les compter.
  const results = all.filter((r) => r.outcome || r.wins || r.losses);
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

  // Cumuls de la saison chez les joueurs du dernier instantané (ceux qui sont partis ne comptent plus).
  const squad = last.data.players.map(normalizePlayer);
  const scorer = [...squad].filter((p) => (p.goals ?? 0) > 0).sort((a, b) => b.goals! - a.goals!)[0];
  const maxApps = Math.max(0, ...squad.map((p) => p.apps ?? 0));
  const rated = squad.filter((p) => p.avgRating != null && (p.apps ?? 0) >= Math.max(3, maxApps / 3)).sort((a, b) => b.avgRating! - a.avgRating!)[0];
  const potmCount = new Map<string, SeasonPlayer>();
  for (const r of results) for (const p of r.players) if (p.potm) potmCount.set(p.id, { id: p.id, name: p.name, value: (potmCount.get(p.id)?.value ?? 0) + 1 });
  const potm = [...potmCount.values()].sort((a, b) => b.value - a.value)[0] ?? null;

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
    untracked: all.filter((r) => !results.includes(r)).reduce((a, r) => a + r.matches, 0),
    wins: sum((r) => r.wins),
    draws: sum((r) => r.draws),
    losses: sum((r) => r.losses),
    goalsFor: sum((r) => r.goalsFor ?? 0),
    goalsAgainst: sum((r) => r.goalsAgainst ?? 0),
    biggestWin: wins[0] ?? null,
    worstLoss: losses[0] ?? null,
    unbeaten,
    topScorer: scorer ? { id: scorer.id, name: scorer.name, value: scorer.goals! } : null,
    potm,
    bestRated: rated ? { id: rated.id, name: rated.name, value: Math.round(rated.avgRating! * 100) / 100 } : null,
    arrivals: strongest(squad.filter((p) => !before.has(p.id))),
    departures: strongest([...before.values()].filter((p) => !after.has(p.id))),
  };
}

/**
 * Bilans de toutes les saisons terminées de l'historique, de la plus récente à la plus ancienne. Une saison commence
 * au premier instantané du club (après la fin de la précédente ou un changement de club) et finit à l'instantané où
 * il ne reste plus de match de championnat.
 */
export function seasonReviews(history: Entry[]): SeasonReview[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const out: SeasonReview[] = [];
  let start = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.data;
    const cur = sorted[i]!.data;
    if (prev.club !== cur.club) start = i;
    else if (seasonEndedBetween(prev, cur)) {
      out.push(review(sorted.slice(start, i + 1)));
      start = i + 1;
    }
  }
  return out.reverse();
}
