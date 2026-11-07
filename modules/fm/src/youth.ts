import type { EffArea, WorkPlan } from './project';
import { coachFocus, mondayOf, nearestPreset, trainingWeekAt, weekWorkload, type TrainingMethod, type WinterBreak } from './training';

/**
 * Jeunes et équipe B : ce que le plugin lit déjà de la réserve et des équipes de jeunes (joueurs avec `team`, attributs
 * compris) suffit pour leur donner un plan. Leur calendrier n'est pas lu : on suppose un match le samedi.
 *
 * Statut de chaque joueur, d'après son adéquation au rôle du projet (sur 20) comparée au niveau de l'équipe première
 * (`firstTeamBar` : adéquation médiane de ses titulaires) :
 * - « promote » : au niveau (repère − 1 ou mieux) : à faire s'entraîner avec l'équipe première ;
 * - « loan » : 19 ans ou plus, du potentiel (3 étoiles ou plus) mais pas encore au niveau : il lui faut des matchs
 *   d'adultes, un prêt ;
 * - « low » : 20 ans ou plus et 2 étoiles de potentiel ou moins : place à libérer ;
 * - « develop » : le reste, il progresse chez les jeunes.
 */
export type YouthStatus = 'promote' | 'loan' | 'develop' | 'low';
const STATUS_ORDER: Record<YouthStatus, number> = { promote: 0, loan: 1, develop: 2, low: 3 };

export function youthStatus(p: { age: number | null; stars: { potential: number | null } | null }, fit: number | null, threshold: number): YouthStatus {
  if (fit != null && fit >= threshold - 1) return 'promote';
  const pot = p.stars?.potential ?? null;
  const age = p.age ?? 0;
  if (pot != null && pot <= 2 && age >= 20) return 'low';
  if (age >= 19 && pot != null && pot >= 3) return 'loan';
  return 'develop';
}

export interface YouthRow {
  plan: WorkPlan;
  status: YouthStatus;
  /** Priorité individuelle conseillée (libellés fm.train.focus.<id>). */
  focus: string | null;
}

export interface YouthTeam {
  team: string;
  rows: YouthRow[];
  counts: Record<YouthStatus, number>;
}

/**
 * Joueurs des équipes de jeunes et de la réserve, rangés par équipe (« Malženice U19 », « Malženice II »…). `plans` vient
 * de `buildProject` sur ces joueurs (rôle du projet et attributs faibles), `threshold` = `firstTeamBar` de l'équipe première
 * (à défaut, le seuil du projet).
 */
/** Repère de l'équipe première : adéquation médiane des titulaires de son projet (null sans titulaire). */
export function firstTeamBar(slots: { fit: number | null; player: unknown }[]): number | null {
  const fits = slots.filter((s) => s.player && s.fit != null).map((s) => s.fit!).sort((a, b) => a - b);
  if (!fits.length) return null;
  const m = Math.floor(fits.length / 2);
  return fits.length % 2 ? fits[m]! : (fits[m - 1]! + fits[m]!) / 2;
}

export function youthTeams(plans: WorkPlan[], threshold: number): YouthTeam[] {
  const byTeam = new Map<string, YouthRow[]>();
  for (const plan of plans) {
    const team = plan.player.team;
    if (!team) continue;
    const row: YouthRow = { plan, status: youthStatus(plan.player, plan.fit, threshold), focus: coachFocus(plan.player, plan.weak, null) };
    byTeam.set(team, [...(byTeam.get(team) ?? []), row]);
  }
  return [...byTeam.entries()]
    .map(([team, rows]) => {
      rows.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || (b.plan.player.stars?.potential ?? 0) - (a.plan.player.stars?.potential ?? 0) || (b.plan.fit ?? 0) - (a.plan.fit ?? 0));
      const counts = { promote: 0, loan: 0, develop: 0, low: 0 };
      for (const r of rows) counts[r.status]++;
      return { team, rows, counts };
    })
    .sort((a, b) => a.team.localeCompare(b.team));
}

/**
 * Semaine type des jeunes : même programme que l'équipe première, mais orienté progression (aucune zone tactique
 * faible à corriger : le programme réduit les séances tactiques au profit des séances de développement) et calendrier
 * supposé (un match le samedi en saison).
 */
export function youthWeek(o: { gameDate: string; seasonStart?: number; winterBreak?: WinterBreak | null; trainingDays?: number[]; priorities?: EffArea[]; style?: string; method?: TrainingMethod }) {
  const plan = trainingWeekAt(mondayOf(o.gameDate), { ...o, fixtures: undefined, weakAreas: [], gaugesKnown: true });
  return { plan, preset: nearestPreset(plan), workload: weekWorkload(plan) };
}
