import type { FmPlayer } from './player';
import type { PosCode } from './positions';
import { INVERTED, attrOf, avg, footInfo, sideOf, styleBlock, type Phase, type RoleRef, type Slot, type StyleRef, type TacticEngine } from './tactic';

/*
 * Consignes individuelles conseillées pour chaque titulaire, d'après ses attributs comparés à son
 * propre niveau, son poste, son pied, ses rôles et le style. Une consigne que le jeu verrouille
 * pour le rôle (le pressing d'un rôle « de couverture », par exemple) n'est jamais proposée :
 * à la place, on propose le rôle qui la débloque.
 */

export type InstructionId =
  | 'gkShort' | 'gkLong' | 'slowDown' | 'rushOut'
  | 'shootMore' | 'shootLess' | 'dribbleMore' | 'dribbleLess' | 'riskMore' | 'riskLess'
  | 'shortPass' | 'directPass' | 'cutInside' | 'crossMore' | 'crossByline' | 'crossToTarget' | 'crossLess'
  | 'holdPosition' | 'holdBall' | 'runBehind' | 'farPost' | 'nearPost' | 'roam' | 'lateRuns'
  | 'pressMore' | 'pressLess' | 'tackleHarder' | 'tackleLess' | 'markTighter';

export interface PlayerInstruction {
  id: InstructionId;
  phase: Phase;
  /** Écart à son niveau qui justifie la consigne : les plus marquées passent d'abord. */
  weight: number;
  /** Clé de la raison et ses valeurs (attributs sur 20, nom). */
  why: string;
  vals: Record<string, number | string>;
}

export interface RoleSwitch {
  phase: Phase;
  from: string;
  to: string;
  /** Consigne utile que le rôle actuel verrouille et que le nouveau rôle permet. */
  unlocks: InstructionId;
}

export interface PlayerAdvice {
  list: PlayerInstruction[];
  switches: RoleSwitch[];
}

/* ---------- Verrous du jeu par rôle ---------- */

export interface RoleLocks {
  /** Pressing imposé par le rôle : « less » interdit de presser plus, « more » interdit de presser moins. */
  press: 'less' | 'more' | null;
  /** Consignes que le rôle verrouille ou rend sans objet. */
  blocked: InstructionId[];
}

const tag = (r: RoleRef) => `${r.code} ${r.en}`;
// Rôles qui restent en couverture, en retrait ou haut en point d'appui : le jeu verrouille le pressing en « Moins souvent ».
const PRESS_LESS = /Screening|(?<!Wide )Covering|Dropping|Holding|Outlet|\b(SCRDM|SCRCM|CCB|CWCB|DROPDM|HFB|HWB|LHK|WOM|WOW|IOW|COAM|SOAM|COCF|SOCF)\b/;
// Rôles de pressing : le jeu verrouille le pressing en « Plus souvent ».
const PRESS_MORE = /Pressing|\b(PFB|PWB|PRSDM|PRSCM)\b/;

/**
 * Verrous déduits du nom des rôles et de l'écran Consignes de FM27 (pressing « Moins souvent »
 * verrouillé pour un rôle de couverture). À compléter rôle par rôle quand on en voit d'autres en jeu.
 */
export function roleLocks(r: RoleRef | undefined): RoleLocks {
  if (!r) return { press: null, blocked: [] };
  const s = tag(r);
  const blocked: InstructionId[] = [];
  const press = r.group === 'GK' ? null : PRESS_MORE.test(s) ? 'more' : PRESS_LESS.test(s) ? 'less' : null;
  if (press === 'less') blocked.push('pressMore');
  if (press === 'more') blocked.push('pressLess');
  // Le défenseur couvreur défend sa zone : le marquage serré va contre son rôle.
  if (/Covering (Wide )?Centre-Back|\b(CCB|CWCB)\b/.test(s)) blocked.push('markTighter');
  // Rôles qui se déplacent déjà librement ou restent déjà en place.
  if (/Free Role|False Nine|\b(FREE|F9)\b/.test(s)) blocked.push('roam');
  if (/Half[- ]Back|Holding|\bHB\b/.test(s)) blocked.push('holdPosition');
  return { press, blocked };
}

