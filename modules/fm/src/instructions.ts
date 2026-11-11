import type { FmPlayer } from './player';
import type { PosCode } from './positions';
import { POSITION_OPTIONS_OFF, ROLE_LOCKS_FM27, type GamePos, type RoleLockEntry } from './instruction-locks-fm27';
import { LEGACY_PI, piKeyGroup } from './player-instructions-fm27';
import { MIN_STAT_MINUTES, type PlayerStats } from './stats';
import { INVERTED, attrOf, avg, footInfo, sideOf, slotContexts, styleBlock, type Phase, type SlotCtx, type RoleRef, type Slot, type StyleRef, type TacticEngine } from './tactic';

/*
 * Consignes individuelles conseillées pour chaque titulaire, d'après ses attributs comparés à son
 * propre niveau, son poste, son pied, ses rôles et le style. Une consigne que le jeu verrouille
 * pour le poste ou le rôle (le pressing d'un rôle « de couverture », par exemple) n'est jamais
 * proposée : à la place, on propose le rôle qui la débloque.
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

/** Groupes de consignes individuelles de FM27 (identifiants du jeu) : 13 avec ballon, 4 sans ballon. */
export type InstructionGroup =
  | 'AttackingWidth' | 'DribblingDirection' | 'DribblingFrequency' | 'ForwardRuns' | 'FreedomOfMovement' | 'HoldUpBall'
  | 'Shooting' | 'PassingRisk' | 'PassingStrategy' | 'CrossFrom' | 'CrossingStrategy' | 'AttackBoxSide' | 'AttackBoxDepth'
  | 'TriggerPress' | 'Marking' | 'Tackling' | 'MarkingTarget';

/** Groupe du jeu que règle chaque consigne conseillée, et l'option du jeu qu'elle choisit (libellé FR). */
export const INSTRUCTION_GROUP: Partial<Record<InstructionId, InstructionGroup>> = {
  gkShort: 'PassingStrategy', gkLong: 'PassingStrategy', slowDown: 'HoldUpBall',
  shootMore: 'Shooting', shootLess: 'Shooting', dribbleMore: 'DribblingFrequency', dribbleLess: 'DribblingFrequency',
  riskMore: 'PassingRisk', riskLess: 'PassingRisk', shortPass: 'PassingStrategy', directPass: 'PassingStrategy',
  cutInside: 'DribblingDirection', crossByline: 'CrossFrom', crossToTarget: 'CrossingStrategy',
  holdPosition: 'ForwardRuns', lateRuns: 'AttackBoxDepth', runBehind: 'AttackBoxDepth', holdBall: 'HoldUpBall', roam: 'FreedomOfMovement',
  farPost: 'AttackBoxSide', nearPost: 'AttackBoxSide',
  pressMore: 'TriggerPress', pressLess: 'TriggerPress', tackleHarder: 'Tackling', tackleLess: 'Tackling', markTighter: 'Marking',
};

const INSTRUCTION_OPTION: Partial<Record<InstructionId, string>> = {
  gkShort: 'Jouez plus court', gkLong: 'Plus de passes directes', shortPass: 'Jouez plus court', directPass: 'Plus de passes directes',
  riskMore: 'Prenez plus de risques', riskLess: 'Prenez moins de risques', dribbleMore: 'Dribblez plus', dribbleLess: 'Dribblez moins',
  cutInside: "Repiquez dans l'axe", holdPosition: 'Effectuez moins de courses', holdBall: 'Oui', roam: 'Décrochez plus souvent',
  lateRuns: 'Arriver en retard dans la surface', runBehind: 'Attaquer la ligne défensive', farPost: 'Second poteau', nearPost: 'Premier poteau',
  pressMore: 'Plus souvent', pressLess: 'Moins souvent',
};

