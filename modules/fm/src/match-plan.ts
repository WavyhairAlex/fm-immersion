import type { OpponentReport } from './opponent';
import { strikersOf } from './opponent';
import type { PosCode } from './positions';
import type { FormationPlan, StyleRef } from './tactic';
import { FORMATIONS, attrOf } from './tactic';
import { MENTALITIES_FM27, TEAM_INSTRUCTIONS_FM27, teamInstructionOf, type TeamInstructionDef } from './team-instructions-fm27';

/**
 * Plan de match : les réglages concrets à faire dans le jeu contre le prochain adversaire, sans changer de
 * style ni de schéma (ça, c'est `rankForMatch`). Chaque réglage est une option de l'écran Consignes d'équipe
 * de FM27, choisie par une règle de football à partir du rapport d'équipe adverse (pressing, marquage,
 * formation, mentalité, défense qui concède), et retirée après le match. Règle « une base, des ajustements » :
 * au plus `MAX_TEAM_ADJUSTMENTS` consignes changées, et jamais une consigne que le style règle déjà pareil.
 */

export type AdjustReason = 'highPress' | 'lowPress' | 'manMarking' | 'zonalMarking' | 'screened' | 'betweenLines' | 'lowBlock' | 'attacking' | 'twoStrikers' | 'leaky' | 'threat';

export interface TeamAdjustment {
  phase: 'ip' | 'oop';
  /** Option du jeu à cocher (libellé long, comme dans `TEAM_INSTRUCTIONS_FM27.options`). */
  label: string;
  /** Titre de la case du jeu (« Caract. direct des passes »). */
  title: string;
  /** Ce que le style règle dans la même case, à remplacer le temps du match ; null si la case était standard. */
  replaces: string | null;
  reason: AdjustReason;
}

export interface MentalityAdjustment {
  from: string;
  to: string;
  reason: AdjustReason;
}

export interface MarkingAdjustment {
  /** Joueur adverse à surveiller. */
  target: string;
  positions: string | null;
  reason: 'creator' | 'scorer';
  /** Notre joueur chargé de lui (index dans `plan.slots`), s'il se déduit des postes. */
  slot: number | null;
  player: string | null;
}

export interface MatchPlan {
  mentality: MentalityAdjustment | null;
  team: TeamAdjustment[];
  marking: MarkingAdjustment[];
}

export const MAX_TEAM_ADJUSTMENTS = 4;

const byId = new Map(TEAM_INSTRUCTIONS_FM27.map((d) => [d.id, d]));

/** Consignes réglées par le style : identifiant de case → option. */
export function styleOptions(style: StyleRef): Map<number, number> {
  const out = new Map<number, number>();
  for (const l of [...style.inPossession, ...style.outOfPossession]) {
    const m = teamInstructionOf(l);
    if (m && !out.has(m.def.id)) out.set(m.def.id, m.option);
  }
  return out;
}

const isHigh = (press: string | null | undefined) => /plus|more|souvent|often/.test(press?.toLowerCase() ?? '') && !/moins|less/.test(press?.toLowerCase() ?? '');
const isLow = (press: string | null | undefined) => /moins|less|rarement|rarely/.test(press?.toLowerCase() ?? '');
/** Niveau de menace du prochain match tel que le jeu l'écrit (« Élevé », « High »…) : fort si l'adversaire est au-dessus. */
export const isHighThreat = (threat: string | null | undefined) => /élev|elev|high|fort|strong|très|very|maxim/.test(threat?.toLowerCase() ?? '');

function count(form: string, ...codes: PosCode[]) {
  return (FORMATIONS[form] ?? []).filter(([p]) => codes.includes(p)).length;
}

/** Qui, chez nous, doit s'occuper d'un joueur adverse d'après ses postes (« M (DG), MO (DGC) », « BT (C) »). */
function markerFor(plan: FormationPlan | null | undefined, positions: string | null): { slot: number; player: string } | null {
  if (!plan || !positions) return null;
  const parts = positions.split(',').map((s) => s.trim());
  let ours: PosCode[] = [];
  for (const part of parts) {
    const m = part.match(/^([A-Za-zÀ-ÿ/]+)\s*\(([A-Z]+)\)/);
    const roles = (m?.[1] ?? part).toUpperCase();
    const sides = m?.[2] ?? '';
    if (/BT|ST/.test(roles)) ours = ['DC'];
    else if (/MO|AM|^M\b|MC|MDF|DM/.test(roles) && /C/.test(sides)) ours = ['MDF', 'MC'];
    else if (/G|L/.test(sides)) ours = ['DD', 'DLD'];
    else if (/D|R/.test(sides)) ours = ['DG', 'DLG'];
    if (ours.length) break;
  }
  if (!ours.length) return null;
  let best: { slot: number; player: string; v: number } | null = null;
  for (const [i, sl] of plan.slots.entries()) {
    if (!sl.player || !ours.includes(sl.pos)) continue;
    const v = ((attrOf(sl.player, 'Marking') ?? 10) + (attrOf(sl.player, 'Tackling') ?? 10) + (attrOf(sl.player, 'Pace') ?? 10)) / 3;
    if (!best || v > best.v) best = { slot: i, player: sl.player.name, v };
  }
  return best ? { slot: best.slot, player: best.player } : null;
}