/** Ce qu'un rôle permet : la consigne n'est pas verrouillée. */
export const roleAllows = (r: RoleRef | undefined, id: InstructionId) => !roleLocks(r).blocked.includes(id);

/* ---------- Choix des consignes ---------- */

const POSSESSION = new Set(['possession', 'tikitaka', 'tikitaka-v']);
const DIRECT = new Set(['counter-direct', 'counter-fluid', 'longball']);
const CREATOR = new Set(['DLP', 'B2BPM', 'MFPM', 'AP', 'WP', 'PMWB', 'F9', 'FREE', 'BPCB', 'BPGK']);
const FULL_BACK = new Set(['FB', 'WB', 'IFB', 'IWB']);
const r1 = (x: number | null) => (x == null ? '–' : Math.round(x * 10) / 10);

/**
 * Consignes conseillées pour un titulaire : au plus 3 avec ballon et 2 sans ballon, les plus marquées
 * d'abord. Les consignes avec ballon tiennent compte du rôle avec ballon, celles sans ballon du rôle
 * sans ballon. Une consigne verrouillée par le rôle devient un changement de rôle proposé.
 */
export function playerInstructions(engine: TacticEngine, slot: Slot, style: StyleRef | null, team: Slot[] = []): PlayerAdvice {
  const p = slot.player;
  if (!p || !Object.keys(p.attributes).length) return { list: [], switches: [] };
  const ipRole = engine.roles.get(slot.ip);
  const oopRole = engine.roles.get(slot.oop);
  const g = ipRole?.group ?? oopRole?.group;
  const a = (k: string) => attrOf(p, k);
  const lv = p.level ?? 10;
  const m = (...ks: string[]) => avg(ks.map(a)) ?? lv;
  const hi = (k: string, d = 2.5) => a(k) != null && a(k)! >= lv + d;
  const lo = (k: string, d = 2.5) => a(k) != null && a(k)! <= lv - d;
  const strong = (ks: string[], d: number) => {
    const v = ks.map(a).filter((x): x is number => x != null);
    return v.length > 0 && avg(v)! >= lv + d && Math.min(...v) >= lv;
  };
  const wanted: PlayerInstruction[] = [];
  const add = (id: InstructionId, phase: Phase, weight: number, why: string, vals: Record<string, number | string> = {}) =>
    wanted.push({ id, phase, weight, why, vals });
  const possession = !!style && POSSESSION.has(style.id);
  const direct = !!style && DIRECT.has(style.id);

  if (g === 'GK') {
    if (strong(['Kicking', 'Passing'], 1.5) || (possession && (a('Passing') ?? 0) >= lv)) add('gkShort', 'ip', m('Kicking', 'Passing') - lv, 'gkShort');
    else if (hi('Kicking', 1.5)) add('gkLong', 'ip', a('Kicking')! - lv, 'gkLong', { a: r1(a('Kicking')) });
    if (lo('Passing', 2) && possession) add('slowDown', 'ip', lv - a('Passing')!, 'slowDown');
    if (hi('RushingOut', 2) && style && styleBlock(style) === 'high') add('rushOut', 'oop', a('RushingOut')! - lv, 'rushOut');
    return pick(wanted, ipRole, oopRole, engine, slot, 3, 3);
  }

  const attack = g === 'WG' || g === 'AM' || g === 'ST';
  // Avec ballon
  if (hi('LongShots') && g !== 'CB') add('shootMore', 'ip', a('LongShots')! - lv, 'shootMore', { a: r1(a('LongShots')) });
  else if (attack && lo('LongShots', 2) && lo('Finishing', 1)) add('shootLess', 'ip', lv - a('LongShots')!, 'shootLess');
  if (strong(['Dribbling', 'Flair'], 2.5) && g !== 'CB') add('dribbleMore', 'ip', m('Dribbling', 'Flair') - lv, 'dribbleMore', { a: r1(a('Dribbling')), b: r1(a('Flair')) });
  else if (lo('Dribbling') && g !== 'CB') add('dribbleLess', 'ip', lv - a('Dribbling')!, 'dribbleLess', { a: r1(a('Dribbling')) });
  if (strong(['Passing', 'Vision', 'Decisions'], 2) && (CREATOR.has(slot.ip) || attack)) add('riskMore', 'ip', m('Passing', 'Vision', 'Decisions') - lv, 'riskMore', { a: r1(a('Passing')), b: r1(a('Vision')) });
  else if (m('Passing', 'Decisions') <= lv - 2) add('riskLess', 'ip', lv - m('Passing', 'Decisions'), 'riskLess');
  if (lo('Passing', 2) && possession) add('shortPass', 'ip', lv - a('Passing')!, 'shortPass', { a: r1(a('Passing')) });
  else if (direct && hi('Passing', 1.5) && hi('Vision', 1.5)) add('directPass', 'ip', m('Passing', 'Vision') - lv, 'directPass');
  const side = sideOf(slot.pos);
  if (side && g !== 'CB') {
    const fi = footInfo(p);
    const strongSide = fi.strong === 'L' || fi.strong === 'R' ? fi.strong : null;
    if (INVERTED.has(slot.ip) || (strongSide && strongSide !== side && m('Dribbling', 'Finishing') >= lv))
      add('cutInside', 'ip', 1.5, `cutInside.${strongSide ?? (side === 'L' ? 'R' : 'L')}${side}`);
    else if (hi('Crossing', 1.5)) {
      add('crossMore', 'ip', a('Crossing')! - lv, 'crossMore', { a: r1(a('Crossing')) });
      if (hi('Acceleration', 1.5) || hi('Pace', 1.5)) add('crossByline', 'ip', m('Pace', 'Acceleration') - lv, 'crossByline');
      const tgt = team
        .filter((s) => s.player && s.pos === 'BT')
        .map((s) => s.player!)
        .sort((x, y) => (attrOf(y, 'Heading') ?? 0) - (attrOf(x, 'Heading') ?? 0))[0];
      if (tgt && (attrOf(tgt, 'Heading') ?? 0) >= (tgt.level ?? 10) + 1.5) add('crossToTarget', 'ip', 1.2, 'crossToTarget', { name: tgt.name.split(' ').at(-1)! });
    } else if (lo('Crossing', 2)) add('crossLess', 'ip', lv - a('Crossing')!, 'crossLess', { a: r1(a('Crossing')) });
    if (FULL_BACK.has(slot.ip) && m('Pace', 'Stamina') <= lv - 1.5) add('holdPosition', 'ip', lv - m('Pace', 'Stamina'), 'holdPositionFb');
  }
  if (g === 'ST' || slot.ip === 'SS') {
    if (strong(['Strength', 'Balance', 'FirstTouch'], 1.5)) add('holdBall', 'ip', m('Strength', 'Balance', 'FirstTouch') - lv, 'holdBall', { a: r1(a('Strength')), b: r1(a('FirstTouch')) });
    if (strong(['Movement', 'Anticipation', 'Acceleration'], 1.5)) add('runBehind', 'ip', m('Movement', 'Anticipation', 'Acceleration') - lv, 'runBehind');
    if (hi('Heading', 2)) add('farPost', 'ip', a('Heading')! - lv, 'farPost', { a: r1(a('Heading')) });
    else if (strong(['Acceleration', 'Movement'], 1.5)) add('nearPost', 'ip', m('Acceleration', 'Movement') - lv - 0.5, 'nearPost');
    if (strong(['Movement', 'Vision', 'Flair'], 2.5)) add('roam', 'ip', m('Movement', 'Vision', 'Flair') - lv, 'roam');
  }
  if ((g === 'CM' || g === 'AM' || g === 'DM') && strong(['Movement', 'Finishing', 'LongShots'], 1.5) && slot.ip !== 'DM' && slot.ip !== 'HB')
    add('lateRuns', 'ip', m('Movement', 'Finishing', 'LongShots') - lv, 'lateRuns');
  if (g === 'DM' && hi('Teamwork', 1.5) && hi('Positioning', 1.5)) add('holdPosition', 'ip', m('Teamwork', 'Positioning') - lv, 'holdPositionDm');

  // Sans ballon
  const pressV = m('WorkRate', 'Stamina', 'Aggression');
  if (strong(['WorkRate', 'Stamina', 'Aggression'], 2) && g !== 'CB') add('pressMore', 'oop', pressV - lv, 'pressMore');
  else if (lo('Stamina') || pressV <= lv - 2) add('pressLess', 'oop', lv - Math.min(a('Stamina') ?? lv, pressV), 'pressLess', { a: r1(a('Stamina')) });
  if (strong(['Tackling', 'Aggression', 'Bravery'], 2) && (g === 'CB' || g === 'FB' || g === 'DM' || g === 'CM'))
    add('tackleHarder', 'oop', m('Tackling', 'Aggression', 'Bravery') - lv, 'tackleHarder', { a: r1(a('Tackling')), b: r1(a('Aggression')) });
  else if (lo('Tackling') && (g === 'CB' || g === 'FB' || g === 'DM')) add('tackleLess', 'oop', lv - a('Tackling')!, 'tackleLess');
  if (strong(['Marking', 'Strength'], 2) && (g === 'CB' || g === 'FB' || g === 'DM')) add('markTighter', 'oop', m('Marking', 'Strength') - lv, 'markTighter', { a: r1(a('Marking')), b: r1(a('Strength')) });

  return pick(wanted, ipRole, oopRole, engine, slot, 3, 2);
}

