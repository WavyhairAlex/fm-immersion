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
  const perPlayer = new Map<string, { id: string; name: string; goals: number; minutes: number; ratings: number[] }>();
  let yellow = 0;
  let red = 0;
  for (const r of results)
    for (const p of r.players) {
      const x = perPlayer.get(p.id) ?? { id: p.id, name: p.name, goals: 0, minutes: 0, ratings: [] };
      x.goals += p.goals ?? 0;
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
  };
}

/**
 * Bilans de toutes les saisons terminées de l'historique, de la plus récente à la plus ancienne. Une saison commence
 * au premier instantané du club (après la fin de la précédente ou un changement de club) et finit à l'instantané où
 * il ne reste plus de match de championnat.
 */
export function seasonReviews(history: Entry[]): SeasonReview[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  return segments(sorted)
    .filter((x) => x.ended)
    .map((x) => review(x.entries))
    .reverse();
}

/** Découpe l'historique (trié) en saisons : changement de club, ou fin du championnat (incluse dans sa saison). */
function segments(sorted: Entry[]): { entries: Entry[]; ended: boolean }[] {
  const out: { entries: Entry[]; ended: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= sorted.length; i++) {
    const prev = sorted[i - 1]!.data;
    const cur = sorted[i]?.data;
    if (!cur || prev.club !== cur.club) {
      out.push({ entries: sorted.slice(start, i), ended: false });
      start = i;
    } else if (seasonEndedBetween(prev, cur)) {
      out.push({ entries: sorted.slice(start, i + 1), ended: true });
      start = i + 1;
    }
  }
  return out.filter((x) => x.entries.length);
}

/**
 * Saison en cours à une date, pour l'encadré « Les chiffres » de la gazette de la semaine : bilan du club depuis le
 * début de la saison (ou son arrivée). Pendant l'intersaison, tant qu'aucun match de la saison suivante n'est joué,
 * c'est le bilan de la saison finie. Null sans instantané.
 */
export function seasonSoFar(history: Entry[], date: string): SeasonReview | null {
  const segs = segments([...history].filter((e) => e.gameDate <= date).sort((a, b) => a.gameDate.localeCompare(b.gameDate)));
  const last = segs.at(-1);
  if (!last) return null;
  const r = review(last.entries);
  const prev = segs.at(-2);
  if (!r.played && prev?.ended && prev.entries[0]!.data.club === r.club) return review(prev.entries);
  return r;
}
