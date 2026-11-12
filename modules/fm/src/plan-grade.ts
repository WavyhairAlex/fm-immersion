import type { FmPlayer } from './player';
import { lineOf, type Line, type PosCode } from './positions';
import { TACT_ABILITY, abilityNeeded } from './project';
import { attrOf, avg, type StyleRef } from './tactic';
import { TEAM_INSTRUCTIONS_FM27, teamInstructionOf } from './team-instructions-fm27';
import { personalityTone } from './training';

/*
 * Note de projet (A à E) : le joueur est-il fait pour notre façon de jouer ?
 *
 * Elle complète la compatibilité (compat.ts) en regardant tout ce que le projet demande à un joueur, pas seulement son
 * rôle. Cinq critères, chacun noté sur 100 :
 *
 * - le rôle (40 %) : sa note au meilleur rôle du projet comparée à sa meilleure note possible à ses postes (l'écart
 *   de compat.ts) ;
 * - le poste (15 %) : poste naturel, ou familiarité lue dans le jeu ;
 * - les consignes d'équipe (20 %) : chaque consigne du style (pressing haut, passes courtes, contre…) demande des
 *   attributs précis à sa ligne ; on compare ces attributs à son propre niveau ;
 * - la lecture du jeu (15 %) : ses attributs mentaux de lecture face à la complexité du style ;
 * - l'état d'esprit (10 %) : sa personnalité, quand on la connaît.
 *
 * Comme la compatibilité, la note juge le profil, pas le niveau : un jeune moyen mais taillé pour ce jeu peut avoir A,
 * une star dont le profil ne sert pas le style peut avoir D. Rien n'est écrit dans le jeu.
 */

export type PlanLetter = 'A' | 'B' | 'C' | 'D' | 'E';
export const PLAN_LETTERS: readonly PlanLetter[] = ['A', 'B', 'C', 'D', 'E'];
/** Score minimal (sur 100) de chaque lettre, de A à D ; en dessous de D, E. */
export const PLAN_STEPS: Record<Exclude<PlanLetter, 'E'>, number> = { A: 80, B: 65, C: 50, D: 35 };

export type GradePartId = 'role' | 'position' | 'demands' | 'reading' | 'mind';
/** Poids de chaque critère ; un critère inconnu (personnalité non lue…) est retiré et les autres repondérés. */
export const GRADE_WEIGHTS: Record<GradePartId, number> = { role: 40, position: 15, demands: 20, reading: 15, mind: 10 };

export interface GradePart {
  id: GradePartId;
  /** Sur 100. */
  score: number;
  weight: number;
  /** Valeurs pour l'explication (écart en étoiles, familiarité, capacité de lecture…). */
  vals: Record<string, number | string>;
}

export interface DemandFit {
  /** Identifiant de l'exigence (clé de traduction). */
  id: DemandId;
  /** Consigne du jeu qui la crée, comme à l'écran : « Hauteur du pressing : Pressing haut ». */
  instruction: string;
  attrs: { key: string; value: number }[];
  /** Moyenne de ces attributs moins son niveau, sur 20 : positif = c'est un de ses points forts. */
  edge: number;
  score: number;
}

export interface PlanGrade {
  letter: PlanLetter;
  /** Sur 100. */
  score: number;
  parts: GradePart[];
  /** Exigences des consignes d'équipe pour sa ligne, de la mieux à la moins bien tenue. */
  demands: DemandFit[];
  /** Lettre abaissée parce que son profil s'écarte trop du rôle (compatibilité « en partie » ou « hors projet »). */
  capped: boolean;
}

/* ---------- Ce que chaque consigne d'équipe demande aux joueurs ---------- */

export type DemandId =
  | 'shortPass' | 'directPass' | 'tempo' | 'expressive' | 'buildUp' | 'runAtDefence' | 'intoSpace' | 'shootOnSight'
  | 'workIntoBox' | 'crossEarly' | 'width' | 'counter' | 'counterPress' | 'press' | 'highLine' | 'lowBlock' | 'tackleHarder';

const WIDE = new Set<PosCode>(['DD', 'DG', 'DLD', 'DLG', 'MD', 'MG', 'MOD', 'MOG']);
type Who = Partial<Record<Line, string[]>> & { wide?: string[] };

interface DemandDef {
  id: DemandId;
  /** Consigne du jeu (code) et options qui créent l'exigence. */
  when: [code: string, options: number[]][];
  who: Who;
}

const CTRL = ['Passing', 'FirstTouch', 'Technique', 'Composure'];
const PRESS = ['WorkRate', 'Stamina', 'Acceleration', 'Teamwork'];

