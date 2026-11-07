import { calendarFixtures } from './fixtures';
import type { MatchResult } from './results';
import { competitionKind } from './rules';
import type { FmSnapshot } from './snapshot';

/**
 * Parcours en coupe (coupes nationales et européennes), d'après les matchs suivis et le calendrier complet lu par le
 * plugin (`calNN…`, matchs à venir de toutes les compétitions). Le jeu ne dit pas « éliminé » : on le déduit.
 * - Un match à venir dans la compétition : encore en course.
 * - Coupe nationale : défaite sur un match sec, ou sur l'ensemble d'une double confrontation (deux matchs contre le
 *   même adversaire à moins de 3 semaines), sans match suivant au calendrier : éliminé.
 * - Nul sans match suivant (tirs au but inconnus), coupe d'Europe (phase de groupes : une défaite n'élimine pas) :
 *   éliminé seulement si aucun match n'est revenu au calendrier 30 jours après le dernier.
 * - Victoire sans match suivant : qualifié en attendant le tirage, ou vainqueur quand la saison est finie et que ce
 *   dernier match tombe dans les trois dernières semaines (les finales se jouent en fin de saison).
 */

export type CupStatus = 'alive' | 'through' | 'out' | 'won' | 'unknown';

export interface CupTie {
  opponent: string | null;
  date: string;
  goalsFor: number;
  goalsAgainst: number;
  /** Matchs de la confrontation (2 = aller-retour). */
  legs: number;
}

export interface CupRun {
  competition: string;
  kind: 'cup' | 'europe';
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** Tours joués (une double confrontation compte pour un). */
  ties: CupTie[];
  status: CupStatus;
  /** Tour perdu, quand le club est éliminé. */
  outBy: CupTie | null;
}

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);
const norm = (s: string) => s.normalize('NFC').trim().toLowerCase();

/** Compétition à élimination suivie : coupe nationale ou coupe d'Europe. */
export function cupKind(name: string | null | undefined): 'cup' | 'europe' | null {
  const k = competitionKind(name);
  return k === 'cup' || k === 'europe' ? k : null;
}

/** Le calendrier de l'instantané annonce encore un match de cette compétition. */
export function cupFixtureAhead(s: FmSnapshot, competition: string): boolean | null {
  const cal = calendarFixtures(s);
  if (!cal.length) return null;
  return cal.some((f) => f.date >= s.gameDate.slice(0, 10) && f.competition != null && norm(f.competition) === norm(competition));
}

function tiesOf(ms: MatchResult[]): CupTie[] {
  const out: CupTie[] = [];
  for (const m of ms) {
    const prev = out.at(-1);
    if (prev && prev.legs === 1 && m.opponent && prev.opponent === m.opponent && days(prev.date, m.date) <= 21) {
      prev.goalsFor += m.goalsFor!;
      prev.goalsAgainst += m.goalsAgainst!;
      prev.legs = 2;
      prev.date = m.date;
    } else out.push({ opponent: m.opponent, date: m.date, goalsFor: m.goalsFor!, goalsAgainst: m.goalsAgainst!, legs: 1 });
  }
  return out;
}

/**
 * Parcours de chaque coupe jouée, vu depuis l'instantané `last` (le plus récent de la période). `seasonOver` : la
 * saison est finie (permet de dire « vainqueur »), `seasonEnd` sa date.
 */
export function cupRuns(results: MatchResult[], last: FmSnapshot, opts: { seasonOver?: boolean; seasonEnd?: string } = {}): CupRun[] {
  const byComp = new Map<string, MatchResult[]>();
  for (const r of results) {
    if (r.matches !== 1 || r.friendly || r.goalsFor == null || r.goalsAgainst == null || !r.competition || !cupKind(r.competition)) continue;
    byComp.set(r.competition, [...(byComp.get(r.competition) ?? []), r]);
  }
  const today = last.gameDate.slice(0, 10);
  return [...byComp].map(([competition, ms]) => {
    const kind = cupKind(competition)!;
    const ties = tiesOf(ms);
    const tie = ties.at(-1)!;
    const ahead = cupFixtureAhead(last, competition);
    const margin = tie.goalsFor - tie.goalsAgainst;
    const quiet = days(tie.date, today) >= 30;
    let status: CupStatus;
    if (ahead) status = 'alive';
    else if (ahead == null) status = 'unknown';
    else if (margin > 0)
      status = opts.seasonOver && kind === 'cup' && days(tie.date, opts.seasonEnd ?? today) <= 21 ? 'won' : kind === 'europe' && quiet ? 'out' : 'through';
    else if (margin < 0 && kind === 'cup') status = 'out';
    else status = quiet || opts.seasonOver ? 'out' : 'unknown';
    return {
      competition,
      kind,
      played: ms.length,
      wins: ms.filter((m) => m.goalsFor! > m.goalsAgainst!).length,
      draws: ms.filter((m) => m.goalsFor === m.goalsAgainst).length,
      losses: ms.filter((m) => m.goalsFor! < m.goalsAgainst!).length,
      ties,
      status,
      outBy: status === 'out' ? tie : null,
    };
  });
}

/** Le club a encore un match de coupe au calendrier dans les `within` jours (fin de saison repoussée). */
export function cupPending(s: FmSnapshot, within = 60): boolean {
  const today = s.gameDate.slice(0, 10);
  return calendarFixtures(s).some((f) => f.date >= today && days(today, f.date) <= within && !!cupKind(f.competition));
}
