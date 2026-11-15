import { z } from 'zod';
import { engineValue } from './engine-value';
import { instructionKey, playerInstructions } from './instructions';
import type { FmPlayer } from './player';
import { piKeyGroup } from './player-instructions-fm27';
import type { PosCode } from './positions';
import { rankTactics } from './project';
import { avg, type FormationPlan, type StyleRef, type TacticEngine } from './tactic';
import { analyseBuiltTactic, builtPlan, builtStyle, defaultOption, normalizePi, piOptions, rolesAt, styleInstructions, type BuiltTactic } from './tactic-builder';
import { optimiseTactic, tacticQuality } from './tactic-optimise';
import { teamAdvice } from './team-advice';
import { MENTALITIES_FM27, TEAM_INSTRUCTIONS_FM27 } from './team-instructions-fm27';

/*
 * « Ma tactique idéale » : le joueur dit ce qu'il aime jouer (7 questions courtes, ou un style tout fait), l'appli
 * propose trois tactiques complètes pour SON effectif :
 *   - la plus fidèle à ses goûts (toutes ses réponses appliquées) ;
 *   - le meilleur compromis (ses goûts, assouplis là où l'effectif ne suit pas) : celle qui est conseillée ;
 *   - la plus adaptée à l'effectif (le classement habituel de l'appli, sans regarder ses goûts).
 * Chaque tactique reçoit trois notes sur 100 : ses goûts, son effectif, la méta de FM27 (ce que le onze pèse dans le
 * moteur, voir engine-value.ts). Choix de FM Immersion, pas une mesure du jeu. Consultatif : rien n'est écrit dans FM27.
 */

export const TASTE_MUSTS = ['back3', 'back4', 'twoStrikers', 'ten', 'insideWingers', 'attackingFullbacks', 'targetMan'] as const;
export type TasteMust = (typeof TASTE_MUSTS)[number];

export const tasteSchema = z.object({
  /** Avec le ballon : le garder, aller vite vers l'avant, ou jouer long sur un point d'appui. */
  ball: z.enum(['keep', 'fast', 'long']).nullable().default(null),
  /** Par où attaquer. */
  attack: z.enum(['wide', 'centre', 'both']).nullable().default(null),
  /** Sans le ballon : hauteur du bloc. */
  defend: z.enum(['high', 'mid', 'low']).nullable().default(null),
  risk: z.enum(['cautious', 'balanced', 'positive', 'allout']).nullable().default(null),
  /** Ce que le joueur veut absolument voir. */
  musts: z.array(z.enum(TASTE_MUSTS)).default([]),
  /** Simple (assimilée vite, peu de consignes) ou travaillée. */
  tuning: z.enum(['simple', 'worked']).nullable().default(null),
  /** Point de départ : la tactique du jeu (on garde son schéma si possible) ou une page blanche. */
  start: z.enum(['game', 'blank']).default('game'),
  /** Style tout fait choisi d'un clic (ses réponses sont préremplies) ; effacé dès qu'une réponse change. */
  preset: z.string().nullable().default(null),
});
export type Taste = z.infer<typeof tasteSchema>;
export const EMPTY_TASTE: Taste = tasteSchema.parse({});
export const parseTaste = (raw: unknown): Taste => {
  const r = tasteSchema.safeParse(raw ?? {});
  return r.success ? r.data : EMPTY_TASTE;
};

/** Le joueur a-t-il dit quelque chose de son style ? */
export const tasteAnswered = (t: Taste): boolean => !!(t.ball || t.attack || t.defend || t.risk || t.musts.length || t.tuning);

/* ---------- Ce qu'une tactique « joue », lu dans ses consignes d'équipe ---------- */

// Identifiants des consignes du jeu (team-instructions-fm27.ts).
const TI = { passing: 1, transition: 3, width: 4, line: 8, defLine: 9, trigger: 10, counterPress: 11, lineBehaviour: 15, patience: 18, reception: 20, tempo: 21, crossEngage: 22, gkShort: 23, buildUp: 24, goalKicks: 29, progress: 30, overlaps: 31 } as const;

export interface TacticFeatures {
  /** Passes : −1 très courtes … +1 très directes. */
  direct: number;
  /** Rythme : −1 très lent … +1 très élevé. */
  tempo: number;
  /** Transition offensive : −1 rester en place, 0 standard, 1 contrer. */
  counter: number;
  /** Largeur du jeu : −1 par l'axe … +1 par les couloirs (largeur et progression confondues). */
  width: number;
  /** Hauteur du bloc : 0 bas, 1 médian, 2 pressing haut. */
  line: number;
  counterPress: boolean;
  /** Mentalité : 0 très défensive … 6 très offensive. */
  mentality: number;
  /** Consignes d'équipe qui s'écartent de la valeur par défaut. */
  count: number;
}

const DEF_BY_ID = new Map(TEAM_INSTRUCTIONS_FM27.map((d) => [d.id, d]));
const opt = (ti: Record<string, number>, id: number): number => ti[id] ?? defaultOption(DEF_BY_ID.get(id)!);
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function tacticFeatures(t: Pick<BuiltTactic, 'ti' | 'mentality'>): TacticFeatures {
  const ti = t.ti;
  const progress = opt(ti, TI.progress);
  const ment = (MENTALITIES_FM27 as readonly string[]).indexOf(t.mentality);
  return {
    direct: (opt(ti, TI.passing) - 2) / 2,
    tempo: (opt(ti, TI.tempo) - 2) / 2,
    counter: opt(ti, TI.transition) - 1,
    width: clamp((opt(ti, TI.width) - 2) / 2 + (progress === 4 ? 0.5 : progress === 1 ? -0.5 : 0), -1, 1),
    line: opt(ti, TI.line),
    counterPress: opt(ti, TI.counterPress) === 2,
    mentality: ment < 0 ? 3 : ment,
    count: TEAM_INSTRUCTIONS_FM27.filter((d) => ti[d.id] != null && ti[d.id] !== defaultOption(d)).length,
  };
}

