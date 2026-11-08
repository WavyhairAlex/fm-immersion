import { officialResults, type MatchResult } from './results';
import type { FmSnapshot } from './snapshot';

/**
 * Édition record : un exploit qui mérite sa une, le jour où il tombe. Triplé (ou mieux) d'un joueur, série de
 * victoires qui atteint 5, 7 ou 10 matchs, plus large victoire de la saison (trois buts d'écart au moins), fin d'une
 * mauvaise passe (victoire après quatre matchs ou plus sans gagner).
 */
export type RecordNews =
  | { kind: 'hatTrick'; date: string; club: string; id: string; name: string; goals: number; match: RecordMatch }
  | { kind: 'streak'; date: string; club: string; count: number; match: RecordMatch }
  | { kind: 'bigWin'; date: string; club: string; match: RecordMatch }
  | { kind: 'runEnded'; date: string; club: string; count: number; match: RecordMatch };

/** Le match de l'exploit, vu du club : adversaire, score, compétition, lieu. */
export interface RecordMatch {
  opponent: string | null;
  goalsFor: number;
  goalsAgainst: number;
  competition: string | null;
  home: boolean | null;
}

/** Paliers de la série de victoires annoncés. */
const STREAK_STEPS = [5, 7, 10, 15, 20];
const BIG_WIN_MARGIN = 3;
const BAD_RUN = 4;
/** Une saison dure au plus ~11 mois : la plus large victoire se compare aux matchs des 300 jours d'avant. */
const SEASON_DAYS = 300;
const DAY_MS = 86_400_000;

const exact = (r: MatchResult): RecordMatch | null =>
  r.matches === 1 && r.goalsFor != null && r.goalsAgainst != null
    ? { opponent: r.opponent, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, competition: r.competition, home: r.home }
    : null;

/** Exploits de l'historique (matchs officiels, détail exact), du plus récent au plus ancien. */
export function recordNews(history: { gameDate: string; data: FmSnapshot }[]): RecordNews[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const clubAt = new Map(sorted.map((h) => [h.gameDate, h.data.club]));
  const results = officialResults(sorted);
  // Un groupe par match : du plus récent au plus ancien, mais dans l'ordre du match (triplé avant le reste).
  const out: RecordNews[][] = [];
  let wins = 0;
  let winless = 0;
  let club: string | null = null;
  const seen: { date: string; margin: number; club: string }[] = [];
  for (const r of results) {
    const c = clubAt.get(r.date) ?? sorted.find((h) => h.gameDate >= r.date)?.data.club ?? '';
    // Nouveau club du coach : on repart de zéro.
    if (c !== club) {
      club = c;
      wins = 0;
      winless = 0;
    }
    const m = exact(r);
    const won = r.wins > 0 && !r.draws && !r.losses;
    if (!m) {
      // Plusieurs matchs entre deux relevés : on ne sait pas l'ordre, les séries repartent prudemment.
      wins = r.losses || r.draws ? 0 : wins + r.wins;
      winless = r.wins ? 0 : winless + r.matches;
      continue;
    }
    const day: RecordNews[] = [];
    for (const p of r.players) if ((p.goals ?? 0) >= 3) day.push({ kind: 'hatTrick', date: r.date, club: c, id: p.id, name: p.name, goals: p.goals!, match: m });
    if (won) {
      wins++;
      if (STREAK_STEPS.includes(wins)) day.push({ kind: 'streak', date: r.date, club: c, count: wins, match: m });
      if (winless >= BAD_RUN) day.push({ kind: 'runEnded', date: r.date, club: c, count: winless, match: m });
      winless = 0;
      const margin = m.goalsFor - m.goalsAgainst;
      const from = Date.parse(r.date) - SEASON_DAYS * DAY_MS;
      const best = Math.max(0, ...seen.filter((x) => x.club === c && Date.parse(x.date) >= from).map((x) => x.margin));
      if (margin >= BIG_WIN_MARGIN && margin > best) day.push({ kind: 'bigWin', date: r.date, club: c, match: m });
      seen.push({ date: r.date, margin, club: c });
    } else {
      wins = 0;
      winless++;
    }
    if (day.length) out.push(day);
  }
  return out.reverse().flat();
}

/** Clé d'un exploit, pour ne l'envoyer qu'une fois. */
export const recordKey = (n: RecordNews) => `${n.kind}|${n.date.slice(0, 10)}|${n.kind === 'hatTrick' ? n.id : ''}`;
