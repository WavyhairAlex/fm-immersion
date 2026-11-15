import type { FmPlayer } from './player';
import type { TacticEngine } from './tactic';
import { analyseBuiltTactic, defaultOption, OOP_TRAITS, rolesAt, type BuiltAnalysis, type BuiltTactic } from './tactic-builder';
import { TEAM_INSTRUCTIONS_FM27 } from './team-instructions-fm27';

/*
 * Note « Qualité » d'une tactique et réglage automatique.
 *
 * La note résume « Forces et faiblesses » en un chiffre sur 100 : 100 = aucun point à surveiller et trois jauges
 * (pénétration, soutien, solidité) au moins à GAUGE_FLOOR. Chaque point à surveiller retire WARN_COST (BAD_COST s'il
 * est grave), chaque point de jauge sous le plancher retire GAUGE_COST. Les trois jauges se partagent les dix joueurs
 * de champ : les pousser toutes à 100 est impossible, on demande donc un plancher équilibré, pas un maximum.
 *
 * Le réglage automatique (`optimiseTactic`) change un rôle ou retire une consigne à la fois tant que la note monte,
 * sans déplacer les postes. Choix de FM Immersion : une estimation à partir des rôles, pas une mesure du jeu.
 */

export const GAUGE_FLOOR = 60;
export const GAUGE_COST = 0.4;
export const WARN_COST = 6;
export const BAD_COST = 12;

/** Note « Qualité » sur 100 tirée de l'analyse d'une tactique. */
export function tacticQuality(a: Pick<BuiltAnalysis, 'findings' | 'scores'>): number {
  const issues = a.findings.reduce((s, f) => s + (f.tone === 'bad' ? BAD_COST : f.tone === 'warn' ? WARN_COST : 0), 0);
  const low = [a.scores.penetration, a.scores.support, a.scores.solidity].reduce((s, g) => s + Math.max(0, GAUGE_FLOOR - g) * GAUGE_COST, 0);
  return Math.round(Math.min(100, Math.max(0, 100 - issues - low)));
}

export interface OptimiseOptions {
  /** Contrainte à respecter après chaque changement (les goûts du joueur, par exemple) : un changement qui la casse est refusé. */
  accept?: (t: BuiltTactic) => boolean;
  /** Consignes d'équipe à ne pas toucher (identifiants du jeu). */
  lockedTi?: readonly number[];
  /** Tactique de référence (celle du jeu) : chaque rôle qui s'en écarte coûte ROLE_CHANGE_COST, la familiarité se perd. */
  reference?: BuiltTactic | null;
  /** Nombre maximal de changements. */
  maxSteps?: number;
}

export interface OptimiseResult {
  tactic: BuiltTactic;
  /** Note « Qualité » avant et après. */
  before: number;
  after: number;
  /** Nombre de rôles et de consignes changés. */
  roles: number;
  instructions: number;
}

/** Points de note sur 100 que vaut un point de note du onze (sur 20) : un rôle mieux équilibré ne doit pas ruiner le onze. */
export const FIT_WEIGHT = 15;
export const ROLE_CHANGE_COST = 1.5;
const MAX_STEPS = 14;
/** Candidats notés en entier à chaque pas, après le tri rapide. */
const SHORTLIST = 8;
/** Nombre de consignes d'équipe sous lequel une tactique n'est plus « chargée » (voir le constat `complex`). */
const LIGHT_TI = 9;

/**
 * Règle les rôles (avec et sans ballon) et allège les consignes d'équipe pour monter la note « Qualité », en gardant
 * les postes. Montée gloutonne : à chaque pas, le changement unique qui rapporte le plus ; on s'arrête quand plus rien
 * ne rapporte. La note du onze (joueurs dans leurs rôles) entre dans le calcul pour ne pas gagner un point d'équilibre
 * en perdant un joueur.
 */