export const TEAM_DEMANDS: readonly DemandDef[] = [
  { id: 'shortPass', when: [['PassingDirectness', [0, 1]]], who: { DEF: CTRL, MIL: CTRL, ATT: ['FirstTouch', 'Technique', 'Composure'] } },
  { id: 'directPass', when: [['PassingDirectness', [3, 4]]], who: { DEF: ['Passing', 'Vision'], MIL: ['Passing', 'Vision'], ATT: ['Movement', 'Pace', 'Strength'] } },
  { id: 'tempo', when: [['Tempo', [3, 4]]], who: { DEF: ['Passing', 'Decisions'], MIL: ['Passing', 'Decisions', 'FirstTouch'], ATT: ['Decisions', 'FirstTouch', 'Movement'] } },
  { id: 'expressive', when: [['CreativeFreedom', [2]]], who: { MIL: ['Flair', 'Vision', 'Technique'], ATT: ['Flair', 'Technique', 'Dribbling'] } },
  {
    id: 'buildUp',
    when: [['BuildUpStrategy', [0]], ['GoalKicks', [0]], ['GoalkeeperDistributionTarget', [1, 2]]],
    who: { GB: ['Passing', 'Composure', 'FirstTouch'], DEF: ['Passing', 'Composure', 'FirstTouch', 'Decisions'], MIL: ['Passing', 'Composure', 'FirstTouch'] },
  },
  { id: 'runAtDefence', when: [['Dribbling', [2]]], who: { MIL: ['Dribbling', 'Agility', 'Acceleration'], ATT: ['Dribbling', 'Agility', 'Acceleration', 'Flair'] } },
  { id: 'intoSpace', when: [['PassReception', [2]]], who: { MIL: ['Movement', 'Acceleration'], ATT: ['Movement', 'Pace', 'Acceleration'] } },
  { id: 'shootOnSight', when: [['ShotsFromDistance', [2]]], who: { MIL: ['LongShots', 'Technique'], ATT: ['LongShots', 'Technique'] } },
  { id: 'workIntoBox', when: [['Patience', [2]]], who: { MIL: ['Passing', 'Vision', 'Composure'], ATT: ['Technique', 'Composure', 'Decisions'] } },
  { id: 'crossEarly', when: [['Patience', [0]]], who: { wide: ['Crossing', 'Technique'], ATT: ['Heading', 'JumpingReach', 'Movement'] } },
  { id: 'width', when: [['TeamWidth', [3, 4]]], who: { wide: ['Crossing', 'Pace', 'Stamina'] } },
  { id: 'counter', when: [['AttackingTransition', [2]]], who: { MIL: ['Pace', 'Acceleration', 'Decisions'], ATT: ['Pace', 'Acceleration', 'Movement', 'Decisions'] } },
  { id: 'counterPress', when: [['DefensiveTransition', [2]]], who: { DEF: ['Aggression', 'Acceleration', 'Anticipation'], MIL: ['WorkRate', 'Stamina', 'Aggression', 'Teamwork'], ATT: ['WorkRate', 'Stamina', 'Aggression'] } },
  { id: 'press', when: [['LineOfEngagement', [2]], ['PressingTrigger', [3, 4]]], who: { DEF: ['Acceleration', 'Anticipation', 'Teamwork'], MIL: PRESS, ATT: PRESS } },
  { id: 'highLine', when: [['DefensiveLine', [3, 4]], ['DefensiveLineBehaviour', [0]]], who: { GB: ['RushingOut', 'OneOnOnes', 'Acceleration'], DEF: ['Pace', 'Acceleration', 'Anticipation', 'Positioning'] } },
  { id: 'lowBlock', when: [['LineOfEngagement', [0]], ['DefensiveLine', [0, 1]]], who: { DEF: ['Positioning', 'Marking', 'Heading', 'Concentration'], MIL: ['Positioning', 'Teamwork', 'Concentration'] } },
  { id: 'tackleHarder', when: [['Tackling', [2]]], who: { DEF: ['Tackling', 'Aggression', 'Bravery'], MIL: ['Tackling', 'Aggression', 'Bravery'] } },
];

/** Consignes d'équipe (identifiant du jeu → index de l'option) d'après les libellés d'un style. */
export function styleTeamInstructions(style: StyleRef | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of [...(style?.inPossession ?? []), ...(style?.outOfPossession ?? [])]) {
    const m = teamInstructionOf(l);
    if (m) out[m.def.id] = m.option;
  }
  return out;
}

/** Exigences actives de la tactique, avec la consigne du jeu qui crée chacune (« Titre : valeur »). */
export function activeDemands(ti: Record<string, number>): { def: DemandDef; instruction: string }[] {
  const out: { def: DemandDef; instruction: string }[] = [];
  for (const def of TEAM_DEMANDS) {
    for (const [code, options] of def.when) {
      const ins = TEAM_INSTRUCTIONS_FM27.find((d) => d.code === code);
      const o = ins ? ti[ins.id] : undefined;
      if (ins && o != null && options.includes(o)) {
        out.push({ def, instruction: `${ins.title} : ${ins.short[o] ?? ins.options[o]}` });
        break;
      }
    }
  }
  return out;
}

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