/** Poste du jeu, avec son côté pour un poste axial placé excentré (x de gauche à droite, en %). */
export function gamePos(pos: PosCode, x = 50): GamePos {
  const side = x <= 42 ? 'G' : x >= 58 ? 'D' : '';
  switch (pos) {
    case 'DC': return side ? (`DC${side}` as GamePos) : 'DC';
    case 'MDF': return side ? (`MDF${side}` as GamePos) : 'MDF';
    case 'MC': return side ? (`MC${side}` as GamePos) : 'MC';
    case 'MOC': return side ? (`MOC${side}` as GamePos) : 'MO';
    case 'BT': return side ? (`BT${side}` as GamePos) : 'BT';
    default: return pos as GamePos;
  }
}

// Un rôle sans ballon se lit au poste sans ballon du joueur : un MO (D) défend en M (D).
const OOP_POS: Partial<Record<GamePos, GamePos>> = { MOD: 'MD', MOG: 'MG' };

/** Entrée de la table du jeu pour ce rôle et cette phase, au poste donné ou, à défaut, au premier poste qui le propose. */
function gameEntry(r: RoleRef, phase: Phase, gp?: GamePos): { entry: RoleLockEntry; pos: GamePos } | null {
  const code = phase === 'ip' ? r.game?.ip : r.game?.oop;
  if (!code) return null;
  const tries = gp ? [gp, ...(phase === 'oop' && OOP_POS[gp] ? [OOP_POS[gp]!] : [])] : [];
  for (const p of tries) {
    const e = ROLE_LOCKS_FM27[p]?.[code];
    if (e) return { entry: e, pos: p };
  }
  for (const p of Object.keys(ROLE_LOCKS_FM27) as GamePos[]) {
    const e = ROLE_LOCKS_FM27[p][code];
    if (e) return { entry: e, pos: p };
  }
  return null;
}

const tag = (r: RoleRef) => `${r.code} ${r.en}`;
// Rôles qui restent en couverture, en retrait ou haut en point d'appui : le jeu verrouille le pressing en « Moins souvent ».
const PRESS_LESS = /Screening|(?<!Wide )Covering|Dropping|Holding|Outlet|\b(SCRDM|SCRCM|CCB|CWCB|DROPDM|HFB|HWB|LHK|WOM|WOW|IOW|COAM|SOAM|COCF|SOCF)\b/;
// Rôles de pressing : le jeu verrouille le pressing en « Plus souvent ».
const PRESS_MORE = /Pressing|\b(PFB|PWB|PRSDM|PRSCM)\b/;

/** Consignes d'une phase que le jeu refuse ou impose déjà pour ce rôle à ce poste ; null si le rôle n'est pas dans la table. */
function gameBlocked(r: RoleRef, phase: Phase, gp?: GamePos): InstructionId[] | null {
  const hit = gameEntry(r, phase, gp);
  if (!hit) return null;
  const { entry } = hit;
  const posOff = POSITION_OPTIONS_OFF[gp ?? hit.pos] ?? {};
  const out: InstructionId[] = [];
  for (const id of Object.keys(INSTRUCTION_GROUP) as InstructionId[]) {
    const g = INSTRUCTION_GROUP[id]!;
    if (OOP_GROUPS.has(g) !== (phase === 'oop')) continue;
    const opt = INSTRUCTION_OPTION[id];
    if (entry.l?.includes(g) || entry.i?.[g] != null || (opt && (entry.o?.[g]?.includes(opt) || posOff[g]?.includes(opt)))) out.push(id);
  }
  // Consigne sans équivalent dans FM27 : la sortie du gardien dépend de son rôle sans ballon (Gardien-libéro).
  if (phase === 'oop' && r.group === 'GK') out.push('rushOut');
  return out;
}

const OOP_GROUPS = new Set<InstructionGroup>(['TriggerPress', 'Marking', 'Tackling', 'MarkingTarget']);

/**
 * Verrous d'un rôle, d'après la table du jeu (poste avec son côté, rôle, phase). Sans phase, les
 * deux phases du rôle. Un rôle absent de la table garde les verrous déduits de son nom.
 */
