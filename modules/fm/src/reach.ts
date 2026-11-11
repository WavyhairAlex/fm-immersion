import { monthsBetween } from './alerts';
import type { DbPlayer } from './targets';

/**
 * Recrues à la portée du club : un joueur trouvé dans la base du jeu viendrait-il, et le club peut-il le payer ?
 * Un petit club de D1 slovaque n'attire pas un joueur du Real Madrid, même si son niveau colle au poste.
 *
 * Repères, tous tirés de l'effectif du club lu dans la même base (même échelle que les recrues) :
 * - salaire : le plus gros salaire de l'effectif. Un joueur ne baisse presque jamais son salaire ; au-delà de
 *   1,25 fois ce plafond c'est difficile, au-delà de 2 fois c'est hors de portée ;
 * - réputation : moyenne des trois meilleures réputations actuelles de l'effectif, ce que le club attire déjà.
 *   Au-delà de 1,25 fois c'est difficile, au-delà de 1,75 fois le joueur ne viendra pas ;
 * - championnat : un joueur d'un championnat nettement plus coté (1,3 fois la réputation du nôtre) rechigne ;
 * - indemnité : sa valeur face au budget de transferts. Libre, en fin de contrat (6 mois ou moins : précontrat)
 *   ou jeune d'un club plus huppé (prêt possible), il ne coûte pas d'indemnité ;
 * - marge salariale : son salaire face à la marge du club (salaire du partant compris). Dépassée, il faut d'abord
 *   vendre : difficile, pas impossible.
 * Coefficients de FM Immersion, pas du jeu : la négociation réelle reste celle de FM27.
 */

export type ReachLevel = 'easy' | 'possible' | 'hard' | 'out';
export const REACH_ORDER: ReachLevel[] = ['easy', 'possible', 'hard', 'out'];

/** Ce qui facilite (`free`, `preContract`, `loan`, `listed`) ou freine la venue du joueur. */
export type ReachWhy = 'free' | 'preContract' | 'loan' | 'listed' | 'wage' | 'wageRoom' | 'fee' | 'reputation' | 'league';

export const WAGE_HARD = 1.25;
export const WAGE_OUT = 2;
export const REP_HARD = 1.25;
export const REP_OUT = 1.75;
export const LEAGUE_HARD = 1.3;
/** Indemnité au-delà de laquelle le board ne suivra pas, en multiple du budget de transferts. */
export const FEE_OUT = 1.5;
export const PRECONTRACT_MONTHS = 6;
export const LOAN_MAX_AGE = 23;
/**
 * Montant affiché en € par mois pour un salaire de base par semaine, quand l'effectif ne permet pas de le mesurer :
 * 52/12 semaines × le taux de change du jeu (1,165 dans la partie d'essai).
 */
export const DEFAULT_WAGE_RATE = (52 / 12) * 1.165;

/** Joueur de l'effectif lu dans la base (`fm_memory_abilities`). */
export interface OwnAbility {
  id: number | string;
  reputation?: number | null;
  wageWeekly?: number | null;
  valueRaw?: number | null;
  divisionReputation?: number | null;
}