const SWITCHABLE = new Set<InstructionId>(['pressMore', 'pressLess', 'markTighter']);

/** Écarte les consignes verrouillées par le rôle de leur phase (et propose le rôle qui les débloque), puis garde les plus marquées. */
function pick(wanted: PlayerInstruction[], ipRole: RoleRef | undefined, oopRole: RoleRef | undefined, engine: TacticEngine, slot: Slot, maxIp: number, maxOop: number): PlayerAdvice {
  const seen = new Set<string>();
  const sorted = [...wanted].sort((x, y) => y.weight - x.weight).filter((x) => !seen.has(x.id) && !!seen.add(x.id));
  const list: PlayerInstruction[] = [];
  const switches: RoleSwitch[] = [];
  for (const x of sorted) {
    const role = x.phase === 'ip' ? ipRole : oopRole;
    if (roleAllows(role, x.id)) list.push(x);
    // Un rôle qui fait déjà la consigne (rôle libre, demi-défenseur) n'a pas besoin d'un autre rôle.
    else if (role && SWITCHABLE.has(x.id)) {
      const alt = unlockingRole(engine, slot, x.phase, x.id);
      if (alt && alt.code !== role.code) switches.push({ phase: x.phase, from: role.code, to: alt.code, unlocks: x.id });
    }
  }
  return {
    list: [...list.filter((x) => x.phase === 'ip').slice(0, maxIp), ...list.filter((x) => x.phase === 'oop').slice(0, maxOop)],
    switches: switches.slice(0, 1),
  };
}

/** Meilleur rôle de la même phase et du même poste qui permet la consigne (un rôle de pressing pour presser plus). */
function unlockingRole(engine: TacticEngine, slot: Slot, phase: Phase, id: InstructionId): RoleRef | null {
  const p = slot.player;
  if (!p) return null;
  const pos: PosCode = slot.pos;
  let best: { r: RoleRef; f: number } | null = null;
  for (const r of engine.ref.roles) {
    if (!engine.availableAt(r, pos, phase) || !roleAllows(r, id)) continue;
    // Pour presser plus, on vise un vrai rôle de pressing quand le poste en a un.
    const bonus = id === 'pressMore' && roleLocks(r).press === 'more' ? 1 : 0;
    const f = (engine.roleFit(p, r.code, phase, pos) ?? 0) + bonus;
    if (!best || f > best.f) best = { r, f };
  }
  return best?.r ?? null;
}
