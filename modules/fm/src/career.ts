import { countryOfLeague, countryOfNationality } from './countries';
import { coachSpells, type ExitReason } from './farewell';
import { officialResults } from './results';
import { reviewOf, seasonSegments, type SeasonMatch, type SeasonReview } from './season';
import type { FmSnapshot } from './snapshot';

/**
 * « Ma carrière » : le parcours du coach dans la partie, club par club, à partir des instantanés déjà importés.
 * Mêmes calculs que le hors-série de départ (`farewell.ts`) et les bilans de saison (`season.ts`) : un passage par
 * club, découpé en saisons, avec ses titres. Rien n'est lu en plus dans le jeu.
 */

type Entry = { gameDate: string; data: FmSnapshot };

export interface CareerSeason {
  label: string;
  position: number | null;
  ended: boolean;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Coupes gagnées cette saison. */
  cupsWon: string[];
  /** Plus longue série sans défaite de la saison. */
  unbeaten: number;
}

export interface CareerSpell {
  club: string;
  start: string;
  end: string;
  /** Club entraîné aujourd'hui (pas de départ). */
  current: boolean;
  /** Raison du départ devinée (le joueur peut la corriger dans la gazette), null pour le club actuel. */
  reason: ExitReason | null;
  /** Pays deviné (code de `countries.ts`) et d'où il vient, null si rien ne permet de le dire. */
  country: string | null;
  countrySource: 'squad' | 'league' | null;
  seasons: CareerSeason[];
  total: SeasonReview;
  /** Titres : championnats finis en tête (competition null), coupes gagnées. */
  trophies: { season: string; competition: string | null }[];
  bestFinish: number | null;
}

export interface CareerTotals {
  clubs: number;
  countries: number;
  /** Saisons finies, et saison en cours en plus. */
  seasons: number;
  ongoingSeason: boolean;
  days: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  /** Victoires / matchs (0 à 100), null sans match. */
  winRate: number | null;
  /** Points par match de championnat (3 par victoire), null sans match de championnat. */
  pointsPerGame: number | null;
  trophies: number;
  bestFinish: number | null;
  biggestWin: (SeasonMatch & { club: string }) | null;
  /** Plus longue série sans défaite sur une saison. */
  unbeaten: number;
}

export interface Career {
  /** Du premier club au club actuel. */
  spells: CareerSpell[];
  totals: CareerTotals;
}

const DAY = 86_400_000;

/**
 * Pays d'un passage : nationalité la plus présente dans l'effectif quand elle pèse au moins un tiers des joueurs,
 * sinon le championnat le plus joué s'il est connu, sinon la nationalité la plus présente.
 */
export function spellCountry(entries: Entry[]): { code: string; source: 'squad' | 'league' } | null {
  const picks = [entries[0], entries[Math.floor(entries.length / 2)], entries.at(-1)].filter((e, i, a): e is Entry => !!e && a.indexOf(e) === i);
  const votes = new Map<string, number>();
  let total = 0;
  for (const e of picks)
    for (const p of e.data.players) {
      const code = countryOfNationality(typeof p.nationality === 'string' ? p.nationality : null);
      total++;
      if (code) votes.set(code, (votes.get(code) ?? 0) + 1);
    }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= total / 3) return { code: top[0], source: 'squad' };
  const leagues = new Map<string, number>();
  for (const r of officialResults(entries)) if (r.competition) leagues.set(r.competition, (leagues.get(r.competition) ?? 0) + 1);
  for (const e of entries) {
    const comp = (e.data as { nextMatch?: { competition?: unknown } }).nextMatch?.competition;
    if (typeof comp === 'string') leagues.set(comp, (leagues.get(comp) ?? 0) + 1);
  }
  for (const [name] of [...leagues.entries()].sort((a, b) => b[1] - a[1])) {
    const code = countryOfLeague(name);
    if (code) return { code, source: 'league' };
  }
  return top ? { code: top[0], source: 'squad' } : null;
}

const margin = (m: SeasonMatch) => m.goalsFor - m.goalsAgainst;