/** Attributs demandés par une exigence au joueur de ce poste (null : la consigne ne le concerne pas). */
function demandAttrs(who: Who, pos: PosCode): string[] | null {
  const line = lineOf(pos);
  const a = [...(who[line] ?? []), ...(WIDE.has(pos) && line !== 'GB' ? (who.wide ?? []) : [])];
  return a.length ? [...new Set(a)] : null;
}

export const letterOf = (score: number): PlanLetter => (PLAN_LETTERS.find((l) => l === 'E' || score >= PLAN_STEPS[l]) ?? 'E');

export interface GradeInput {
  /** Écart (sur 20) entre sa meilleure note possible et sa note au meilleur rôle du projet ; null = aucun poste du projet. */
  gap: number | null;
  /** Compatibilité de compat.ts, qui plafonne la lettre. */
  compat: 'yes' | 'partial' | 'no';
  /** Poste du projet où il est le plus adapté. */
  pos: PosCode | null;
  style: StyleRef;
  /** Consignes d'équipe de la tactique (identifiant du jeu → index de l'option). */
  ti: Record<string, number>;
}

export function planGrade(p: FmPlayer, g: GradeInput): PlanGrade {
  const parts: GradePart[] = [];
  if (g.gap == null || !g.pos) {
    return { letter: 'E', score: 0, parts: [{ id: 'role', score: 0, weight: GRADE_WEIGHTS.role, vals: { stars: '–' } }], demands: [], capped: false };
  }
  const pos = g.pos;
  // Rôle : 1 point sur 20 = une demi-étoile ; une étoile et demie d'écart (3 points) = 10/100.
  parts.push({ id: 'role', score: clamp(100 - g.gap * 30), weight: GRADE_WEIGHTS.role, vals: { stars: Math.round(g.gap * 10) / 10 } });

  // Poste : naturel = 100 ; sinon familiarité du jeu (1-20) ; à défaut, jugé apte d'après ses étoiles.
  const fam = p.positions.includes(pos) ? 20 : (p.familiarity?.[pos] ?? null);
  parts.push({ id: 'position', score: fam == null ? 60 : clamp(fam * 5), weight: GRADE_WEIGHTS.position, vals: { pos, fam: fam ?? '–', natural: p.positions.includes(pos) ? 1 : 0 } });

  // Consignes d'équipe : attributs demandés à sa ligne, comparés à son propre niveau (+4 = 100, niveau = 50, −4 = 0).
  const level = p.level ?? avg(Object.values(p.attributes));
  const demands: DemandFit[] = [];
  if (level != null)
    for (const { def, instruction } of activeDemands(g.ti)) {
      const keys = demandAttrs(def.who, pos);
      if (!keys) continue;
      const attrs = keys.map((key) => ({ key, value: attrOf(p, key) })).filter((x): x is { key: string; value: number } => x.value != null);
      const m = avg(attrs.map((x) => x.value));
      if (m == null) continue;
      const edge = Math.round((m - level) * 10) / 10;
      demands.push({ id: def.id, instruction, attrs, edge, score: clamp(50 + edge * 12.5) });
    }
  demands.sort((a, b) => b.edge - a.edge);
  if (demands.length) parts.push({ id: 'demands', score: clamp(avg(demands.map((d) => d.score))!), weight: GRADE_WEIGHTS.demands, vals: { count: demands.length } });

  // Lecture du jeu : un style complexe (tiki-taka, gegenpress) demande plus de décisions, d'anticipation, de placement.
  const reading = avg(TACT_ABILITY.map((k) => attrOf(p, k)));
  if (reading != null) {
    const need = abilityNeeded(g.style);
    parts.push({ id: 'reading', score: clamp(60 + (reading - need) * 10), weight: GRADE_WEIGHTS.reading, vals: { value: Math.round(reading * 10) / 10, need: Math.round(need * 10) / 10 } });
  }

  // État d'esprit : une personnalité professionnelle apprend et applique les consignes, une personnalité difficile moins.
  if (p.personality) {
    const tone = personalityTone(p.personality);
    parts.push({ id: 'mind', score: tone === 'good' ? 100 : tone === 'bad' ? 20 : 60, weight: GRADE_WEIGHTS.mind, vals: { personality: p.personality, tone } });
  }

  const total = parts.reduce((s, x) => s + x.weight, 0);
  const score = clamp(parts.reduce((s, x) => s + x.score * x.weight, 0) / total);
  let letter = letterOf(score);
  // Un profil qui ne colle pas au rôle ne peut pas être « fait pour le projet », quoi qu'en disent les autres critères.
  const cap: PlanLetter | null = g.compat === 'no' ? 'D' : g.compat === 'partial' ? 'B' : null;
  const capped = !!cap && PLAN_LETTERS.indexOf(letter) < PLAN_LETTERS.indexOf(cap);
  if (capped) letter = cap!;
  return { letter, score, parts, demands, capped };
}
