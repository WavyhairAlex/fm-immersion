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
  /** Réserve et jeunes : ils dépannent un poste que l'équipe première ne couvre pas. */
  reserve?: FmPlayer[];
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
/** Changements « latéraux » explorés un coup plus loin quand la montée simple est bloquée. */
const LOOKAHEAD = 4;

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
    const a = analyseBuiltTactic(engine, t, players, opts.reserve ?? []);
    const q = tacticQuality(a);
    return { q, v: q + (a.squad?.fit ?? 0) * FIT_WEIGHT - moved(t) * ROLE_CHANGE_COST };
  };
  // Tri rapide des candidats sur la seule forme de la tactique (sans l'effectif) : seuls les meilleurs sont notés en entier.
  // `sig` : les points à surveiller de la forme, pour repérer un changement qui en échange un contre un autre.
  const rough = (t: BuiltTactic) => {
    const a = analyseBuiltTactic(engine, t);
    return { r: tacticQuality(a) - moved(t) * ROLE_CHANGE_COST, sig: a.findings.filter((f) => f.tone !== 'good').map((f) => f.id).sort().join(' ') };
  };
  const set = (t: BuiltTactic) => TEAM_INSTRUCTIONS_FM27.filter((d) => t.ti[d.id] != null && t.ti[d.id] !== defaultOption(d));
  type Cand = { t: BuiltTactic; r: number; sig: string };
  /** Tous les changements d'un pas à partir d'une tactique : un rôle, une consigne retirée, ou un changement groupé. */
  const candidates = (cur: BuiltTactic): Cand[] => {
    const pool: Cand[] = [];
    const consider = (t: BuiltTactic) => {
      if (!opts.accept || opts.accept(t)) pool.push({ t, ...rough(t) });
    };
    const oopSlots = cur.slots.map((s) => ({ pos: s.posOOP }));
    cur.slots.forEach((slot, i) => {
      for (const r of rolesAt(engine, cur.slots, i, 'ip')) if (r.code !== slot.ip) consider({ ...cur, slots: cur.slots.map((s, k) => (k === i ? { ...s, ip: r.code } : s)) });
      for (const r of rolesAt(engine, oopSlots, i, 'oop')) if (r.code !== slot.oop) consider({ ...cur, slots: cur.slots.map((s, k) => (k === i ? { ...s, oop: r.code } : s)) });
    });
    const active = set(cur);
    for (const d of active) {
      if (locked.has(d.id)) continue;
      const ti = { ...cur.ti };
      delete ti[d.id];
      consider({ ...cur, ti });
    }
    // Tactique chargée : une consigne retirée seule ne change rien, on allège d'un coup jusqu'au seuil. Les consignes
    // libres partent d'abord ; celles qui portent les goûts ne partent que si la contrainte (`accept`) tient encore.
    if (active.length > LIGHT_TI) {
      let ti = { ...cur.ti };
      let left = active.length;
      const order = [...active.filter((d) => !locked.has(d.id)).reverse(), ...(opts.accept ? active.filter((d) => locked.has(d.id)).reverse() : [])];
      for (const d of order) {
        if (left <= LIGHT_TI) break;
        const next = { ...ti };
        delete next[d.id];
        if (opts.accept && !opts.accept({ ...cur, ti: next })) continue;
        ti = next;
        left--;
      }
      if (left < active.length) consider({ ...cur, ti });
    }
    // Pressing porté par trop peu de joueurs : un seul rôle de pressing en plus ne suffit pas, on en essaie deux à quatre
    // d'un coup, des attaquants vers les milieux.
    const pressable = cur.slots
      .map((s, i) => ({ i, code: OOP_TRAITS[s.oop] === 'press' ? null : (rolesAt(engine, oopSlots, i, 'oop').find((r) => OOP_TRAITS[r.code] === 'press')?.code ?? null) }))
      .filter((x): x is { i: number; code: string } => x.code != null)
      .reverse();
    for (const k of [2, 3, 4]) {
      if (pressable.length < k) break;
      const swap = new Map(pressable.slice(0, k).map((x) => [x.i, x.code]));
      consider({ ...cur, slots: cur.slots.map((s, i) => (swap.has(i) ? { ...s, oop: swap.get(i)! } : s)) });
    }
    return pool.sort((a, b) => b.r - a.r);
  };
  type Scored = ReturnType<typeof value>;
  /** Le meilleur changement d'un pas, s'il fait mieux que `floor`. */
  const bestOf = (pool: Cand[], floor: number, n = SHORTLIST): { t: BuiltTactic; s: Scored } | null => {
    let pick: { t: BuiltTactic; s: Scored } | null = null;
    for (const c of pool.slice(0, n)) {
      const s = value(c.t);
      if (s.v > (pick?.s.v ?? floor) + 0.05) pick = { t: c.t, s };
    }
    return pick;
  };
  let cur = start;
  let best = value(cur);
  const before = best.q;
  // Rôles impossibles au poste (schéma repris tel quel, rôle disparu du jeu) : réparés d'abord, un par un. Le constat
  // les compte ensemble, la montée simple n'en corrigerait donc aucun.
  for (const phase of ['ip', 'oop'] as const) {
    for (let i = 0; i < cur.slots.length; i++) {
      const at = phase === 'ip' ? cur.slots : cur.slots.map((s) => ({ pos: s.posOOP }));
      const valid = rolesAt(engine, at, i, phase);
      if (!valid.length || valid.some((r) => r.code === cur.slots[i]![phase])) continue;
      let fix: { t: BuiltTactic; s: ReturnType<typeof value> } | null = null;
      for (const r of valid) {
        const t: BuiltTactic = { ...cur, slots: cur.slots.map((s, k) => (k === i ? { ...s, [phase]: r.code } : s)) };
        if (opts.accept && !opts.accept(t)) continue;
        const s = value(t);
        if (!fix || s.v > fix.s.v) fix = { t, s };
      }
      if (fix) {
        cur = fix.t;
        best = fix.s;
      }
    }
  }
  for (let step = 0; step < (opts.maxSteps ?? MAX_STEPS); step++) {
    const pool = candidates(cur);
    let pick = bestOf(pool, best.v);
    if (!pick && best.q < 100) {
      // Palier : aucun changement seul ne rapporte. On regarde un coup plus loin, à partir des changements qui échangent
      // un point à surveiller contre un autre (un latéral rendu au couloir qui laisse l'équipe sans meneur, par exemple).
      const here = rough(cur);
      const lateral = pool.filter((c) => c.sig !== here.sig && c.r >= here.r - WARN_COST).slice(0, LOOKAHEAD);
      for (const l of lateral) {
        const next = bestOf(candidates(l.t), pick?.s.v ?? best.v, LOOKAHEAD);
        if (next) pick = next;
      }
    }
    if (!pick) break;
    cur = pick.t;
    best = pick.s;
  }
  const roles = cur.slots.reduce((n, s, i) => n + (s.ip !== start.slots[i]!.ip ? 1 : 0) + (s.oop !== start.slots[i]!.oop ? 1 : 0), 0);
  const instructions = TEAM_INSTRUCTIONS_FM27.filter((d) => (cur.ti[d.id] ?? defaultOption(d)) !== (start.ti[d.id] ?? defaultOption(d))).length;
  return { tactic: cur, before, after: best.q, roles, instructions };
}