const BALL_TARGET = { keep: { d: -0.5, t: -0.5, c: 0 }, fast: { d: 0, t: 0.5, c: 1 }, long: { d: 1, t: 0.5, c: 1 } } as const;
const ATTACK_TARGET = { wide: 1, centre: -1, both: 0 } as const;
const LINE_TARGET = { low: 0, mid: 1, high: 2 } as const;
const RISK_TARGET = { cautious: 2, balanced: 3, positive: 4, allout: 5 } as const;
/** Au-delà, une tactique n'est plus « simple » (Sports Interactive : chaque consigne en plus allonge l'assimilation). */
export const SIMPLE_MAX = 8;

const ballScore = (f: TacticFeatures, k: keyof typeof BALL_TARGET) => {
  const g = BALL_TARGET[k];
  return clamp(1 - (Math.abs(f.direct - g.d) + Math.abs(f.tempo - g.t) * 0.6 + Math.abs(f.counter - g.c) * 0.4) / 1.6);
};
const attackScore = (f: TacticFeatures, k: keyof typeof ATTACK_TARGET) => clamp(1 - Math.abs(f.width - ATTACK_TARGET[k]) / 1.5);
const lineScore = (f: TacticFeatures, k: keyof typeof LINE_TARGET) => [1, 0.4, 0][Math.abs(f.line - LINE_TARGET[k])] ?? 0;
const riskScore = (f: TacticFeatures, k: keyof typeof RISK_TARGET) => clamp(1 - Math.abs(f.mentality - RISK_TARGET[k]) / 3);

/** Réponses 1 à 4 les plus proches d'un style tout fait (pour préremplir le questionnaire). */
export function tasteOfStyle(style: StyleRef): Pick<Taste, 'ball' | 'attack' | 'defend' | 'risk'> {
  const s = styleInstructions(style);
  const f = tacticFeatures({ ti: s.ti, mentality: s.mentality ?? 'Équilibrée' });
  const best = <K extends string>(keys: readonly K[], score: (k: K) => number): K => keys.reduce((a, b) => (score(b) > score(a) ? b : a));
  return {
    ball: best(['keep', 'fast', 'long'] as const, (k) => ballScore(f, k)),
    attack: best(['both', 'wide', 'centre'] as const, (k) => attackScore(f, k)),
    defend: best(['mid', 'high', 'low'] as const, (k) => lineScore(f, k)),
    risk: best(['balanced', 'cautious', 'positive', 'allout'] as const, (k) => riskScore(f, k)),
  };
}

/* ---------- « Ce que je veux absolument voir » ---------- */

const WIDE_ATT: PosCode[] = ['MOG', 'MOD'];
const WIDE_MID: PosCode[] = ['MG', 'MD'];
const FULLBACKS: PosCode[] = ['DG', 'DD', 'DLG', 'DLD'];
const INSIDE_ROLES = ['IF', 'IW', 'WP'];
const ATTACKING_FB_ROLES = ['AWB', 'WB', 'PMWB'];
const TARGET_ROLES = ['TF'];

type Slots = readonly { pos: PosCode; ip: string }[];
const count = (slots: Slots, pos: PosCode) => slots.filter((s) => s.pos === pos).length;
const wingers = (slots: Slots) => {
  const high = slots.map((s, i) => ({ s, i })).filter((x) => WIDE_ATT.includes(x.s.pos));
  return high.length ? high : slots.map((s, i) => ({ s, i })).filter((x) => WIDE_MID.includes(x.s.pos));
};
const fullbacks = (slots: Slots) => slots.map((s, i) => ({ s, i })).filter((x) => FULLBACKS.includes(x.s.pos));

/** La tactique respecte-t-elle ce souhait ? */
export function mustMet(slots: Slots, must: TasteMust): boolean {
  switch (must) {
    case 'back3':
      return count(slots, 'DC') === 3;
    case 'back4':
      return count(slots, 'DC') === 2;
    case 'twoStrikers':
      return count(slots, 'BT') >= 2;
    case 'ten':
      return count(slots, 'MOC') >= 1;
    case 'insideWingers': {
      const w = wingers(slots);
      return w.length >= 2 && w.every((x) => INSIDE_ROLES.includes(x.s.ip));
    }
    case 'attackingFullbacks': {
      const fb = fullbacks(slots);
      return fb.length >= 2 && fb.every((x) => ATTACKING_FB_ROLES.includes(x.s.ip));
    }
    case 'targetMan':
      return slots.some((s) => s.pos === 'BT' && TARGET_ROLES.includes(s.ip));
  }
}

/** Ce souhait peut-il être tenu avec ces postes (quitte à changer des rôles) ? */
function mustPossible(slots: Slots, must: TasteMust): boolean {
  if (must === 'insideWingers') return wingers(slots).length >= 2;
  if (must === 'attackingFullbacks') return fullbacks(slots).length >= 2;
  if (must === 'targetMan') return count(slots, 'BT') >= 1;
  return mustMet(slots, must);
}

/* ---------- Note « tes goûts » ---------- */

export interface TastePart {
  key: 'ball' | 'attack' | 'defend' | 'risk' | 'tuning' | TasteMust;
  /** 0 à 1. */
  score: number;
  weight: number;
}

const WEIGHT = { ball: 3, attack: 2, defend: 3, risk: 2, must: 2, tuning: 1 } as const;

