import { contractCall, mercatoAdvice, type MercatoAdvice } from './mercato';
import { unavailable, type FmPlayer } from './player';
import type { PosCode } from './positions';
import { abilityNeeded, bestTactic, buildProject, instructionBudget, rankTactics, shiftPlayer, tactAbility, type CoachPrefs, type ProjectSlot, type TacticPick } from './project';
import type { SquadAt } from './progress';
import type { StyleRef, TacticEngine } from './tactic';

/*
 * Plan d'évolution : ce que deviennent la tactique et l'effectif aux prochains mercatos si l'on suit Simloom.
 * À chaque fenêtre, l'effectif est vieilli (progression mesurée sur les instantanés, sinon courbe d'âge), les départs
 * conseillés sont faits (ventes, prêts, fins de contrat non prolongées), puis on recalcule :
 * - la tactique : celle de l'étape précédente est gardée tant qu'une autre ne gagne pas SWITCH_POINTS (une base,
 *   des ajustements) ; un changement tombe donc sur une fenêtre, avec la présaison ou la trêve pour le travailler ;
 * - la complexité : consignes individuelles par joueur que le groupe peut absorber (instructionBudget), qui montent
 *   avec la capacité tactique ;
 * - le onze : les jeunes qui prennent une place de titulaire, les postes du projet encore à recruter.
 * Aucune arrivée n'est inventée : les postes à recruter restent à recruter tant que le joueur n'a pas signé.
 */

export type WindowKind = 'now' | 'summer' | 'winter';

export interface StarterChange {
  pos: PosCode;
  player: FmPlayer;
  /** Titulaire du même poste à l'étape précédente, s'il y en avait un. */
  replaces: FmPlayer | null;
}

export interface EvolutionStage {
  kind: WindowKind;
  /** Date de la fenêtre (ISO), ou date du jeu pour l'étape « maintenant ». */
  date: string;
  /** Saisons écoulées depuis la date du jeu. */
  years: number;
  tactic: TacticPick;
  /** La tactique change par rapport à l'étape précédente. */
  changed: boolean;
  /** Capacité tactique de l'effectif et capacité souhaitable pour le style. */
  ability: number | null;
  need: number;
  /** Consignes individuelles par joueur conseillées à cette étape. */
  perPlayer: 1 | 2 | 3;
  /** Note d'équipe (sur 20) du onze conseillé. */
  score: number;
  /** Postes du projet prêts (sur 11) et postes encore à recruter. */
  ready: number;
  recruit: ProjectSlot[];
  /** Nouveaux titulaires par rapport à l'étape précédente. */
  newStarters: StarterChange[];
  /** Joueurs partis depuis l'étape précédente (départ conseillé ou fin de contrat). */
  left: FmPlayer[];
}

export interface EvolutionPlan {
  stages: EvolutionStage[];
  /** Contrats à prolonger avant qu'ils ne partent libres, dans l'ordre d'échéance. */
  extend: MercatoAdvice[];
}

const DAY = 864e5;
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * DAY);

