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

/**
 * Qui, chez nous, doit s'occuper d'un joueur adverse d'après ses postes (« M (DG), MO (DGC) », « BT (C) »). Un joueur
 * déjà chargé d'un autre adversaire (`taken`) n'est pas repris : on ne demande jamais à un seul homme d'en marquer deux.
 */
function markerFor(plan: FormationPlan | null | undefined, positions: string | null, taken: ReadonlySet<number> = new Set()): { slot: number; player: string } | null {
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
    if (!sl.player || !ours.includes(sl.pos) || taken.has(i)) continue;
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

  // Marquage : le créateur d'abord, puis le buteur s'il est un autre joueur, chacun avec son propre marqueur.
  const marking: MarkingAdjustment[] = [];
  const taken = new Set<number>();
  const posOf = (name: string) => opp.squad.find((p) => p.name === name)?.positions ?? null;
  const assign = (target: string, reason: MarkingAdjustment['reason']) => {
    const positions = posOf(target);
    const who = markerFor(plan, positions, taken);
    if (who) taken.add(who.slot);
    marking.push({ target, positions, reason, slot: who?.slot ?? null, player: who?.player ?? null });
  };
  const creator = opp.assister?.name ?? opp.rated?.name ?? null;
  if (creator) assign(creator, 'creator');
  if (opp.scorer && opp.scorer.name !== creator) assign(opp.scorer.name, 'scorer');

  return { mentality, team: team.slice(0, MAX_TEAM_ADJUSTMENTS), marking };
}

/* ---------- Écran « Adversaire » du jeu : consignes sur leurs joueurs ---------- */

export type OppInstructionReason = 'creator' | 'scorer' | 'rated' | 'pressBuildUp' | 'pressWeak' | 'softTackle' | 'weakFoot';

export interface OppositionInstruction {
  name: string;
  positions: string | null;
  stars: number | null;
  /** Marquage strict : « Toujours ». */
  marking: 'always' | null;
  /** Déclenchement du pressing : « Toujours » ou « Jamais ». */
  pressing: 'always' | 'never' | null;
  /** Tacles : « Plus engagés » ou « Plus doux ». */
  tackling: 'harder' | 'softer' | null;
  /** Forcer mauvais pied : le pied vers lequel l'orienter (son pied faible). */
  weakFoot: 'left' | 'right' | null;
  reasons: OppInstructionReason[];
}

/** Joueurs adverses à presser « Toujours » au plus (gardien et défenseurs centraux). */
export const MAX_PRESS_TARGETS = 3;

const roleOf = (positions: string | null) => {
  const p = (positions ?? '').toUpperCase();
  return {
    gk: /\bGB\b|\bGK\b/.test(p),
    cb: /\bD\b[^,]*\([^)]*C/.test(p) || /\bDC\b/.test(p),
    attack: /\bBT\b|\bST\b|\bMO\b|\bAM\b|\bAL\b|\bMG\b|\bMD\b(?!\s*\(C)/.test(p),
  };
};

/** Pied faible d'après le texte du jeu : null si des deux pieds ou inconnu. */
export function weakFootOf(foot: string | null): 'left' | 'right' | null {
  const f = (foot ?? '').toLowerCase();
  if (!f || /deux|ambi|both|either/.test(f)) return null;
  if (/gauch|left/.test(f)) return 'right';
  if (/droit|right/.test(f)) return 'left';
  return null;
}

/**
 * Ce qu'on règle dans l'écran Adversaire du jeu (joueur par joueur) à partir du rapport d'équipe : marquage strict sur
 * les joueurs clés (créateur, buteur, meilleure moyenne), pressing « Toujours » sur leur gardien et leurs centraux quand
 * on presse haut, ou sur les moins bien notés d'entre eux sinon (forcer la faute à la relance), tacles plus doux sur
 * le créateur s'il joue devant (ne pas offrir de coups francs), et le pied faible des joueurs clés s'il est lu.
 * Seuls les joueurs qui reçoivent au moins une consigne sont renvoyés.
 */
export function oppositionInstructions(opp: OpponentReport, style?: StyleRef | null): OppositionInstruction[] {
  const rows = new Map<string, OppositionInstruction>();
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) {
      const sq = opp.squad.find((p) => p.name === name);
      r = { name, positions: sq?.positions ?? null, stars: sq?.stars ?? null, marking: null, pressing: null, tackling: null, weakFoot: null, reasons: [] };
      rows.set(name, r);
    }
    return r;
  };
  const key: [string | null | undefined, OppInstructionReason][] = [
    [opp.assister?.name, 'creator'],
    [opp.scorer?.name, 'scorer'],
    [opp.rated?.name, 'rated'],
  ];
  for (const [name, reason] of key) {
    if (!name) continue;
    const r = row(name);
    r.marking = 'always';
    if (!r.reasons.includes(reason)) r.reasons.push(reason);
    const wf = weakFootOf(opp.squad.find((p) => p.name === name)?.foot ?? null);
    if (wf && !r.weakFoot) {
      r.weakFoot = wf;
      r.reasons.push('weakFoot');
    }
    if (reason === 'creator' && roleOf(r.positions).attack && !r.tackling) {
      r.tackling = 'softer';
      r.reasons.push('softTackle');
    }
  }
  // Pressing : la relance adverse. Pressing haut → gardien et centraux ; sinon seulement les moins bien notés d'entre eux.
  const high = !!style && /pressing haut|high press/i.test(style.outOfPossession.join(' '));
  const backs = opp.squad.filter((p) => {
    const r = roleOf(p.positions);
    return r.gk || r.cb;
  });
  const known = backs.filter((p) => p.stars != null);
  const median = known.length ? [...known].sort((a, b) => a.stars! - b.stars!)[Math.floor(known.length / 2)]!.stars! : null;
  const targets = (high ? backs : known.filter((p) => median != null && p.stars! < median)).sort((a, b) => (a.stars ?? 99) - (b.stars ?? 99)).slice(0, MAX_PRESS_TARGETS);
  for (const p of targets) {
    const r = row(p.name);
    r.pressing = 'always';
    r.reasons.push(high ? 'pressBuildUp' : 'pressWeak');
  }
  return [...rows.values()];
}