/** Note sur 100 d'une tactique au regard des goûts du joueur ; null s'il n'a rien dit. */
export function tasteScore(t: BuiltTactic, taste: Taste): { score: number | null; parts: TastePart[] } {
  const f = tacticFeatures(t);
  const parts: TastePart[] = [];
  if (taste.ball) parts.push({ key: 'ball', score: ballScore(f, taste.ball), weight: WEIGHT.ball });
  if (taste.attack) parts.push({ key: 'attack', score: attackScore(f, taste.attack), weight: WEIGHT.attack });
  if (taste.defend) parts.push({ key: 'defend', score: lineScore(f, taste.defend), weight: WEIGHT.defend });
  if (taste.risk) parts.push({ key: 'risk', score: riskScore(f, taste.risk), weight: WEIGHT.risk });
  for (const m of taste.musts) parts.push({ key: m, score: mustMet(t.slots, m) ? 1 : 0, weight: WEIGHT.must });
  if (taste.tuning === 'simple') parts.push({ key: 'tuning', score: clamp(1 - (f.count - SIMPLE_MAX) / SIMPLE_MAX), weight: WEIGHT.tuning });
  const w = parts.reduce((a, p) => a + p.weight, 0);
  return { score: w ? Math.round((parts.reduce((a, p) => a + p.score * p.weight, 0) / w) * 100) : null, parts };
}

/* ---------- Appliquer les goûts à une tactique ---------- */

export type TasteAxis = 'ball' | 'attack' | 'defend';

/**
 * Consignes d'équipe et mentalité selon les réponses. `relaxed` : axes assouplis d'un cran parce que l'effectif ne
 * suit pas (pressing haut → bloc médian qui presse souvent, passes courtes → standard, etc.).
 */
export function applyTaste(base: Pick<BuiltTactic, 'ti' | 'mentality'>, taste: Taste, relaxed: ReadonlySet<TasteAxis> = new Set()): { ti: Record<string, number>; mentality: string; touched: number[] } {
  const ti: Record<string, number> = { ...base.ti };
  const touched: number[] = [];
  const set = (id: number, option: number) => {
    ti[id] = option;
    touched.push(id);
  };
  const soft = (a: TasteAxis) => relaxed.has(a);
  if (taste.ball === 'keep') {
    set(TI.passing, soft('ball') ? 2 : 1);
    set(TI.tempo, 1);
    set(TI.transition, 1);
    set(TI.goalKicks, 0);
    if (!soft('ball')) set(TI.buildUp, 0);
  } else if (taste.ball === 'fast') {
    set(TI.passing, 2);
    set(TI.tempo, 3);
    set(TI.transition, soft('ball') ? 1 : 2);
    if (!soft('ball')) set(TI.reception, 2);
  } else if (taste.ball === 'long') {
    set(TI.passing, soft('ball') ? 3 : 4);
    set(TI.tempo, 3);
    set(TI.transition, 2);
    set(TI.goalKicks, soft('ball') ? 1 : 2);
    set(TI.buildUp, 2);
  }
  if (taste.attack === 'wide') {
    set(TI.width, soft('attack') ? 2 : 3);
    set(TI.progress, soft('attack') ? 0 : 4);
    set(TI.overlaps, 3);
  } else if (taste.attack === 'centre') {
    set(TI.width, 1);
    set(TI.progress, 1);
    set(TI.overlaps, 0);
    set(TI.patience, 2);
  } else if (taste.attack === 'both') {
    set(TI.width, 2);
    set(TI.progress, 0);
  }
  if (taste.defend === 'high') {
    if (soft('defend')) {
      set(TI.line, 1);
      set(TI.defLine, 3);
      set(TI.trigger, 3);
      set(TI.counterPress, 1);
    } else {
      set(TI.line, 2);
      set(TI.defLine, 3);
      set(TI.trigger, 3);
      set(TI.counterPress, 2);
      set(TI.gkShort, 1);
    }
  } else if (taste.defend === 'mid') {
    set(TI.line, 1);
    set(TI.defLine, 2);
  } else if (taste.defend === 'low') {
    set(TI.line, soft('defend') ? 1 : 0);
    set(TI.defLine, 1);
    set(TI.counterPress, 0);
    set(TI.lineBehaviour, 2);
  }
  // Consignes que le jeu ne propose qu'avec un pressing haut ou un bloc bas.
  if (opt(ti, TI.line) !== 2) delete ti[TI.gkShort];
  if (opt(ti, TI.line) !== 0) delete ti[TI.crossEngage];
  const mentality = taste.risk ? MENTALITIES_FM27[RISK_TARGET[taste.risk]]! : base.mentality;
  // Tactique simple : on retire d'abord les consignes du style, puis, parmi celles qui portent les goûts, celle dont
  // le retrait coûte le moins à la note de goûts, jusqu'à SIMPLE_MAX (le bloc bas ne doit pas sauter avant un détail).
  if (taste.tuning === 'simple') {
    const active = () => TEAM_INSTRUCTIONS_FM27.filter((d) => ti[d.id] != null && ti[d.id] !== defaultOption(d)).map((d) => d.id);
    const axes: Taste = { ...taste, musts: [], tuning: null };
    const worth = (without: number) => {
      const rest = { ...ti };
      delete rest[without];
      return tasteScore({ slots: [], ti: rest, mentality } as unknown as BuiltTactic, axes).score ?? 0;
    };
    for (let on = active(); on.length > SIMPLE_MAX; on = active()) {
      const free = on.filter((id) => !touched.includes(id));
      const drop = free.length ? free[free.length - 1]! : on.map((id) => ({ id, w: worth(id) })).reduce((a, b) => (b.w >= a.w ? b : a)).id;
      delete ti[drop];
    }
  }
  return { ti, mentality, touched };
}