/** Les `count` prochaines fenêtres après `gameDate` : été (1er du mois de reprise du championnat) et hiver (six mois plus tard). */
export function nextWindows(gameDate: string, seasonStart = 8, count = 4): { kind: WindowKind; date: string }[] {
  const start = new Date(`${gameDate.slice(0, 10)}T00:00:00Z`);
  const out: { kind: WindowKind; date: string }[] = [];
  for (let y = start.getUTCFullYear() - 1; out.length < count; y++)
    for (const [kind, month] of [
      ['summer', seasonStart - 1],
      ['winter', seasonStart + 5],
    ] as const) {
      const d = new Date(Date.UTC(y, month, 1));
      if (d > start && out.length < count) out.push({ kind, date: isoOf(d) });
    }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Date jusqu'à laquelle le joueur reste au club si l'on suit le conseil sur son contrat. */
function stayUntil(a: MercatoAdvice, windows: string[]): string | null {
  // Départs conseillés (vente, fin de contrat, prêt) : faits à la première fenêtre.
  if (a.verdict === 'sell' || a.verdict === 'release' || a.verdict === 'loan') return windows[0] ?? null;
  const end = a.player.contractEnd;
  if (!end || a.months == null || a.months > 24) return null;
  const { call, years } = contractCall(a);
  if (call === 'extend' || call === 'extendShort') {
    const d = new Date(`${end.slice(0, 10)}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + (years ?? 1));
    return isoOf(d);
  }
  return end.slice(0, 10);
}

export function evolutionPlan(
  engine: TacticEngine,
  players: FmPlayer[],
  gameDate: string,
  coach: CoachPrefs = {},
  history: SquadAt[] = [],
  base?: StyleRef | null,
  count = 4,
  leavingIds: ReadonlySet<string> = new Set(),
): EvolutionPlan | null {
  const list = players.filter((p) => Object.keys(p.attributes).length);
  if (!list.length) return null;
  const report = mercatoAdvice(engine, list, gameDate, coach, history, leavingIds);
  const windows = nextWindows(gameDate, coach.seasonStart ?? 8, count);
  const until = new Map((report?.advice ?? []).map((a) => [a.player.id, stayUntil(a, windows.map((w) => w.date))]));
  // Partants signalés : encore là aujourd'hui, partis à la première fenêtre (ou à la fin de leur contrat si elle tombe avant).
  for (const p of report?.leaving ?? []) {
    const end = p.contractEnd?.slice(0, 10) ?? null;
    const first = windows[0]?.date ?? null;
    until.set(p.id, end && (!first || end < first) ? end : first);
  }

  const stages: EvolutionStage[] = [];
  let prevBase = base ?? null;
  let prev: EvolutionStage | null = null;
  for (const w of [{ kind: 'now' as const, date: gameDate.slice(0, 10) }, ...windows]) {
    const years = Math.max(0, yearsBetween(gameDate, w.date));
    const now = w.kind === 'now';
    const present = list.filter((p) => {
      const u = until.get(p.id);
      return now || !u || u > w.date;
    });
    // Aujourd'hui, les blessés et suspendus ne jouent pas ; aux fenêtres suivantes, on les compte rétablis.
    const squad = now ? present.filter((p) => !unavailable(p)) : present.map((p) => ({ ...shiftPlayer(p, years, history), injury: null, suspension: null }));
    const ranked = rankTactics(engine, squad);
    const tactic = bestTactic(engine, squad, coach, ranked, prevBase);
    if (!tactic) break;
    const project = buildProject(engine, squad, coach);
    const ability = tactAbility(squad);
    const xi = tactic.plan.slots;
    const newStarters: StarterChange[] = prev
      ? xi
          .filter((sl) => sl.player && !prev!.tactic.plan.slots.some((o) => o.player?.id === sl.player!.id))
          .map((sl) => ({ pos: sl.pos, player: sl.player!, replaces: prev!.tactic.plan.slots.find((o) => o.pos === sl.pos && o.player)?.player ?? null }))
      : [];
    const stage: EvolutionStage = {
      kind: w.kind,
      date: w.date,
      years,
      tactic,
      changed: !!prev && (prev.tactic.style.id !== tactic.style.id || prev.tactic.form !== tactic.form),
      ability,
      need: abilityNeeded(tactic.style),
      perPlayer: instructionBudget(tactic.style, ability),
      score: tactic.plan.score,
      ready: project ? project.slots.filter((s) => s.status === 'ready').length : 0,
      recruit: project ? project.slots.filter((s) => s.status === 'recruit') : [],
      newStarters,
      left: prev
        ? list.filter((p) => {
            const u = until.get(p.id);
            return !!u && u > prev!.date && u <= w.date;
          })
        : [],
    };
    stages.push(stage);
    prev = stage;
    prevBase = tactic.style;
  }
  const extend = (report?.advice ?? [])
    .filter((a) => a.months != null && a.months <= 12 && ['extend', 'extendShort'].includes(contractCall(a).call))
    .sort((a, b) => (a.months ?? 0) - (b.months ?? 0));
  return { stages, extend };
}