export function roleLocks(r: RoleRef | undefined, pos?: PosCode, x?: number, phase?: Phase): RoleLocks {
  if (!r) return { press: null, blocked: [] };
  const gp = pos ? gamePos(pos, x) : undefined;
  const phases: Phase[] = phase ? [phase] : ['ip', 'oop'];
  const blocked: InstructionId[] = [];
  let known = false;
  for (const ph of phases) {
    const b = gameBlocked(r, ph, gp);
    if (b) {
      known = true;
      blocked.push(...b);
    }
  }
  const oop = phases.includes('oop') ? gameEntry(r, 'oop', gp)?.entry : undefined;
  const imposedPress = oop?.i?.TriggerPress;
  const press: RoleLocks['press'] = oop
    ? imposedPress === 'Plus souvent' ? 'more' : imposedPress === 'Moins souvent' ? 'less' : null
    : known ? null : fallbackPress(r);
  if (!known) blocked.push(...fallbackBlocked(r, press));
  return { press, blocked: [...new Set(blocked)] };
}

function fallbackPress(r: RoleRef): RoleLocks['press'] {
  const s = tag(r);
  return r.group === 'GK' ? null : PRESS_MORE.test(s) ? 'more' : PRESS_LESS.test(s) ? 'less' : null;
}

/** Verrous déduits du nom des rôles, pour un rôle absent de la table du jeu. */
function fallbackBlocked(r: RoleRef, press: RoleLocks['press']): InstructionId[] {
  const s = tag(r);
  const blocked: InstructionId[] = [];
  if (press === 'less') blocked.push('pressMore');
  if (press === 'more') blocked.push('pressLess');
  if (/Free Role|False Nine|\b(FREE|F9)\b/.test(s)) blocked.push('roam');
  if (/Half[- ]Back|Holding|\bHB\b/.test(s)) blocked.push('holdPosition');
  return blocked;
}

/** Verrous du jeu pour un rôle dans une phase, au poste donné : groupes verrouillés, options imposées, options refusées (rôle et poste). */
export interface PhaseLocks {
  locked: InstructionGroup[];
  imposed: Partial<Record<InstructionGroup, string>>;
  refused: Partial<Record<InstructionGroup, string[]>>;
}

/** Verrous d'une phase ; null si le rôle n'est pas dans la table du jeu. */
export function phaseLocks(r: RoleRef | undefined, phase: Phase, pos?: PosCode, x?: number): PhaseLocks | null {
  if (!r) return null;
  const gp = pos ? gamePos(pos, x) : undefined;
  const hit = gameEntry(r, phase, gp);
  if (!hit) return null;
  const posOff = POSITION_OPTIONS_OFF[gp ?? hit.pos] ?? {};
  const refused: PhaseLocks['refused'] = {};
  for (const src of [hit.entry.o ?? {}, posOff]) {
    for (const [g, opts] of Object.entries(src) as [InstructionGroup, readonly string[]][]) refused[g] = [...(refused[g] ?? []), ...opts];
  }
  return { locked: [...(hit.entry.l ?? [])], imposed: { ...(hit.entry.i ?? {}) }, refused };
}

/** Le rôle impose déjà cette consigne (même groupe, même option) : inutile de la conseiller ou de changer de rôle pour elle. */
export function roleImposes(r: RoleRef | undefined, id: InstructionId, pos?: PosCode, x?: number): boolean {
  const g = INSTRUCTION_GROUP[id];
  const opt = INSTRUCTION_OPTION[id];
  if (!r || !g || !opt) return false;
  const phase: Phase = OOP_GROUPS.has(g) ? 'oop' : 'ip';
  return gameEntry(r, phase, pos ? gamePos(pos, x) : undefined)?.entry.i?.[g] === opt;
}

/** Ce qu'un rôle permet (au poste donné) : la consigne n'est ni refusée ni déjà imposée. */
export const roleAllows = (r: RoleRef | undefined, id: InstructionId, pos?: PosCode, x?: number) => !roleLocks(r, pos, x).blocked.includes(id);

/* ---------- Consignes conseillées face à celles réglées dans le jeu ---------- */

/** Clé du jeu (« Groupe:Option », libellé de l'écran de FM27) d'une consigne conseillée ; null si FM27 n'a pas cette consigne. */
export const instructionKey = (id: InstructionId): string | null => LEGACY_PI[id] ?? null;