/** Rôles imposés par les souhaits (ailiers qui rentrent, latéraux offensifs, pivot), là où le jeu les propose. */
function enforceRoles(engine: TacticEngine, t: BuiltTactic, musts: readonly TasteMust[]): BuiltTactic {
  const slots = t.slots.map((s) => ({ ...s }));
  const put = (i: number, wanted: string[]) => {
    if (wanted.includes(slots[i]!.ip)) return;
    const ok = rolesAt(engine, slots, i, 'ip').map((r) => r.code);
    const code = wanted.find((c) => ok.includes(c));
    if (code) slots[i]!.ip = code;
  };
  if (musts.includes('insideWingers')) for (const w of wingers(slots)) put(w.i, INSIDE_ROLES);
  if (musts.includes('attackingFullbacks')) for (const fb of fullbacks(slots)) put(fb.i, ATTACKING_FB_ROLES);
  if (musts.includes('targetMan') && !mustMet(slots, 'targetMan')) {
    const i = slots.findIndex((s) => s.pos === 'BT');
    if (i >= 0) put(i, TARGET_ROLES);
  }
  return { ...t, slots };
}

/* ---------- Note « ton effectif » ---------- */

export type TasteDemandId = 'press' | 'short' | 'long' | 'pace' | 'wide' | 'low';
export interface Demand {
  id: TasteDemandId;
  axis: TasteAxis;
  /** Niveau de l'effectif sur ce point, et moyenne de ses autres qualités (sur 20). */
  value: number;
  mean: number;
}

const DEMANDS: { id: TasteDemandId; signal: string; axis: TasteAxis; on: (f: TacticFeatures) => boolean }[] = [
  { id: 'press', signal: 'press', axis: 'defend', on: (f) => f.line === 2 || f.counterPress },
  { id: 'short', signal: 'technical', axis: 'ball', on: (f) => f.direct <= -0.5 },
  { id: 'long', signal: 'aerial', axis: 'ball', on: (f) => f.direct >= 1 },
  { id: 'pace', signal: 'pace', axis: 'ball', on: (f) => f.tempo >= 0.5 && f.counter > 0 },
  { id: 'wide', signal: 'wide', axis: 'attack', on: (f) => f.width >= 0.75 },
  { id: 'low', signal: 'defense', axis: 'defend', on: (f) => f.line === 0 },
];
/** Une qualité est un point faible de l'effectif quand elle est sous la moyenne de ses qualités de cet écart (sur 20). */
export const DEMAND_GAP = 0.4;
/** Points retirés à la note « effectif » par exigence que l'effectif ne tient pas. */
export const DEMAND_COST = 6;

/** Exigences des consignes que l'effectif tient mal : ce que la tactique demande et qui est un point faible du groupe. */
export function unmetDemands(engine: TacticEngine, t: Pick<BuiltTactic, 'ti' | 'mentality'>, players: FmPlayer[]): Demand[] {
  const sig = engine.squadSignals(players);
  const mean = avg(Object.values(sig));
  if (mean == null) return [];
  const f = tacticFeatures(t);
  return DEMANDS.flatMap((d) => {
    const value = sig[d.signal];
    return d.on(f) && value != null && value < mean - DEMAND_GAP ? [{ id: d.id, axis: d.axis, value, mean }] : [];
  });
}

export interface TacticScores {
  /** Tes goûts, sur 100 (null : questionnaire vide). */
  taste: number | null;
  /**
   * Ton effectif, sur 100 : 100 = le meilleur onze que l'effectif peut aligner (repère `ScoreRef`) ; chaque point de
   * note d'équipe en moins (sur 20) retire FIT_POINT, chaque exigence que le groupe tient mal retire DEMAND_COST.
   */
  squad: number;
  /** Méta FM27, sur 100 : note méta moyenne du onze à ses postes, comparée de la même façon au meilleur onze. */
  meta: number | null;
  /** Qualité, sur 100 : 100 = aucun point à surveiller dans « Forces et faiblesses » et des jauges équilibrées (tactic-optimise.ts). */
  quality: number;
}

/** Repère des notes « effectif » et « méta » : les meilleures valeurs que l'effectif atteint (sur 20). */
export interface ScoreRef {
  fit: number;
  meta: number | null;
}
/** Points de note sur 100 retirés par point de note d'équipe (sur 20) sous le repère. */
export const FIT_POINT = 15;

export interface ScoredTactic {
  tactic: BuiltTactic;
  plan: FormationPlan;
  scores: TacticScores;
  /** Valeurs brutes sur 20 : note moyenne du onze dans ses rôles, note méta moyenne du onze. */
  raw: ScoreRef;
  demands: Demand[];
  tasteParts: TastePart[];
  /** Points à surveiller qui restent dans « Forces et faiblesses ». */
  issues: number;
}

const relative = (v: number, best: number) => Math.round(clamp(100 - Math.max(0, best - v) * FIT_POINT, 0, 100));

/**
 * Les trois notes d'une tactique (proposée, construite ou lue dans le jeu) pour cet effectif et ces goûts.
 * Sans repère, la tactique est son propre repère (100 moins les exigences mal tenues).
 */
export function scoreTactic(engine: TacticEngine, tactic: BuiltTactic, players: FmPlayer[], reserve: FmPlayer[], taste: Taste, ref?: ScoreRef): ScoredTactic {
  const plan = builtPlan(engine, tactic, players, reserve);
  const demands = unmetDemands(engine, tactic, players);
  const metas = plan.slots.flatMap((s) => {
    const v = s.player && s.pos !== 'GB' ? engineValue(s.player, s.pos) : null;
    return v ? [v.meta] : [];
  });
  const raw: ScoreRef = { fit: plan.fit, meta: avg(metas) };
  const ts = tasteScore(tactic, taste);
  const analysis = analyseBuiltTactic(engine, tactic, players, reserve);
  const issues = analysis.findings.filter((f) => f.tone !== 'good').length;
  return rescore({ tactic, plan, demands, tasteParts: ts.parts, raw, issues, scores: { taste: ts.score, squad: 0, meta: null, quality: tacticQuality(analysis) } }, ref ?? raw);
}

