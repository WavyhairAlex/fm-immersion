import { normalizePlayer } from './player';
import { hasStats, officialResults, type MatchResult } from './results';
import { matchStatsFull } from './stats';
import { seasonArchives } from './season';
import type { FmSnapshot } from './snapshot';

type Entry = { gameDate: string; data: FmSnapshot };

/** Une saison d'un joueur chez nous (fiche joueur, onglet Carrière). */
export interface PlayerSeason {
  label: string;
  club: string;
  /** Saison en cours (pas encore figée). */
  current: boolean;
  apps: number | null;
  starts: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  rating: number | null;
  /** Homme du match. */
  potm: number | null;
}

const round = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x));

function seasonOf(e: Entry, id: string, label: string, current: boolean): PlayerSeason | null {
  const raw = e.data.players.find((p) => String(p.id) === id);
  const m = matchStatsFull(e.data).get(id);
  if (!raw && !m) return null;
  const p = raw ? normalizePlayer(raw) : null;
  const r = m?.raw ?? {};
  const min = r.Minutes ?? null;
  const per90 = (k: string) => (min && r[k] != null ? (r[k]! * min) / 90 : null);
  const starts = r.StartingAppearances ?? null;
  const apps = starts != null || r.SubAppearances != null ? (starts ?? 0) + (r.SubAppearances ?? 0) : (p?.apps ?? null);
  if (!apps && !min) return null;
  return {
    label,
    club: e.data.club,
    current,
    apps,
    starts,
    minutes: min,
    goals: p?.goals ?? round(per90('GoalsPer90')),
    assists: round(per90('AssistsPer90')),
    xg: r.ExpectedGoals ?? null,
    rating: p?.avgRating ?? null,
    potm: r.ManOfMatch ?? null,
  };
}

/**
 * Saisons d'un joueur depuis que FM Immersion suit la partie, la plus récente d'abord : chaque saison finie telle
 * qu'à sa dernière lecture (`seasonArchives`), puis la saison en cours (dernière lecture complète).
 */
export function playerSeasons(history: Entry[], id: string): PlayerSeason[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const out: PlayerSeason[] = [];
  const last = [...sorted].reverse().find((e) => hasStats(e.data));
  const archives = seasonArchives(sorted);
  // La saison en cours : seulement si la dernière lecture n'est pas déjà celle d'une saison archivée.
  if (last && !archives.some((a) => a.gameDate === last.gameDate)) {
    const s = seasonOf(last, id, '', true);
    if (s) out.push(s);
  }
  for (const a of archives) {
    const s = seasonOf({ gameDate: a.gameDate, data: a.data }, id, a.label, false);
    if (s) out.push(s);
  }
  return out;
}

/** Un match du joueur (fiche joueur, onglet Matchs). */
export interface PlayerMatch {
  date: string;
  opponent: string | null;
  competition: string | null;
  home: boolean | null;
  outcome: MatchResult['outcome'];
  goalsFor: number | null;
  goalsAgainst: number | null;
  started: boolean;
  minutes: number;
  rating: number | null;
  goals: number | null;
  potm: boolean;
}

/** Derniers matchs officiels joués par le joueur (détail exact seulement : un match entre deux lectures), le plus récent d'abord. */
export function playerMatches(history: Entry[], id: string, limit = 10): PlayerMatch[] {
  const out: PlayerMatch[] = [];
  for (const r of officialResults(history).filter((x) => x.matches === 1 && !x.friendly).reverse()) {
    const p = r.players.find((x) => x.id === id);
    if (!p || p.minutes <= 0) continue;
    out.push({
      date: r.played ?? r.date,
      opponent: r.opponent,
      competition: r.competition,
      home: r.home,
      outcome: r.outcome,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      started: p.started,
      minutes: p.minutes,
      rating: p.rating,
      goals: p.goals,
      potm: !!p.potm,
    });
    if (out.length >= limit) break;
  }
  return out;
}
