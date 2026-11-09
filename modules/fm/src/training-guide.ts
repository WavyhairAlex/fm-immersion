import { ATTR_GROUPS } from './progress';
import { HARVEST_FOCUS, SLOW_BELOW, individualFocus } from './training';

/**
 * Le côté « pédagogique » de l'entraînement : ce qui fait vraiment progresser un joueur, et pourquoi chaque réglage
 * individuel est conseillé. D'après les bancs d'essai de la communauté (harvestgreen22 sur FM-Arena, jamiebolden,
 * test sur le code d'entraînement de FM27) : le jeu décide d'abord COMBIEN un joueur progresse (âge, marge sous son
 * potentiel, minutes jouées et niveau des adversaires, professionnalisme, installations), puis l'entraînement décide
 * OÙ va cette progression. Aucune formule officielle : ce sont des repères.
 */

export type AgeStage = 'peak' | 'high' | 'medium' | 'low' | 'decline';
export type RoomStage = 'big' | 'some' | 'none';
export type MinutesStage = 'plays' | 'some' | 'bench';
export type GrowthVerdict = 'strong' | 'good' | 'limited' | 'maintain' | 'decline';

export interface GrowthOutlook {
  verdict: GrowthVerdict;
  age: AgeStage | null;
  /** Marge entre CA et PA réels (lus en mémoire) ; null si inconnue. */
  room: RoomStage | null;
  /** Temps de jeu comparé au joueur le plus utilisé de l'effectif ; null si inconnu. */
  minutes: MinutesStage | null;
  injured: boolean;
  /** Jeune qui joue peu : c'est son temps de jeu qui le freine, pas l'entraînement. */
  needsMinutes: boolean;
}

/** Étape d'âge : les gardiens progressent environ trois ans plus longtemps. */
export function ageStage(age: number | null, gk = false): AgeStage | null {
  if (age == null) return null;
  const a = gk ? age - 3 : age;
  return a <= 18 ? 'peak' : a <= 21 ? 'high' : a <= 24 ? 'medium' : a <= 29 ? 'low' : 'decline';
}

const AGE_SCORE: Record<AgeStage, number> = { peak: 3, high: 2, medium: 1, low: 0, decline: -1 };

/**
 * Ce qu'un joueur peut encore gagner, et ce qui le freine. `teamApps` : apparitions du joueur le plus utilisé de
 * l'effectif (repère du nombre de matchs joués par l'équipe).
 */
export function growthOutlook(
  p: { age: number | null; positions?: string[]; ca?: number | null; pa?: number | null; apps?: number | null; injury?: string | null; injuryDays?: number | null },
  teamApps: number | null,
): GrowthOutlook {
  const gk = p.positions?.[0] === 'GB';
  const age = ageStage(p.age, gk);
  const gap = p.ca != null && p.pa != null && p.pa > 0 ? p.pa - p.ca : null;
  const room: RoomStage | null = gap == null ? null : gap >= 20 ? 'big' : gap >= 6 ? 'some' : 'none';
  const ratio = p.apps != null && teamApps != null && teamApps >= 4 ? p.apps / teamApps : null;
  const minutes: MinutesStage | null = ratio == null ? null : ratio >= 0.5 ? 'plays' : ratio >= 0.2 ? 'some' : 'bench';
  const injured = !!p.injury && (p.injuryDays ?? 0) >= 14;
  let score = age ? AGE_SCORE[age] : 1;
  score += room === 'big' ? 1 : room === 'none' ? -2 : 0;
  score += minutes === 'plays' ? 1 : minutes === 'bench' ? -1 : 0;
  if (injured) score -= 1;
  const verdict: GrowthVerdict = age === 'decline' ? 'decline' : room === 'none' ? 'maintain' : score >= 4 ? 'strong' : score >= 2 ? 'good' : score >= 1 ? 'limited' : 'maintain';
  const needsMinutes = (age === 'peak' || age === 'high' || age === 'medium') && room !== 'none' && (minutes === 'bench' || minutes === 'some');
  return { verdict, age, room, minutes, injured, needsMinutes };
}

/** Repère du nombre de matchs de l'équipe : les apparitions du joueur le plus utilisé. */
export function teamAppsOf(players: { apps: number | null }[]): number | null {
  const max = Math.max(0, ...players.map((p) => p.apps ?? 0));
  return max > 0 ? max : null;
}

/** Pourquoi cette priorité individuelle, libellé dans fm.train.focusWhy.<id>. */
export type FocusWhy = 'stats' | 'slowYoung' | 'weakRole' | 'youngDefault' | 'seniorMental' | 'none';

const MENTAL = new Set(ATTR_GROUPS.find(([g]) => g === 'mental')![1]);

/**
 * Priorité individuelle et sa raison :
 * - le point faible vu en match (centre de données) ;
 * - jusqu'à 23 ans, Vitesse pour un joueur lent : c'est ce qui pèse le plus en match et ça ne progresse plus après ;
 * - 28 ans et plus : un attribut mental clé du rôle, qui peut encore monter quand le physique décline ;
 * - sinon l'attribut clé le plus faible du rôle (Vitesse par défaut pour un jeune sans point faible reconnu).
 */
export function focusAdvice(
  player: { age: number | null; positions: string[]; attributes?: Record<string, number> },
  weak: { key: string }[],
  fromStats: string | null,
): { focus: string | null; why: FocusWhy } {
  const gk = player.positions[0] === 'GB';
  if (fromStats) return { focus: fromStats, why: 'stats' };
  const young = player.age != null && player.age <= 23;
  if (!gk && young && isSlow(player.attributes)) return { focus: HARVEST_FOCUS, why: 'slowYoung' };
  if (player.age != null && player.age >= 28) {
    const mental = individualFocus(weak.filter((w) => MENTAL.has(w.key)), gk);
    if (mental) return { focus: mental, why: 'seniorMental' };
  }
  const role = individualFocus(weak, gk);
  if (role) return { focus: role, why: 'weakRole' };
  if (!gk && young) return { focus: HARVEST_FOCUS, why: 'youngDefault' };
  return { focus: null, why: 'none' };
}

function isSlow(a: Record<string, number> | undefined): boolean {
  const pace = a?.Pace;
  const acc = a?.Acceleration;
  if (pace == null && acc == null) return true;
  return (pace ?? 20) < SLOW_BELOW || (acc ?? 20) < SLOW_BELOW;
}

/**
 * Pourquoi ces rôles d'entraînement, libellé dans fm.train.roleWhy.<id> :
 * - « tactic » : il est dans le onze de ta tactique, il apprend son rôle (la familiarité compte dans l'efficacité) ;
 * - « youngBench » : jeune hors du onze, la progression prime ; test sur le code de FM27 : sans rôle avec ballon et
 *   avec seulement un rôle sans ballon (Milieu défensif pour les défenseurs, Milieu offensif pour les autres), il
 *   progresse le plus ;
 * - « project » : hors du onze, le rôle du projet où il est le plus adapté.
 */
export type RoleWhy = 'tactic' | 'youngBench' | 'project';
export function roleAdvice(plan: { slot: unknown; player: { age: number | null; positions: string[] } }): { why: RoleWhy; devRole: 'dm' | 'am' | null } {
  if (plan.slot) return { why: 'tactic', devRole: null };
  const p = plan.player;
  if (p.age != null && p.age <= 21 && p.positions[0] !== 'GB') {
    const back = ['DD', 'DC', 'DG', 'DLD', 'DLG', 'MDF'].includes(p.positions[0] ?? '');
    return { why: 'youngBench', devRole: back ? 'dm' : 'am' };
  }
  return { why: 'project', devRole: null };
}