/** Notes « effectif » et « méta » recalculées sur un repère commun, pour comparer plusieurs tactiques entre elles. */
export function rescore<T extends ScoredTactic>(s: T, ref: ScoreRef): T {
  const squad = Math.round(clamp(relative(s.raw.fit, ref.fit) - s.demands.length * DEMAND_COST, 0, 100));
  const meta = s.raw.meta == null ? null : relative(s.raw.meta, ref.meta ?? s.raw.meta);
  return { ...s, scores: { ...s.scores, squad, meta } };
}

/* ---------- Consignes individuelles ---------- */

/** Consignes individuelles conseillées par titulaire selon le niveau de réglage demandé. */
export const PI_PER_PLAYER: Record<'simple' | 'default' | 'worked', number> = { simple: 1, default: 2, worked: 3 };
/** Total au-delà duquel une tactique n'est plus « simple » (constat `simple` de l'analyse). */
export const PI_SIMPLE_TOTAL = 6;

/**
 * Ajoute à une tactique les consignes individuelles conseillées pour le onze qui la jouerait (mêmes règles que l'écran
 * Tactique : attributs du joueur, pied fort, rôle, style), les plus marquées d'abord. On s'arrête avant que la tactique
 * ne devienne « chargée » (consignes d'équipe + moitié des individuelles), et une consigne qui ferait baisser la note
 * « Qualité » est retirée. Les consignes déjà posées (la sentinelle du réglage) sont gardées.
 */
export function addPlayerInstructions(engine: TacticEngine, tactic: BuiltTactic, players: FmPlayer[], reserve: FmPlayer[] = [], perPlayer = PI_PER_PLAYER.default, maxTotal = Infinity): { tactic: BuiltTactic; added: number } {
  const plan = builtPlan(engine, tactic, players, reserve);
  const style = builtStyle(tactic);
  const quality = (t: BuiltTactic) => tacticQuality(analyseBuiltTactic(engine, t, players, reserve));
  const floor = quality(tactic);
  const wanted: { i: number; key: string; weight: number }[] = [];
  plan.slots.forEach((slot, i) => {
    if (!slot.player) return;
    const have = new Set(normalizePi(tactic.slots[i]!.pi ?? []).map(piKeyGroup));
    const o = piOptions(engine, tactic, i);
    const free = new Set([...o.ip, ...o.oop].flatMap((g) => g.options.map((x) => `${g.def.group}:${x}`)));
    for (const x of playerInstructions(engine, slot, style, plan.slots, perPlayer).list) {
      const key = instructionKey(x.id);
      if (!key || have.has(piKeyGroup(key)) || !free.has(key)) continue;
      have.add(piKeyGroup(key));
      wanted.push({ i, key, weight: x.weight });
    }
  });
  const nTi = TEAM_INSTRUCTIONS_FM27.filter((d) => tactic.ti[d.id] != null && tactic.ti[d.id] !== defaultOption(d)).length;
  const already = tactic.slots.reduce((n, sl) => n + normalizePi(sl.pi ?? []).length, 0);
  // Constat « chargée » : consignes d'équipe + moitié des individuelles à 14 ou plus.
  const room = Math.max(0, Math.min(2 * (14 - nTi) - 1, maxTotal) - already);
  let kept = wanted.sort((a, b) => b.weight - a.weight).slice(0, room);
  const build = (list: typeof kept): BuiltTactic => ({ ...tactic, slots: tactic.slots.map((sl, i) => ({ ...sl, pi: normalizePi([...(sl.pi ?? []), ...list.filter((x) => x.i === i).map((x) => x.key)]) })) });
  let out = build(kept);
  // Une consigne de pressing peut déplacer un constat : on retire les moins marquées tant que la note a baissé.
  while (kept.length && quality(out) < floor) {
    kept = kept.slice(0, -1);
    out = build(kept);
  }
  return { tactic: out, added: kept.length };
}

/* ---------- Les trois propositions ---------- */

export type ProposalKind = 'taste' | 'balance' | 'squad';
export type NoteTone = 'good' | 'warn';
export interface ProposalNote {
  id: 'allMet' | 'mustMissed' | 'demand' | 'relaxed' | 'mustDropped' | 'sameShape' | 'newShape' | 'bestFit' | 'hole' | 'simple' | 'farFromTaste' | 'tuned' | 'issuesLeft' | 'playerInstructions';
  tone: NoteTone;
  params: Record<string, unknown>;
}

export interface TacticDiff {
  /** Mêmes onze postes que la tactique du jeu. */
  sameShape: boolean;
  /** Rôles qui changent (avec ou sans ballon), à postes égaux. */
  roles: number;
  /** Consignes d'équipe et mentalité qui changent. */
  instructions: number;
}

export interface Proposal extends ScoredTactic {
  kind: ProposalKind;
  /** La proposition conseillée (le compromis). */
  recommended: boolean;
  /** Le compromis est aussi la plus fidèle / la plus adaptée : cette carte montre alors la suivante. */
  alt: boolean;
  style: StyleRef;
  form: string;
  notes: ProposalNote[];
  /** Écart avec la tactique du jeu, quand elle est lue. */
  diff: TacticDiff | null;
}

