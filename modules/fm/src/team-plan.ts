import type { Project, ProjectSlot } from './project';
import type { TacticEngine } from './tactic';
import type { FmPlayer } from './player';
import type { Target } from './targets';

/**
 * Plan pour atteindre un niveau d'équipe visé (formule reprise de l'ancienne appli « FM Notebook » du coach).
 *
 * Moyenne du onze = moyenne des notes des titulaires dans leur rôle (sur 20). Toutes les cibles suivies qui font
 * mieux qu'un titulaire sont classées du plus gros gain au plus petit ; on les retient dans cet ordre (un poste et
 * une cible une seule fois) tant que l'argent et la marge salariale restants le permettent : chaque recrue retenue
 * en consomme une part. Chacune ajoute gain / 11 à la moyenne ; le plan s'arrête dès que la barre est passée.
 * Une cible sans prix connu n'est jamais comptée comme abordable : elle est listée à part, à faire chiffrer.
 */
export interface TeamUpgrade {
  slot: ProjectSlot;
  starter: FmPlayer | null;
  starterFit: number;
  player: Target;
  fit: number;
  delta: number;
  /** Prix retenu (valeur du joueur) et s'il est estimé (fourchette des recruteurs) plutôt que connu. */
  price: number | null;
  priceIsEst: boolean;
  /** Salaire (même unité que la masse salariale du club), null s'il est inconnu. */
  wage: number | null;
  /** Connaissance du joueur par tes recruteurs, en % (null si le jeu ne la donne pas). */
  knowledge: number | null;
  /** Moyenne du onze après cette recrue (en cumulant les précédentes du plan). */
  after: number;
}

export interface TeamPlanLimits {
  /** Argent disponible pour toutes les recrues du plan (null = sans limite). */
  budget: number | null;
  /** Marge salariale disponible pour toutes les recrues du plan (null = sans limite). */
  wageRoom: number | null;
}

export interface TeamPlan {
  xiAvg: number;
  /** Maillon faible : la note du poste le plus faible du onze. */
  floor: number;
  target: number;
  reachable: number;
  reached: boolean;
  /** Recrues retenues, du plus gros gain au plus petit, dans les limites d'argent et de salaire (cumulées). */
  upgrades: TeamUpgrade[];
  /** Les recrues qui suffisent à passer la barre (vide si hors de portée). */
  toTarget: TeamUpgrade[];
  /** Cibles qui feraient mieux qu'un titulaire mais dont le prix est inconnu : à faire chiffrer par tes recruteurs. */
  unpriced: Omit<TeamUpgrade, 'after'>[];
  /** Cibles écartées faute d'argent ou de marge salariale (la meilleure par poste). */
  tooDear: Omit<TeamUpgrade, 'after'>[];
  spent: number;
  wages: number;
}

/** Prix d'une cible : valeur connue, sinon milieu de la fourchette des recruteurs (estimé). */
export function targetPrice(t: Target): { price: number | null; isEst: boolean } {
  if (t.value != null && t.value > 0) return { price: t.value, isEst: false };
  const r = t.scout?.value;
  const v = r?.mid ?? r?.min ?? r?.max ?? null;
  return { price: v != null && v > 0 ? v : null, isEst: v != null };
}

const targetWage = (t: Target) => (t.wage != null && t.wage > 0 ? t.wage : (t.scout?.wage?.mid ?? t.scout?.wage?.max ?? null));

export function teamPlan(engine: TacticEngine, project: Project, pool: Target[], target: number, limits: TeamPlanLimits = { budget: null, wageRoom: null }): TeamPlan {
  const slots = project.slots;
  const n = slots.length || 11;
  const fitOf = (p: FmPlayer, sl: ProjectSlot) => {
    const a = engine.roleFit(p, sl.ip, 'ip', sl.pos);
    const b = engine.roleFit(p, sl.oop, 'oop', sl.posOOP ?? sl.pos);
    return a == null || b == null ? null : (a + b) / 2;
  };
  const xiAvg = slots.reduce((s, sl) => s + (sl.fit ?? 0), 0) / n;
  const floor = slots.length ? Math.min(...slots.map((sl) => sl.fit ?? 0)) : 0;
  // Toutes les paires poste × cible qui font mieux que le titulaire, du plus gros gain au plus petit.
  const pairs: Omit<TeamUpgrade, 'after'>[] = [];
  for (const sl of slots) {
    const starterFit = sl.fit ?? 0;
    for (const p of pool) {
      if (!p.positions.includes(sl.pos) || !Object.keys(p.attributes).length) continue;
      const fit = fitOf(p, sl);
      if (fit == null || fit <= starterFit) continue;
      const { price, isEst } = targetPrice(p);
      pairs.push({ slot: sl, starter: sl.player, starterFit, player: p, fit, delta: fit - starterFit, price, priceIsEst: isEst, wage: targetWage(p), knowledge: p.scout?.knowledge ?? null });
    }
  }
  pairs.sort((a, b) => b.delta - a.delta);
  // Glouton : chaque poste et chaque cible une seule fois ; l'argent et la marge salariale baissent à chaque recrue.
  let money = limits.budget;
  let room = limits.wageRoom;
  const filled = new Set<ProjectSlot>();
  const used = new Set<string>();
  const upgrades: TeamUpgrade[] = [];
  const unpriced = new Map<ProjectSlot, Omit<TeamUpgrade, 'after'>>();
  const tooDear = new Map<ProjectSlot, Omit<TeamUpgrade, 'after'>>();
  let run = xiAvg;
  let spent = 0;
  let wages = 0;
  for (const u of pairs) {
    if (filled.has(u.slot) || used.has(u.player.id)) continue;
    if (u.price == null) {
      if (!unpriced.has(u.slot)) unpriced.set(u.slot, u);
      continue;
    }
    if ((money != null && u.price > money) || (room != null && u.wage != null && u.wage > room)) {
      if (!tooDear.has(u.slot)) tooDear.set(u.slot, u);
      continue;
    }
    filled.add(u.slot);
    used.add(u.player.id);
    if (money != null) money -= u.price;
    if (room != null && u.wage != null) room -= u.wage;
    spent += u.price;
    wages += u.wage ?? 0;
    run += u.delta / n;
    upgrades.push({ ...u, after: run });
  }
  const reachable = run;
  const reached = reachable >= target - 1e-6;
  const toTarget: TeamUpgrade[] = [];
  if (xiAvg < target && reached) for (const u of upgrades) { toTarget.push(u); if (u.after >= target - 1e-6) break; }
  const open = (m: Map<ProjectSlot, Omit<TeamUpgrade, 'after'>>) => {
    // Un joueur n'apparaît qu'une fois, à son poste le plus utile.
    const seen = new Set<string>();
    return [...m.values()]
      .filter((u) => !filled.has(u.slot) && !used.has(u.player.id))
      .sort((a, b) => b.delta - a.delta)
      .filter((u) => !seen.has(u.player.id) && seen.add(u.player.id));
  };
  return { xiAvg, floor, target, reachable, reached, upgrades, toTarget, unpriced: open(unpriced), tooDear: open(tooDear), spent, wages };
}