/** Les réglages du match contre l'adversaire lu, à partir du style de base et du onze prévu. */
export function matchPlan(style: StyleRef, opp: OpponentReport, plan?: FormationPlan | null, threat?: string | null): MatchPlan {
  const set = styleOptions(style);
  const team: TeamAdjustment[] = [];
  const touched = new Set<number>();
  const want = (id: number, option: number, reason: AdjustReason, unless?: (cur: number | undefined) => boolean) => {
    const def = byId.get(id) as TeamInstructionDef | undefined;
    if (!def || touched.has(id)) return;
    const cur = set.get(id);
    if (cur === option || (unless && unless(cur))) return;
    const label = def.options[option];
    if (!label) return;
    touched.add(id);
    team.push({ phase: def.phase === 'oop' ? 'oop' : 'ip', label, title: def.title, replaces: cur != null ? (def.options[cur] ?? null) : null, reason });
  };

  const m = opp.manager;
  const ip = opp.formations.ip[0]?.form ?? m.formation ?? null;
  const oop = opp.formations.oop[0]?.form ?? ip;
  const form = plan?.form ?? '';
  const ment = m.mentality?.toLowerCase() ?? '';

  // 1. Leur pressing décide de notre construction.
  if (isHigh(m.pressing)) {
    want(24, 2, 'highPress'); // Contourner le pressing
    want(1, 3, 'highPress', (cur) => cur != null && cur >= 3); // Faites plus de passes directes
    want(20, 2, 'highPress'); // Passer dans les espaces
    want(29, 2, 'highPress'); // Longs dégagements au pied
  } else if (isLow(m.pressing)) {
    want(24, 0, 'lowPress'); // Jouer malgré le pressing
    want(16, 1, 'lowPress', (cur) => cur != null && cur > 0); // Relancez vers défenseurs centraux
  }
  // 2. Deux attaquants et pas de couverture dans notre schéma : la ligne recule.
  const strikers = strikersOf(ip);
  if (strikers != null && strikers >= 2 && form && count(form, 'MDF') < 2 && count(form, 'DC') < 3) {
    want(9, 1, 'twoStrikers', (cur) => cur != null && cur <= 1); // Ligne défensive plus basse
    want(15, 2, 'twoStrikers'); // Rester plus bas
  }
  // 3. Leur organisation sans ballon : axe fermé → largeur ; deux lignes de quatre → l'axe.
  if (oop && /MD|DM/.test(oop)) {
    want(4, 3, 'screened', (cur) => cur != null && cur >= 3); // Plus large
    want(30, 4, 'screened'); // Jouez sur les deux flancs
  } else if (oop && /^\d-4-\d$/.test(oop.replace(/\s/g, '').match(/\d(?:-\d)+/)?.[0] ?? '')) {
    want(30, 1, 'betweenLines'); // Concentrez le jeu dans l'axe
  }
  // 4. Leur marquage : individuel → liberté et permutations ; en zone → surnombre intérieur.
  const mark = m.marking?.toLowerCase() ?? '';
  if (/indiv|man/.test(mark)) want(5, 2, 'manMarking'); // Soyez plus expressifs
  else if (/zon/.test(mark)) want(28, 3, 'zonalMarking'); // Cherchez le dédoublement intérieur
  // 5. Leur mentalité : prudente → bloc bas à faire bouger ; offensive → espace dans leur dos.
  if (/défens|defens|prud|caut/.test(ment)) {
    want(18, 2, 'lowBlock'); // Jouer le ballon dans la surface
    want(4, 3, 'lowBlock', (cur) => cur != null && cur >= 3); // Plus large
  } else if (/offens|attack|positi/.test(ment)) {
    want(3, 2, 'attacking'); // Contrez
    want(20, 2, 'attacking'); // Passer dans les espaces
  }

  // Mentalité : un cran de plus face à une défense qui concède, un cran de moins face à plus fort.
  const base = MENTALITIES_FM27.findIndex((x) => x.toLowerCase() === style.mentality?.toLowerCase());
  const from = base >= 0 ? base : MENTALITIES_FM27.indexOf('Équilibrée');
  let to = from;
  let reason: AdjustReason | null = null;
  const leak = opp.formations.oop[0]?.every;
  if (leak != null && leak <= 30 && to < MENTALITIES_FM27.indexOf('Offensive')) {
    to++;
    reason = 'leaky';
  }
  if (isHighThreat(threat) && to > MENTALITIES_FM27.indexOf('Défensive')) {
    to--;
    reason = 'threat';
  }
  const mentality: MentalityAdjustment | null = to !== from && reason ? { from: MENTALITIES_FM27[from]!, to: MENTALITIES_FM27[to]!, reason } : null;

  // Marquage : le créateur d'abord, puis le buteur s'il est un autre joueur.
  const marking: MarkingAdjustment[] = [];
  const posOf = (name: string) => opp.squad.find((p) => p.name === name)?.positions ?? null;
  const creator = opp.assister?.name ?? opp.rated?.name ?? null;
  if (creator) {
    const positions = posOf(creator);
    const who = markerFor(plan, positions);
    marking.push({ target: creator, positions, reason: 'creator', slot: who?.slot ?? null, player: who?.player ?? null });
  }
  if (opp.scorer && opp.scorer.name !== creator) {
    const positions = posOf(opp.scorer.name);
    const who = markerFor(plan, positions);
    marking.push({ target: opp.scorer.name, positions, reason: 'scorer', slot: who?.slot ?? null, player: who?.player ?? null });
  }

  return { mentality, team: team.slice(0, MAX_TEAM_ADJUSTMENTS), marking };
}