/**
 * Où en est une consigne conseillée dans la tactique du jeu : déjà réglée (`done`), réglée à l'inverse dans le
 * même groupe (`conflict` : « Dribblez moins » alors qu'on conseille de dribbler plus), ou à ajouter (`todo`).
 * `keys` : consignes du joueur lues dans le jeu, choisies par lui ou imposées par le rôle.
 */
export function instructionState(id: InstructionId, keys: readonly string[]): { state: 'done' | 'conflict' | 'todo'; other?: string } {
  const key = instructionKey(id);
  if (!key) return { state: 'todo' };
  if (keys.includes(key)) return { state: 'done' };
  const other = keys.find((k) => piKeyGroup(k) === piKeyGroup(key));
  return other ? { state: 'conflict', other } : { state: 'todo' };
}

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
export function playerInstructions(engine: TacticEngine, slot: Slot, style: StyleRef | null, team: Slot[] = [], max = MAX_PER_PLAYER, stats?: PlayerStats | null): PlayerAdvice {
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
    return pick(wanted, ipRole, oopRole, engine, slot, 3, 3, ctxOf(slot, team), max);
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

  // Ce que ses matchs montrent passe avant ce que ses attributs laissent supposer.
  for (const x of statInstructions(stats)) {
    const opposite = OPPOSITE[x.id];
    for (let i = wanted.length - 1; i >= 0; i--) if (wanted[i]!.id === x.id || wanted[i]!.id === opposite) wanted.splice(i, 1);
    wanted.push(x);
  }

  return pick(wanted, ipRole, oopRole, engine, slot, 3, 2, ctxOf(slot, team), max);
}

const OPPOSITE: Partial<Record<InstructionId, InstructionId>> = { shootLess: 'shootMore', riskLess: 'riskMore', tackleLess: 'tackleHarder' };
/** Poids d'une consigne tirée des stats de match : devant celles tirées des attributs. */
const STAT_WEIGHT = 5;
/** Tirs par 90 min à partir desquels on regarde leur qualité, et xG par tir en dessous duquel il frappe de trop loin. */
export const STAT_SHOTS = 1.5;
export const STAT_SHOT_QUALITY = 0.06;
/** Passes réussies (%) en dessous desquelles un joueur de champ perd trop de ballons. */
export const STAT_PASS_PCT = 75;
/** Cartons jaunes par 90 min (au moins 3 jaunes) au-dessus desquels il se met en danger. */
export const STAT_YELLOW_90 = 0.3;

/**
 * Consignes que les stats de la saison d'un joueur de champ justifient (au moins MIN_STAT_MINUTES jouées) : il tire
 * beaucoup pour peu de danger, perd trop de passes, ou prend trop de cartons.
 */
export function statInstructions(stats: PlayerStats | null | undefined): PlayerInstruction[] {
  const s = stats;
  if (!s || (s.minutes ?? 0) < MIN_STAT_MINUTES) return [];
  const out: PlayerInstruction[] = [];
  const xg90 = s.npxg90 ?? s.xgPer90;
  if (s.shots90 != null && xg90 != null && s.shots90 >= STAT_SHOTS && xg90 / s.shots90 < STAT_SHOT_QUALITY)
    out.push({ id: 'shootLess', phase: 'ip', weight: STAT_WEIGHT + s.shots90, why: 'statShootLess', vals: { a: r1(s.shots90), b: Math.round((100 * xg90) / s.shots90) / 100 } });
  if (s.passPct != null && s.passPct < STAT_PASS_PCT) out.push({ id: 'riskLess', phase: 'ip', weight: STAT_WEIGHT, why: 'statRiskLess', vals: { a: Math.round(s.passPct) } });
  const y90 = s.yellow != null ? (90 * s.yellow) / s.minutes! : 0;
  if ((s.yellow ?? 0) >= 3 && y90 >= STAT_YELLOW_90) out.push({ id: 'tackleLess', phase: 'oop', weight: STAT_WEIGHT, why: 'statTackleLess', vals: { a: s.yellow!, b: Math.round(s.minutes! / 90) } });
  return out;
}