/** Parcours du coach dans la partie. `freeSince` : date depuis laquelle il est sans club (le dernier club est alors quitté). */
export function careerOf(history: Entry[], opts: { freeSince?: string | null } = {}): Career {
  const spells: CareerSpell[] = coachSpells(history, opts).map((sp) => {
    const segs = seasonSegments(sp.entries);
    const seasons: CareerSeason[] = segs.map((s) => {
      const r = reviewOf(s.entries, !s.ended);
      return {
        label: r.label,
        position: r.position,
        ended: s.ended,
        played: r.played,
        wins: r.wins,
        draws: r.draws,
        losses: r.losses,
        goalsFor: r.goalsFor,
        goalsAgainst: r.goalsAgainst,
        cupsWon: r.cups.filter((c) => c.status === 'won').map((c) => c.competition),
        unbeaten: r.unbeaten,
      };
    });
    const trophies = [
      ...seasons.filter((s) => s.ended && s.position === 1).map((s) => ({ season: s.label, competition: null })),
      ...seasons.flatMap((s) => s.cupsWon.map((c) => ({ season: s.label, competition: c }))),
    ];
    const finished = seasons.filter((s) => s.ended && s.position != null).map((s) => s.position!);
    const country = spellCountry(sp.entries);
    return {
      club: sp.club,
      start: sp.entries[0]!.gameDate,
      end: sp.entries.at(-1)!.gameDate,
      current: !sp.left,
      reason: sp.left ? sp.reason : null,
      country: country?.code ?? null,
      countrySource: country?.source ?? null,
      seasons,
      total: reviewOf(sp.entries, false),
      trophies,
      bestFinish: finished.length ? Math.min(...finished) : null,
    };
  });

  const sum = (f: (s: CareerSpell) => number) => spells.reduce((a, s) => a + f(s), 0);
  const played = sum((s) => s.total.played);
  const wins = sum((s) => s.total.wins);
  const league = spells.reduce((a, s) => ({ played: a.played + s.total.league.played, points: a.points + 3 * s.total.league.wins + s.total.league.draws }), { played: 0, points: 0 });
  const all = spells.flatMap((s) => s.seasons);
  const finishes = spells.map((s) => s.bestFinish).filter((x): x is number => x != null);
  let biggestWin: CareerTotals['biggestWin'] = null;
  for (const s of spells) {
    const w = s.total.biggestWin;
    if (w && (!biggestWin || margin(w) > margin(biggestWin) || (margin(w) === margin(biggestWin) && w.goalsFor > biggestWin.goalsFor))) biggestWin = { ...w, club: s.club };
  }
  const first = spells[0]?.start;
  const last = spells.at(-1)?.end;

  return {
    spells,
    totals: {
      clubs: new Set(spells.map((s) => s.club)).size,
      countries: new Set(spells.map((s) => s.country).filter(Boolean)).size,
      seasons: all.filter((s) => s.ended).length,
      ongoingSeason: all.some((s) => !s.ended),
      days: first && last ? Math.max(0, Math.round((Date.parse(last.slice(0, 10)) - Date.parse(first.slice(0, 10))) / DAY)) : 0,
      played,
      wins,
      draws: sum((s) => s.total.draws),
      losses: sum((s) => s.total.losses),
      goalsFor: sum((s) => s.total.goalsFor),
      goalsAgainst: sum((s) => s.total.goalsAgainst),
      cleanSheets: sum((s) => s.total.cleanSheets),
      winRate: played ? Math.round((wins / played) * 100) : null,
      pointsPerGame: league.played ? Math.round((league.points / league.played) * 100) / 100 : null,
      trophies: sum((s) => s.trophies.length),
      bestFinish: finishes.length ? Math.min(...finishes) : null,
      biggestWin,
      // Séries sans défaite : saison par saison (celle d'un passage entier mélangerait les saisons).
      unbeaten: all.reduce((a, s) => Math.max(a, s.unbeaten), 0),
    },
  };
}
