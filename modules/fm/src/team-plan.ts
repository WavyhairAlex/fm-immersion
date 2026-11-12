import type { Project, ProjectSlot } from './project';
import type { TacticEngine } from './tactic';
import type { FmPlayer } from './player';
import type { Target } from './targets';

/**
 * Plan pour atteindre un niveau d'équipe visé (formule reprise de l'ancienne appli « FM Notebook » du coach).
 *
 * Moyenne du onze = moyenne des notes des titulaires dans leur rôle (sur 20). Pour chaque poste, on cherche
 * parmi les cibles suivies la meilleure recrue abordable (prix ≤ enveloppe par joueur) qui fait mieux que le
 * titulaire. On classe ces améliorations du plus gros gain au plus petit (une recrue ne sert qu'une fois),
 * puis on les prend dans l'ordre jusqu'à passer la barre : chacune ajoute gain / 11 à la moyenne.
 * « Atteignable » = moyenne si chaque poste prenait sa meilleure recrue abordable.
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
  /** Moyenne du onze après cette recrue (en cumulant les précédentes du plan). */
  after: number;
}

export interface TeamPlan {
  xiAvg: number;
  target: number;
  reachable: number;
  reached: boolean;
  /** Toutes les améliorations abordables, du plus gros gain au plus petit. */
  upgrades: TeamUpgrade[];
  /** Les recrues qui suffisent à passer la barre (vide si hors de portée). */
  toTarget: TeamUpgrade[];
}

/** Prix d'une cible : valeur connue, sinon milieu de la fourchette des recruteurs (estimé). */
export function targetPrice(t: Target): { price: number | null; isEst: boolean } {
  if (t.value != null && t.value > 0) return { price: t.value, isEst: false };
  const r = t.scout?.value;
  const v = r?.mid ?? r?.min ?? r?.max ?? null;
  return { price: v != null && v > 0 ? v : null, isEst: v != null };
}

export function teamPlan(engine: TacticEngine, project: Project, pool: Target[], target: number, cap: number | null): TeamPlan {
  const slots = project.slots;
  const n = slots.length || 11;
  const fitOf = (p: FmPlayer, sl: ProjectSlot) => {
    const a = engine.roleFit(p, sl.ip, 'ip', sl.pos);
    const b = engine.roleFit(p, sl.oop, 'oop', sl.posOOP ?? sl.pos);
    return a == null || b == null ? null : (a + b) / 2;
  };
  const xiAvg = slots.reduce((s, sl) => s + (sl.fit ?? 0), 0) / n;
  const best: Omit<TeamUpgrade, 'after'>[] = [];
  for (const sl of slots) {
    const starterFit = sl.fit ?? 0;
    let top: Omit<TeamUpgrade, 'after'> | null = null;
    for (const p of pool) {
      if (!p.positions.includes(sl.pos) || !Object.keys(p.attributes).length) continue;
      const fit = fitOf(p, sl);
      if (fit == null || fit <= starterFit) continue;
      const { price, isEst } = targetPrice(p);
      if (cap != null && price != null && price > cap) continue;
      if (!top || fit > top.fit) top = { slot: sl, starter: sl.player, starterFit, player: p, fit, delta: fit - starterFit, price, priceIsEst: isEst };
    }
    if (top) best.push(top);
  }
  best.sort((a, b) => b.delta - a.delta);
  const used = new Set<string>();
  const upgrades: TeamUpgrade[] = [];
  let run = xiAvg;
  for (const u of best) {
    if (used.has(u.player.id)) continue;
    used.add(u.player.id);
    run += u.delta / n;
    upgrades.push({ ...u, after: run });
  }
  const bySlot = new Map(upgrades.map((u) => [u.slot, u.fit]));
  const reachable = slots.reduce((s, sl) => s + Math.max(sl.fit ?? 0, bySlot.get(sl) ?? 0), 0) / n;
  const toTarget: TeamUpgrade[] = [];
  if (xiAvg < target) for (const u of upgrades) { toTarget.push(u); if (u.after >= target - 1e-6) break; }
  const reached = reachable >= target - 1e-6;
  return { xiAvg, target, reachable, reached, upgrades, toTarget: reached ? toTarget : [] };
}