/** Ce que le club peut attirer et payer, dans les unités de la base du jeu. */
export interface ClubReach {
  /** Plus gros salaire de l'effectif, par semaine (monnaie de base). */
  topWage: number | null;
  /** Moyenne des trois meilleures réputations actuelles de l'effectif. */
  reputation: number | null;
  divisionReputation: number | null;
  /** Budget de transferts (monnaie de base, comme la valeur des joueurs) ; null s'il n'est pas lu. */
  transferBudget: number | null;
  /** Marge salariale par semaine (monnaie de base), salaire du partant libéré compris ; null si inconnue. */
  wageRoom: number | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pos = (v: number | null | undefined): v is number => v != null && Number.isFinite(v) && v > 0;

/**
 * Repères du club à partir de son effectif lu dans la base et de ses finances lues par le plugin.
 * - `squad` : l'effectif de l'instantané (salaire affiché par mois), pour convertir la marge salariale du jeu ;
 * - `transferBudget` : champ brut du plugin, dans la monnaie de base du jeu (comme `wageBudget`, voir `wageFigures`) ;
 * - `wageRoom` : marge affichée par mois (négative = budget dépassé) ;
 * - `freedWeekly` : salaire de base par semaine que le départ du joueur à remplacer libère.
 */
export function clubReach(
  own: OwnAbility[],
  squad: readonly { id: string; wage: number | null }[],
  fin: { transferBudget: number | null; wageRoom: number | null } | null,
  freedWeekly = 0,
): ClubReach {
  const wages = own.map((a) => a.wageWeekly).filter(pos);
  const reps = own.map((a) => a.reputation).filter(pos).sort((a, b) => b - a).slice(0, 3);
  const divs = own.map((a) => a.divisionReputation).filter(pos);
  // Montant affiché par mois / salaire de base par semaine, mesuré sur les joueurs présents des deux côtés.
  const shown = new Map(squad.map((p) => [p.id, p.wage]));
  const rate =
    median(
      own.flatMap((a) => {
        const w = shown.get(String(a.id));
        return pos(w) && pos(a.wageWeekly) ? [w / a.wageWeekly] : [];
      }),
    ) ?? DEFAULT_WAGE_RATE;
  return {
    topWage: wages.length ? Math.max(...wages) : null,
    reputation: reps.length ? reps.reduce((a, b) => a + b, 0) / reps.length : null,
    divisionReputation: median(divs),
    transferBudget: fin?.transferBudget ?? null,
    wageRoom: fin?.wageRoom == null ? null : fin.wageRoom / rate + freedWeekly,
  };
}

/** Plafonds à passer à la recherche dans la base : écarte les vedettes avant la limite de résultats. */
export function reachCaps(club: ClubReach): { maxWageWeekly?: number; maxReputation?: number } {
  return {
    maxWageWeekly: club.topWage ? Math.round(club.topWage * WAGE_OUT) : undefined,
    maxReputation: club.reputation ? Math.round(club.reputation * REP_OUT) : undefined,
  };
}

export interface Reach {
  level: ReachLevel;
  why: ReachWhy[];
  /** Indemnité à prévoir (monnaie de base) : 0 libre, en précontrat ou en prêt ; null si sa valeur est inconnue. */
  fee: number | null;
}

/** Le joueur viendrait-il, et le club peut-il le payer ? */
export function reachOf(c: DbPlayer, club: ClubReach, gameDate: string): Reach {
  const why: ReachWhy[] = [];
  let out = false;
  let hard = false;
  const block = (w: ReachWhy, isOut: boolean) => {
    why.push(w);
    if (isOut) out = true;
    else hard = true;
  };

  const free = c.clubId == null && !c.club && !c.loanClub;
  const months = c.contractEnd ? monthsBetween(gameDate, c.contractEnd) : null;
  const preContract = !free && months != null && months <= PRECONTRACT_MONTHS;
  const divRatio = pos(club.divisionReputation) && pos(c.divisionReputation) ? c.divisionReputation / club.divisionReputation : null;
  // Les clubs plus huppés prêtent leurs jeunes : pas d'indemnité, et le championnat plus modeste ne le rebute pas.
  const loan = !free && !preContract && (c.age ?? 99) <= LOAN_MAX_AGE && divRatio != null && divRatio > 1;
  if (free) why.push('free');
  else if (preContract) why.push('preContract');
  else if (loan) why.push('loan');
  if (c.transferListed) why.push('listed');

  if (pos(club.topWage) && pos(c.wageWeekly)) {
    const r = c.wageWeekly / club.topWage;
    if (r > WAGE_HARD) block('wage', r > WAGE_OUT);
  }
  if (club.wageRoom != null && pos(c.wageWeekly) && c.wageWeekly > club.wageRoom) block('wageRoom', false);

  const fee = free || preContract || loan ? 0 : (c.valueRaw ?? null);
  if (fee != null && fee > 0 && club.transferBudget != null) {
    const budget = Math.max(0, club.transferBudget);
    if (fee > budget) block('fee', fee > budget * FEE_OUT);
  }

  const rep = c.reputation?.[1];
  if (pos(club.reputation) && pos(rep)) {
    const r = rep / club.reputation;
    if (r > REP_HARD) block('reputation', r > REP_OUT);
  }
  if (!loan && divRatio != null && divRatio > LEAGUE_HARD) block('league', false);

  const level: ReachLevel = out ? 'out' : hard ? 'hard' : fee === 0 ? 'easy' : 'possible';
  return { level, why, fee };
}
