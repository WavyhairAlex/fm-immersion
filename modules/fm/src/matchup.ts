import type { OpponentFormation, OpponentReport } from './opponent';
import type { PosCode } from './positions';
import type { FormationPlan, StyleRef } from './tactic';
import { FORMATIONS } from './tactic';
import { MENTALITIES_FM27 } from './team-instructions-fm27';

/**
 * Tactique du match : la tactique de base (meilleure note d'équipe sur la saison) ajustée au prochain adversaire.
 * Chaque style × schéma garde sa note d'équipe, plus un bonus d'affrontement (en points de note, ±0,6 au plus) :
 * - mesuré quand le rapport du jeu donne ce que l'adversaire concède selon la formation d'en face
 *   (`advFormationsAffrontees`, onglet « Formations affrontées », au moins 180 min observées) ;
 * - sinon déduit du profil de l'adversaire (règles de football, pas une formule du jeu).
 */
export type MatchupReasonId =
  | 'coverStrikers'
  | 'thinCover'
  | 'winMidfield'
  | 'widthVsScreen'
  | 'possessionVsLowPress'
  | 'directVsHighPress'
  | 'attackLeaky'
  | 'concedesMore'
  | 'concedesLess';

export interface MatchupReason {
  id: MatchupReasonId;
  value: number;
  /** Données : minutes par occasion concédée contre ce schéma, et minutes observées. */
  every?: number;
  minutes?: number;
}

export interface Matchup {
  bonus: number;
  reasons: MatchupReason[];
}

export interface MatchTactic {
  style: StyleRef;
  form: string;
  plan: FormationPlan;
  /** Note d'équipe sans l'adversaire. */
  base: number;
  bonus: number;
  /** Note pour ce match = base + bonus. */
  score: number;
  reasons: MatchupReason[];
}

const MAX = 0.6;
const round2 = (x: number) => Math.round(x * 100) / 100;
/** « 4-2-3-1 MD MO Jeu large » → « 4-2-3-1 » ; « 4-4-2 2MD » → « 4-4-2 ». */
export const formationFamily = (f: string) => f.match(/\d(?:-\d)+/)?.[0] ?? f;

function count(form: string, ...codes: PosCode[]) {
  return (FORMATIONS[form] ?? []).filter(([p]) => codes.includes(p)).length;
}

/** Ce que l'adversaire concède contre ce schéma, comparé à sa moyenne (mesuré, si assez de minutes). */
function measured(form: string, faced: OpponentFormation[]): MatchupReason | null {
  const seen = faced.filter((f) => (f.minutes ?? 0) > 0 && f.every != null && f.every > 0);
  const vs = seen.filter((f) => formationFamily(f.form) === form);
  const minutes = vs.reduce((a, f) => a + f.minutes!, 0);
  if (minutes < 180) return null;
  const totalMin = seen.reduce((a, f) => a + f.minutes!, 0);
  const chances = (fs: OpponentFormation[]) => fs.reduce((a, f) => a + f.minutes! / f.every!, 0);
  const avgEvery = totalMin / chances(seen);
  const every = minutes / chances(vs);
  // Une occasion concédée plus souvent que d'habitude contre ce schéma = faille.
  const value = Math.max(-0.4, Math.min(0.4, (avgEvery / every - 1) * 0.5));
  if (Math.abs(value) < 0.05) return null;
  return { id: value > 0 ? 'concedesMore' : 'concedesLess', value: round2(value), every: Math.round(every), minutes };
}

export function matchupOf(form: string, style: StyleRef, opp: OpponentReport): Matchup {
  const reasons: MatchupReason[] = [];
  const m = measured(form, opp.formations.faced ?? []);
  if (m) reasons.push(m);

  const oppIp = opp.formations.ip[0]?.form ?? opp.manager.formation ?? null;
  const oppOop = opp.formations.oop[0]?.form ?? oppIp;
  const parts = oppIp ? formationFamily(oppIp).split('-').map(Number) : [];
  const strikers = parts.length >= 3 ? parts.at(-1)! : null;
  const dm = count(form, 'MDF');
  const cb = count(form, 'DC');
  const centralMid = count(form, 'MDF', 'MC', 'MOC');
  const wide = count(form, 'MOG', 'MOD', 'MG', 'MD', 'DLG', 'DLD');

  // Deux attaquants adverses : deux milieux défensifs ou trois centraux pour couvrir.
  if (strikers != null && strikers >= 2) {
    if (dm >= 2 || cb >= 3) reasons.push({ id: 'coverStrikers', value: 0.2 });
    else if (dm === 0) reasons.push({ id: 'thinCover', value: -0.15 });
  }
  // Milieu adverse à deux dans l'axe (4-4-2 sans milieu offensif) : à trois au centre, on gagne le milieu.
  if (oppIp && /^\d-4-\d$/.test(formationFamily(oppIp)) && centralMid >= 3) reasons.push({ id: 'winMidfield', value: 0.1 });
  // Deux milieux défensifs adverses sans ballon : l'axe est fermé, la largeur paie.
  if (oppOop && /MD|DM/.test(oppOop) && wide >= 2) reasons.push({ id: 'widthVsScreen', value: 0.1 });

  const press = opp.manager.pressing?.toLowerCase() ?? '';
  const ip = style.inPossession.join(' ').toLowerCase();
  if (/moins|less|rarement/.test(press) && /courtes|jouer malgré le pressing|gérer le pressing/.test(ip)) reasons.push({ id: 'possessionVsLowPress', value: 0.1 });
  else if (/plus|more|souvent/.test(press) && !/moins/.test(press) && /direct|contourner/.test(ip)) reasons.push({ id: 'directVsHighPress', value: 0.1 });

  const leak = opp.formations.oop[0]?.every;
  const ment = MENTALITIES_FM27.findIndex((x) => x.toLowerCase() === style.mentality?.toLowerCase());
  if (leak != null && leak <= 30 && ment >= MENTALITIES_FM27.indexOf('Positive')) reasons.push({ id: 'attackLeaky', value: 0.1 });

  const bonus = Math.max(-MAX, Math.min(MAX, reasons.reduce((a, r) => a + r.value, 0)));
  return { bonus: round2(bonus), reasons };
}

/** Toutes les combinaisons style × schéma classées pour ce match. */
export function rankForMatch(ranked: { style: StyleRef; plans: FormationPlan[] }[], opp: OpponentReport): MatchTactic[] {
  return ranked
    .flatMap(({ style, plans }) =>
      plans.map((plan) => {
        const { bonus, reasons } = matchupOf(plan.form, style, opp);
        return { style, form: plan.form, plan, base: plan.score, bonus, score: plan.score + bonus, reasons };
      }),
    )
    .sort((a, b) => b.score - a.score);
}
