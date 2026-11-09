import { monthsBetween } from './alerts';
import { wageFigures } from './club';
import { nextMatchCountdown } from './fixtures';
import type { FmPlayer } from './player';
import { toNumber } from './player';
import type { FmSnapshot } from './snapshot';

/** Familles d'attributs des joueurs de champ, comme sur la fiche du jeu. */
export const ATTR_FAMILIES = {
  technical: ['Corners', 'Crossing', 'Dribbling', 'Finishing', 'FirstTouch', 'FreeKicks', 'Heading', 'LongShots', 'LongThrows', 'Marking', 'Passing', 'PenaltyTaking', 'Tackling', 'Technique'],
  mental: ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'Movement', 'Positioning', 'Teamwork', 'Vision', 'WorkRate'],
  physical: ['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength'],
} as const;
export type AttrFamily = keyof typeof ATTR_FAMILIES;

const mean = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Texte lisible si le jeu a fourni une valeur simple ; les objets bruts du jeu sont ignorés. */
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

export interface FmSummary {
  players: number;
  avgAge: number | null;
  /** Somme des salaires mensuels de l'effectif. */
  wages: number | null;
  /** Marge restante sur le budget salaires (négative = budget dépassé). */
  wageRoom: number | null;
  transferBudget: number | null;
  under21: number;
  over30: number;
  condition: number | null;
  sharpness: number | null;
  injured: number;
  goals: number | null;
  rating: number | null;
  topScorer: { name: string; goals: number } | null;
  expiring: number;
  avgWage: number | null;
  topEarner: { name: string; wage: number } | null;
  /** Moyenne /20 de chaque famille d'attributs, joueurs de champ seulement. */
  profile: Record<AttrFamily, number | null>;
  nextMatch: { opponent: string; home: boolean | null; inDays: number | null; competition: string | null; staffView: string | null } | null;
}

/**
 * Le résumé en haut de l'écran : l'essentiel en quelques secondes.
 * Les blocs `clubInfo` et `nextMatch` sont facultatifs dans l'instantané (plugin récent seulement).
 */
export function summarize(snap: FmSnapshot, players: FmPlayer[]): FmSummary {
  const club = (snap.clubInfo ?? {}) as Record<string, unknown>;
  const next = (snap.nextMatch ?? null) as Record<string, unknown> | null;
  const ages = players.map((p) => p.age).filter((a): a is number => a != null);
  const wageList = players.map((p) => p.wage).filter((w): w is number => w != null);
  const wages = wageList.length ? wageList.reduce((a, b) => a + b, 0) : null;
  const w = wageFigures(club, players);
  const opponent = next ? text(next.opponent) : null;
  const outfield = players.filter((p) => p.positions[0] !== 'GB');
  const family = (f: AttrFamily) => mean(outfield.map((p) => mean(ATTR_FAMILIES[f].map((k) => p.attributes[k]))));
  const scorer = [...players].filter((p) => (p.goals ?? 0) > 0).sort((a, b) => b.goals! - a.goals!)[0];
  const earner = [...players].filter((p) => p.wage != null).sort((a, b) => b.wage! - a.wage!)[0];
  const goals = players.some((p) => p.goals != null) ? players.reduce((a, p) => a + (p.goals ?? 0), 0) : null;
  const location = next ? text(next.location)?.toLowerCase() ?? '' : '';
  return {
    players: players.length,
    avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
    under21: ages.filter((a) => a <= 21).length,
    over30: ages.filter((a) => a >= 30).length,
    condition: mean(players.map((p) => p.condition)),
    sharpness: mean(players.map((p) => p.sharpness)),
    injured: players.filter((p) => p.injury).length,
    goals,
    rating: mean(players.filter((p) => (p.apps ?? 0) > 0).map((p) => p.avgRating)),
    topScorer: scorer ? { name: scorer.name, goals: scorer.goals! } : null,
    expiring: players.filter((p) => p.contractEnd && monthsBetween(snap.gameDate, p.contractEnd) <= 6).length,
    avgWage: wages != null && wageList.length ? wages / wageList.length : null,
    topEarner: earner ? { name: earner.name, wage: earner.wage! } : null,
    profile: { technical: family('technical'), mental: family('mental'), physical: family('physical') },
    wages: w.fromGame ? w.bill : wages,
    wageRoom: w.room,
    transferBudget: toNumber(club.transferBudget),
    nextMatch: opponent
      ? {
          opponent,
          home: /dom|home/.test(location) ? true : /ext|away/.test(location) ? false : null,
          inDays: nextMatchCountdown(snap),
          competition: text(next!.competition),
          staffView: text(next!.threatLevel),
        }
      : null,
  };
}