/** Écart entre deux tactiques : schéma, rôles à postes égaux, consignes et mentalité. */
export function tacticDiff(a: BuiltTactic, b: BuiltTactic): TacticDiff {
  const key = (t: BuiltTactic) => t.slots.map((s) => s.pos).sort().join(' ');
  const sameShape = key(a) === key(b);
  let roles = 0;
  if (sameShape) {
    const rest = b.slots.map((s) => ({ ...s }));
    for (const s of a.slots) {
      // Même poste : on rapproche d'abord le créneau qui a déjà les mêmes rôles.
      const same = rest.findIndex((x) => x.pos === s.pos && x.ip === s.ip && x.oop === s.oop);
      const j = same >= 0 ? same : rest.findIndex((x) => x.pos === s.pos);
      const o = rest.splice(j, 1)[0]!;
      if (o.ip !== s.ip) roles++;
      if (o.oop !== s.oop) roles++;
    }
  }
  const instructions = TEAM_INSTRUCTIONS_FM27.filter((d) => opt(a.ti, d.id) !== opt(b.ti, d.id)).length + (a.mentality !== b.mentality ? 1 : 0);
  return { sameShape, roles, instructions };
}

/** Coût (note d'équipe sur 20) d'un couloir laissé sans défenseur par le schéma, dans le choix du compromis. */
export const SHAPE_FLAW_COST = 1;
/** Carte « la plus adaptée à l'effectif » : son réglage tient d'abord à la note du onze (deux fois le poids habituel). */
export const SQUAD_FIT_WEIGHT = 30;
/** Avantage (note d'équipe sur 20) donné au schéma déjà joué dans FM27 : la familiarité se reconstruit sur des semaines. */
export const KEEP_FORM_BONUS = 0.4;
/** Un souhait est abandonné dans le compromis s'il coûte plus que cela au onze (note sur 20). */
export const MUST_MAX_COST = 0.5;

const fromPlan = (plan: FormationPlan, id: string, name: string, ti: Record<string, number>, mentality: string): BuiltTactic => ({
  id,
  name,
  slots: plan.slots.map((s) => ({ pos: s.pos, posOOP: s.posOOP ?? s.pos, ip: s.ip, oop: s.oop, pi: [] })),
  mentality,
  ti,
});

const sameTactic = (a: BuiltTactic, b: BuiltTactic) =>
  a.mentality === b.mentality &&
  JSON.stringify(a.slots.map((s) => [s.pos, s.ip, s.oop])) === JSON.stringify(b.slots.map((s) => [s.pos, s.ip, s.oop])) &&
  TEAM_INSTRUCTIONS_FM27.every((d) => opt(a.ti, d.id) === opt(b.ti, d.id));

export interface ProposeInput {
  engine: TacticEngine;
  players: FmPlayer[];
  reserve?: FmPlayer[];
  taste: Taste;
  /** Classement habituel de l'appli (rankTactics), s'il est déjà calculé. */
  ranked?: ReturnType<typeof rankTactics>;
  /** Tactique jouée dans FM27, recopiée par builtFromGame (null si le plugin ne la lit pas). */
  game?: BuiltTactic | null;
}

export interface TacticProposals {
  proposals: Proposal[];
  /** La tactique du jeu, notée sur le même repère. */
  game: ScoredTactic | null;
  ref: ScoreRef;
}

/**
 * Trois tactiques pour cet effectif : la plus fidèle aux goûts, le compromis (conseillé), la plus adaptée à l'effectif.
 * Sans réponse au questionnaire : seule la plus adaptée à l'effectif est rendue.
 */
export function proposeTactics(input: ProposeInput): TacticProposals {
  const { engine, players, reserve = [], taste, game = null } = input;
  const proposals = buildProposals(input);
  const gameScored = game ? scoreTactic(engine, game, players, reserve, taste) : null;
  // Repère commun : le meilleur onze et la meilleure note méta parmi tout ce qui est montré.
  const all: ScoredTactic[] = [...proposals, ...(gameScored ? [gameScored] : [])];
  const metas = all.flatMap((s) => (s.raw.meta == null ? [] : [s.raw.meta]));
  const ref: ScoreRef = { fit: Math.max(0, ...all.map((s) => s.raw.fit)), meta: metas.length ? Math.max(...metas) : null };
  return { proposals: proposals.map((p) => rescore(p, ref)), game: gameScored && rescore(gameScored, ref), ref };
}