const SWITCHABLE = new Set<InstructionId>(['pressMore', 'pressLess', 'markTighter', 'riskMore', 'riskLess', 'dribbleMore', 'dribbleLess', 'shortPass', 'directPass']);

/** Écarte les consignes verrouillées par le rôle de leur phase (et propose le rôle qui les débloque), puis garde les plus marquées. */
/** Contexte du créneau (axial excentré, nombre de DC) pour ne proposer que des rôles que le jeu offre à ce créneau. */
function ctxOf(slot: Slot, team: Slot[]): SlotCtx {
  return slotContexts([slot, ...team.filter((t) => t !== slot)])[0]!;
}

/** Consignes individuelles au plus par joueur (complexité tactique). */
export const MAX_PER_PLAYER = 3;

function pick(wanted: PlayerInstruction[], ipRole: RoleRef | undefined, oopRole: RoleRef | undefined, engine: TacticEngine, slot: Slot, maxIp: number, maxOop: number, ctx: SlotCtx, max = MAX_PER_PLAYER): PlayerAdvice {
  const seen = new Set<string>();
  // Seules les consignes qui existent à l'écran de FM27 : « centrer plus souvent » ou « ralentir le jeu » n'y sont plus.
  const sorted = [...wanted].sort((x, y) => y.weight - x.weight).filter((x) => !!instructionKey(x.id) && !seen.has(x.id) && !!seen.add(x.id));
  const list: PlayerInstruction[] = [];
  const switches: RoleSwitch[] = [];
  for (const x of sorted) {
    const role = x.phase === 'ip' ? ipRole : oopRole;
    if (roleAllows(role, x.id, slot.pos, slot.x)) list.push(x);
    // Un rôle qui fait déjà la consigne (rôle libre, demi-défenseur) n'a pas besoin d'un autre rôle.
    else if (role && SWITCHABLE.has(x.id) && !roleImposes(role, x.id, slot.pos, slot.x)) {
      const alt = unlockingRole(engine, slot, x.phase, x.id, ctx);
      if (alt && alt.code !== role.code) switches.push({ phase: x.phase, from: role.code, to: alt.code, unlocks: x.id });
    }
  }
  // Complexité tactique (FUN_1846d4060) : chaque consigne individuelle alourdit la charge du joueur et fait baisser
  // sa compréhension tactique, la moitié de l'efficacité (FUN_182a49c90). On garde les plus utiles, 3 au plus, moins
  // quand l'effectif manque de capacité tactique pour le style (instructionBudget).
  const kept = new Set([...list.filter((x) => x.phase === 'ip').slice(0, maxIp), ...list.filter((x) => x.phase === 'oop').slice(0, maxOop)]);
  const top = list.filter((x) => kept.has(x)).slice(0, Math.min(max, MAX_PER_PLAYER));
  return {
    list: [...top.filter((x) => x.phase === 'ip'), ...top.filter((x) => x.phase === 'oop')],
    switches: switches.slice(0, 1),
  };
}

/** Meilleur rôle de la même phase et du même poste qui permet la consigne (un rôle de pressing pour presser plus). */
function unlockingRole(engine: TacticEngine, slot: Slot, phase: Phase, id: InstructionId, ctx: SlotCtx): RoleRef | null {
  const p = slot.player;
  if (!p) return null;
  const pos: PosCode = slot.pos;
  let best: { r: RoleRef; f: number } | null = null;
  for (const r of engine.ref.roles) {
    if (!engine.availableAt(r, pos, phase, ctx)) continue;
    // Le rôle permet la consigne, ou l'impose déjà (un rôle de pressing pour presser plus).
    if (!roleAllows(r, id, pos, slot.x) && !roleImposes(r, id, pos, slot.x)) continue;
    // Pour presser plus, on vise un vrai rôle de pressing quand le poste en a un.
    const bonus = id === 'pressMore' && roleLocks(r, pos, slot.x).press === 'more' ? 1 : 0;
    const f = (engine.roleFit(p, r.code, phase, pos) ?? 0) + bonus;
    if (!best || f > best.f) best = { r, f };
  }
  return best?.r ?? null;
}