export function optimiseTactic(engine: TacticEngine, start: BuiltTactic, players: FmPlayer[], opts: OptimiseOptions = {}): OptimiseResult {
  const locked = new Set(opts.lockedTi ?? []);
  const ref = opts.reference && opts.reference.slots.every((s, i) => s.pos === start.slots[i]?.pos) ? opts.reference : null;
  const moved = (t: BuiltTactic) => (ref ? t.slots.reduce((n, s, i) => n + (s.ip !== ref.slots[i]!.ip ? 1 : 0) + (s.oop !== ref.slots[i]!.oop ? 1 : 0), 0) : 0);
  // Note complète : analyse avec l'effectif (constats sur les joueurs compris) et note du onze dans ses rôles.
  const value = (t: BuiltTactic) => {
    const a = analyseBuiltTactic(engine, t, players);
    const q = tacticQuality(a);
    return { q, v: q + (a.squad?.fit ?? 0) * FIT_WEIGHT - moved(t) * ROLE_CHANGE_COST };
  };
  // Tri rapide des candidats sur la seule forme de la tactique (sans l'effectif) : seuls les meilleurs sont notés en entier.
  const rough = (t: BuiltTactic) => tacticQuality(analyseBuiltTactic(engine, t)) - moved(t) * ROLE_CHANGE_COST;
  let cur = start;
  let best = value(cur);
  const before = best.q;
  for (let step = 0; step < (opts.maxSteps ?? MAX_STEPS); step++) {
    const pool: { t: BuiltTactic; r: number }[] = [];
    const consider = (t: BuiltTactic) => {
      if (!opts.accept || opts.accept(t)) pool.push({ t, r: rough(t) });
    };
    cur.slots.forEach((slot, i) => {
      for (const r of rolesAt(engine, cur.slots, i, 'ip')) if (r.code !== slot.ip) consider({ ...cur, slots: cur.slots.map((s, k) => (k === i ? { ...s, ip: r.code } : s)) });
      const oopSlots = cur.slots.map((s) => ({ pos: s.posOOP }));
      for (const r of rolesAt(engine, oopSlots, i, 'oop')) if (r.code !== slot.oop) consider({ ...cur, slots: cur.slots.map((s, k) => (k === i ? { ...s, oop: r.code } : s)) });
    });
    for (const d of TEAM_INSTRUCTIONS_FM27) {
      if (locked.has(d.id) || cur.ti[d.id] == null || cur.ti[d.id] === defaultOption(d)) continue;
      const ti = { ...cur.ti };
      delete ti[d.id];
      consider({ ...cur, ti });
    }
    // Tactique chargée : une consigne retirée seule ne change rien, on allège d'un coup jusqu'au seuil.
    const free = TEAM_INSTRUCTIONS_FM27.filter((d) => !locked.has(d.id) && cur.ti[d.id] != null && cur.ti[d.id] !== defaultOption(d)).map((d) => d.id);
    const set = TEAM_INSTRUCTIONS_FM27.filter((d) => cur.ti[d.id] != null && cur.ti[d.id] !== defaultOption(d)).length;
    if (set > LIGHT_TI && free.length) {
      const ti = { ...cur.ti };
      for (const id of free.reverse().slice(0, set - LIGHT_TI)) delete ti[id];
      consider({ ...cur, ti });
    }
    // Pressing porté par trop peu de joueurs : un seul rôle de pressing en plus ne suffit pas, on en essaie deux à quatre
    // d'un coup, des attaquants vers les milieux.
    const oopSlots = cur.slots.map((s) => ({ pos: s.posOOP }));
    const pressable = cur.slots
      .map((s, i) => ({ i, code: OOP_TRAITS[s.oop] === 'press' ? null : (rolesAt(engine, oopSlots, i, 'oop').find((r) => OOP_TRAITS[r.code] === 'press')?.code ?? null) }))
      .filter((x): x is { i: number; code: string } => x.code != null)
      .reverse();
    for (const k of [2, 3, 4]) {
      if (pressable.length < k) break;
      const swap = new Map(pressable.slice(0, k).map((x) => [x.i, x.code]));
      consider({ ...cur, slots: cur.slots.map((s, i) => (swap.has(i) ? { ...s, oop: swap.get(i)! } : s)) });
    }
    let pick: { t: BuiltTactic; s: typeof best } | null = null;
    for (const c of pool.sort((a, b) => b.r - a.r).slice(0, SHORTLIST)) {
      const s = value(c.t);
      if (s.v > (pick?.s.v ?? best.v) + 0.05) pick = { t: c.t, s };
    }
    if (!pick) break;
    cur = (pick as { t: BuiltTactic }).t;
    best = (pick as { s: typeof best }).s;
  }
  const roles = cur.slots.reduce((n, s, i) => n + (s.ip !== start.slots[i]!.ip ? 1 : 0) + (s.oop !== start.slots[i]!.oop ? 1 : 0), 0);
  const instructions = TEAM_INSTRUCTIONS_FM27.filter((d) => (cur.ti[d.id] ?? defaultOption(d)) !== (start.ti[d.id] ?? defaultOption(d))).length;
  return { tactic: cur, before, after: best.q, roles, instructions };
}