function buildProposals({ engine, players, reserve = [], taste, ranked = rankTactics(engine, players, reserve), game = null }: ProposeInput): Proposal[] {
  if (!ranked.length) return [];
  const styleBase = (st: StyleRef) => {
    const s = styleInstructions(st);
    return { ti: s.ti, mentality: s.mentality ?? 'Équilibrée' };
  };
  const gameShape = taste.start === 'game' && game ? game.slots.map((s) => s.pos).sort().join(' ') : null;
  const keepsShape = (plan: FormationPlan) => gameShape != null && plan.slots.map((s) => s.pos).sort().join(' ') === gameShape;
  // Réglage automatique d'une proposition retenue : rôles et consignes ajustés pour vider les points à surveiller, sans
  // perdre sur les goûts (note et souhaits) ni toucher aux consignes qui les portent.
  const tune = (tactic: BuiltTactic, locked: readonly number[], reference: BuiltTactic | null = null, fitWeight?: number) => {
    const floor = tasteScore(tactic, taste).score ?? 0;
    const met = taste.musts.filter((m) => mustMet(tactic.slots, m));
    const accept = (t: BuiltTactic) => (tasteScore(t, taste).score ?? 0) >= floor && met.every((m) => mustMet(t.slots, m));
    return optimiseTactic(engine, tactic, players, { accept, lockedTi: locked, reference, reserve, ...(fitWeight ? { fitWeight } : {}) });
  };
  const finish = (kind: ProposalKind, style: StyleRef, raw: BuiltTactic, notes: ProposalNote[], alt = false, tuning: { locked: readonly number[]; reference?: BuiltTactic | null; fitWeight?: number } | null = null): Proposal => {
    const tuned = tuning ? tune(raw, tuning.locked, tuning.reference ?? null, tuning.fitWeight) : null;
    const level = taste.tuning === 'simple' ? 'simple' : taste.tuning === 'worked' ? 'worked' : 'default';
    // Style de centres : il dépend des attaquants alignés (grand pivot, ou petits gabarits), pas des goûts. Posé une fois
    // le onze connu, s'il reste de la place sous le seuil d'une tactique chargée.
    let settled = tuned?.tactic ?? raw;
    if (tuning) {
      const count = tacticFeatures(settled).count;
      const row = teamAdvice(builtPlan(engine, settled, players, reserve), builtStyle(settled)).rows.find((r) => r.def.code === 'CrossingStyle' && r.reason);
      if (row && settled.ti[row.def.id] == null && count < (level === 'simple' ? SIMPLE_MAX : 9)) {
        const next = { ...settled, ti: { ...settled.ti, [row.def.id]: row.option } };
        const q = (t: BuiltTactic) => tacticQuality(analyseBuiltTactic(engine, t, players, reserve));
        if (q(next) >= q(settled) && (tasteScore(next, taste).score ?? 0) >= (tasteScore(settled, taste).score ?? 0)) settled = next;
      }
    }
    // Consignes individuelles du onze, une fois les rôles réglés (elles dépendent du rôle et du joueur).
    const withPi = tuning ? addPlayerInstructions(engine, settled, players, reserve, PI_PER_PLAYER[level], level === 'simple' ? PI_SIMPLE_TOTAL : Infinity) : null;
    const tactic = withPi?.tactic ?? settled;
    const s = scoreTactic(engine, tactic, players, reserve, taste);
    const all = [...notes];
    if (tuned && tuned.after > tuned.before) all.push({ id: 'tuned', tone: 'good', params: { before: tuned.before, after: tuned.after } });
    if (tuning && s.issues) all.push({ id: 'issuesLeft', tone: 'warn', params: { count: s.issues } });
    if (withPi?.added) all.push({ id: 'playerInstructions', tone: 'good', params: { count: withPi.added } });
    for (const d of s.demands) all.push({ id: 'demand', tone: 'warn', params: { demand: d.id, value: d.value, mean: d.mean } });
    if (s.plan.holes) all.push({ id: 'hole', tone: 'warn', params: { count: s.plan.holes } });
    const diff = game ? tacticDiff(tactic, game) : null;
    if (diff) all.push(diff.sameShape ? { id: 'sameShape', tone: 'good', params: { roles: diff.roles, instructions: diff.instructions } } : { id: 'newShape', tone: 'warn', params: {} });
    return { ...s, kind, recommended: kind === 'balance', alt, style, form: s.plan.form, notes: all, diff };
  };

  // La plus adaptée à l'effectif : le classement habituel de l'appli, sans regarder les goûts.
  const squadOf = (r: (typeof ranked)[number], alt = false, tuned = false): Proposal => {
    const b = styleBase(r.style);
    const p = finish('squad', r.style, fromPlan(r.plan, 'squad', `${r.plan.form} · ${r.style.name}`, b.ti, b.mentality), [{ id: 'bestFit', tone: 'good', params: {} }], alt, tuned ? { locked: [], fitWeight: SQUAD_FIT_WEIGHT } : null);
    if (p.scores.taste != null && p.scores.taste < 60) p.notes.splice(1, 0, { id: 'farFromTaste', tone: 'warn', params: {} });
    return p;
  };
  // Départagées sur la note « effectif » de cet écran (onze dans ses rôles, exigences mal tenues), du meilleur au moins bon.
  const worth = (p: Proposal) => p.raw.fit - (p.demands.length * DEMAND_COST) / FIT_POINT;
  const bySquad = ranked.map((r) => ({ r, p: squadOf(r) })).sort((a, b) => worth(b.p) - worth(a.p));
  if (!tasteAnswered(taste)) return [squadOf(bySquad[0]!.r, false, true)];

  // Style de départ : celui choisi d'un clic, sinon celui dont les consignes ressemblent le plus aux réponses.
  const axes: Taste = { ...taste, musts: [], tuning: null };
  const near = (st: StyleRef) => tasteScore({ id: '', name: '', slots: [], ...styleBase(st) } as unknown as BuiltTactic, axes).score ?? 0;
  const base = ranked.find((r) => r.style.id === taste.preset) ?? ranked.map((r) => ({ r, s: near(r.style) })).reduce((a, b) => (b.s > a.s ? b : a)).r;
  const baseTi = styleBase(base.style);
  const name = (form: string) => `${form} · ${base.style.name}`;

  // La plus fidèle : le schéma qui permet le plus de souhaits (puis le meilleur onze), toutes les réponses appliquées.
  const possible = (plan: FormationPlan) => taste.musts.filter((m) => mustPossible(plan.slots, m)).length;
  // Schéma qui laisse un couloir sans défenseur (trois centraux sans piston) : défaut de structure qu'aucun rôle ne
  // corrige, il passe donc après les autres à souhaits égaux.
  const flawMemo = new Map<FormationPlan, number>();
  const flaws = (plan: FormationPlan) => {
    let n = flawMemo.get(plan);
    if (n === undefined) flawMemo.set(plan, (n = analyseBuiltTactic(engine, fromPlan(plan, 'x', 'x', {}, 'Équilibrée')).findings.filter((f) => f.id === 'flankOpen').length));
    return n;
  };
  const faithfulPlans = [...base.plans].sort((a, b) => possible(b) - possible(a) || flaws(a) - flaws(b) || b.score - a.score);
  const faithful = (plan: FormationPlan, alt = false, from = base): Proposal => {
    const applied = applyTaste(from === base ? baseTi : styleBase(from.style), taste);
    const tactic = enforceRoles(engine, fromPlan(plan, 'taste', `${plan.form} · ${from.style.name}`, applied.ti, applied.mentality), taste.musts);
    const missed = taste.musts.filter((m) => !mustMet(tactic.slots, m));
    const notes: ProposalNote[] = missed.length ? missed.map((m) => ({ id: 'mustMissed' as const, tone: 'warn' as const, params: { must: m } })) : [{ id: 'allMet', tone: 'good', params: {} }];
    return finish('taste', from.style, tactic, notes, alt, { locked: applied.touched });
  };
  let tasteP = faithful(faithfulPlans[0]!);

  // Le compromis : mêmes goûts, assouplis là où l'effectif ne suit pas ; schéma au meilleur onze (le schéma du jeu
  // est avantagé), un souhait n'est gardé que s'il ne coûte pas trop au onze.
  const relaxed = new Set<TasteAxis>(tasteP.demands.map((d) => d.axis));
  const applied = applyTaste(baseTi, taste, relaxed);
  const value = (plan: FormationPlan) => plan.score + (keepsShape(plan) ? KEEP_FORM_BONUS : 0) + MUST_MAX_COST * possible(plan) - SHAPE_FLAW_COST * flaws(plan);
  const plan = [...base.plans].sort((a, b) => value(b) - value(a))[0]!;
  let tactic = fromPlan(plan, 'balance', name(plan.form), applied.ti, applied.mentality);
  let reference: BuiltTactic | null = null;
  // « Ma tactique du jeu, à corriger » : on garde ses postes, ses rôles et ses consignes (la familiarité est acquise)
  // et l'on n'y applique que les réponses ; le réglage automatique corrige ensuite les rôles qui coûtent au onze.
  // Le schéma du jeu est gardé même s'il ne fait pas partie des schémas types de l'appli (postes déplacés à la main,
  // tactique téléchargée) : c'est le choix « Ma tactique du jeu, à corriger ».
  if (game && taste.start === 'game') {
    const kept = applyTaste(game, taste, relaxed);
    const own: BuiltTactic = { ...game, id: 'balance', name: name(builtPlan(engine, game, players, reserve).form), slots: game.slots.map((s) => ({ ...s, pi: [] })), ti: kept.ti, mentality: kept.mentality };
    tactic = own;
    reference = game;
  }
  const dropped: TasteMust[] = [];
  for (const m of taste.musts) {
    if (mustMet(tactic.slots, m)) continue;
    const next = enforceRoles(engine, tactic, [m]);
    const cost = builtPlan(engine, tactic, players, reserve).fit - builtPlan(engine, next, players, reserve).fit;
    if (mustMet(next.slots, m) && cost <= MUST_MAX_COST) tactic = next;
    else dropped.push(m);
  }
  const notes: ProposalNote[] = [
    ...[...relaxed].map((axis) => ({ id: 'relaxed' as const, tone: 'warn' as const, params: { axis, choice: taste[axis] } })),
    ...dropped.map((m) => ({ id: 'mustDropped' as const, tone: 'warn' as const, params: { must: m } })),
  ];
  if (taste.tuning === 'simple') notes.unshift({ id: 'simple', tone: 'good', params: { count: tacticFeatures(tactic).count } });
  const balance = finish('balance', base.style, tactic, notes, false, { locked: applied.touched, reference });

  // Rien à assouplir : le compromis est aussi la plus fidèle ; la première carte montre alors un autre schéma.
  if (sameTactic(tasteP.tactic, balance.tactic)) {
    const other = faithfulPlans.find((p) => p.form !== balance.form);
    if (other) tasteP = faithful(other, true);
  }
  // Toujours la même tactique après réglage (schémas voisins ramenés aux mêmes rôles) : la première carte part du
  // style suivant le plus proche des réponses, pour montrer une vraie autre piste.
  if (sameTactic(tasteP.tactic, balance.tactic)) {
    const next = ranked.filter((r) => r !== base).map((r) => ({ r, s: near(r.style) })).sort((a, b) => b.s - a.s)[0];
    if (next) tasteP = faithful([...next.r.plans].sort((a, b) => possible(b) - possible(a) || flaws(a) - flaws(b) || b.score - a.score)[0]!, true, next.r);
  }
  // Même style et même schéma que le compromis : la carte « effectif » montre la piste suivante du classement.
  const sameAsBalance = (r: (typeof ranked)[number]) => r.style.id === base.style.id && r.plan.form === balance.form;
  const best = bySquad[0]!;
  let squadP = sameAsBalance(best.r) ? squadOf((bySquad.find((x) => !sameAsBalance(x.r)) ?? best).r, true, true) : squadOf(best.r, false, true);
  // Le réglage peut faire passer la piste suivante devant : on la règle aussi et l'on garde la meilleure des deux.
  const runner = bySquad.find((x) => !sameAsBalance(x.r) && x.r.style.id + x.r.plan.form !== squadP.style.id + squadP.form);
  if (runner && [tasteP, balance].some((p) => worth(p) > worth(squadP))) {
    const alt2 = squadOf(runner.r, squadP.alt, true);
    if (worth(alt2) > worth(squadP)) squadP = alt2;
  }
  // Une autre carte tient encore mieux l'effectif après réglage : celle-ci est alors annoncée comme « autre piste ».
  if (!squadP.alt && [tasteP, balance].some((p) => worth(p) > worth(squadP))) squadP = { ...squadP, alt: true };
  return [tasteP, balance, squadP];
}
