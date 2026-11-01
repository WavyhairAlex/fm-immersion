import type { FmPlayer } from './player';
import { POS_ORDER, type PosCode } from './positions';
import type { Project } from './project';
import type { Slot, TacticEngine } from './tactic';

/**
 * Compatibilité d'un joueur avec le projet de jeu : son profil colle-t-il aux rôles du style visé ?
 *
 * On compare sa meilleure note dans un rôle du onze du projet (aux postes qu'il sait jouer) à sa meilleure note
 * possible, tous rôles confondus, sur ces mêmes postes naturels. L'écart dit si le projet le sous-emploie :
 * un joueur faible mais fait pour ce jeu est compatible ; un bon joueur dont le profil ne sert pas le style ne l'est
 * pas. Le niveau du joueur, lui, est jugé ailleurs (titulaire, doublure, en trop). Sert à ne pas investir de temps
 * (entraînement, temps de jeu, prolongation, transfert) sur un profil qui ne servira pas le projet.
 */

export type Compat = 'yes' | 'partial' | 'no';
export interface ProjectCompat {
  compat: Compat;
  /** Meilleure note dans un rôle du projet (moyenne avec et sans ballon), sur 20. */
  fit: number | null;
  /** Meilleure note possible à ses postes, tous rôles confondus, sur 20. */
  best: number | null;
  /** Écart entre les deux (≥ 0). */
  gap: number | null;
  /** Créneau du projet où il est le plus adapté. */
  slot: Slot | null;
  /** Aucun poste du schéma du projet n'est dans ses cordes. */
  noPosition: boolean;
}

/** Écarts (sur 20, 1 point = une demi-étoile) jusqu'où le profil est jugé compatible, puis en partie. */
export const COMPAT_YES = 0.6;
export const COMPAT_PARTIAL = 1.6;

const slotFit = (engine: TacticEngine, p: FmPlayer, sl: Slot) => {
  const a = engine.roleFit(p, sl.ip, 'ip', sl.pos);
  const b = engine.roleFit(p, sl.oop, 'oop', sl.pos);
  return a == null || b == null ? null : (a + b) / 2;
};

/** Meilleure note possible du joueur à un poste, en prenant le meilleur rôle avec et sans ballon. */
function bestAt(engine: TacticEngine, p: FmPlayer, pos: PosCode): number | null {
  const a = engine.bestAtPos(p, pos, 'ip')?.fit;
  const b = engine.bestAtPos(p, pos, 'oop')?.fit;
  return a == null || b == null ? null : (a + b) / 2;
}

export function projectCompat(engine: TacticEngine, project: Project, p: FmPlayer): ProjectCompat {
  // Postes « à lui » : ses postes naturels, ou ceux où le jeu le juge apte.
  const mine = POS_ORDER.filter((pos) => p.positions.includes(pos) || engine.canPlay(p, pos));
  let fit: number | null = null;
  let slot: Slot | null = null;
  for (const sl of project.slots) {
    if (!mine.includes(sl.pos)) continue;
    const f = slotFit(engine, p, sl);
    if (f != null && (fit == null || f > fit)) {
      fit = f;
      slot = sl;
    }
  }
  let best: number | null = null;
  for (const pos of mine) {
    const b = bestAt(engine, p, pos);
    if (b != null && (best == null || b > best)) best = b;
  }
  if (fit == null) return { compat: 'no', fit: null, best, gap: null, slot: null, noPosition: true };
  const gap = Math.max(0, (best ?? fit) - fit);
  return { compat: gap <= COMPAT_YES ? 'yes' : gap <= COMPAT_PARTIAL ? 'partial' : 'no', fit, best, gap, slot, noPosition: false };
}

/** Compatibilité de chaque joueur d'une liste, par identifiant. */
export function compatMap(engine: TacticEngine, project: Project | null, list: FmPlayer[]): Map<string, ProjectCompat> {
  const out = new Map<string, ProjectCompat>();
  if (!project) return out;
  for (const p of list) if (Object.keys(p.attributes).length) out.set(p.id, projectCompat(engine, project, p));
  return out;
}
