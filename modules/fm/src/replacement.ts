import { squadPlaces } from './mercato';
import type { FmPlayer } from './player';
import type { PosCode } from './positions';
import type { Project, ProjectSlot } from './project';
import type { DbPlayer } from './targets';
import { baseTarget } from './targets';
import type { Slot, TacticEngine } from './tactic';

/**
 * Remplaçant d'un partant : pour un joueur qu'on vend, qu'on laisse partir ou qui veut s'en aller, les joueurs
 * qui tiendraient son poste du onze cible, avec l'écart de note (adéquation sur 20) avec lui.
 * Les candidats viennent des cibles déjà suivies ou d'une recherche dans la base du jeu ; la meilleure solution
 * interne (un joueur de l'effectif qui n'est pas déjà titulaire ailleurs) sert de repère.
 */

/** Adéquation moyenne avec et sans ballon d'un joueur au créneau. */
export function fitAt(engine: TacticEngine, p: FmPlayer, sl: Slot): number | null {
  const a = engine.roleFit(p, sl.ip, 'ip', sl.pos);
  const b = engine.roleFit(p, sl.oop, 'oop', sl.pos);
  return a == null || b == null ? null : (a + b) / 2;
}

export interface ReplacementCandidate<T extends FmPlayer = FmPlayer> {
  player: T;
  fit: number;
  /** Écart avec le partant (sur 20) : positif = mieux que lui. */
  delta: number;
}

export interface Replacement<T extends FmPlayer = FmPlayer> {
  leaving: FmPlayer;
  /** Poste du onze cible qu'il tient (ou qu'il tiendrait le mieux), null s'il ne joue à aucun poste du schéma. */
  slot: ProjectSlot | null;
  /** Titulaire de ce poste aujourd'hui dans le onze cible. */
  starter: boolean;
  fit: number | null;
  /** Meilleure solution de l'effectif (hors partant et hors autres titulaires). */
  internal: ReplacementCandidate | null;
  candidates: ReplacementCandidate<T>[];
}

/** Poste du onze cible tenu par le joueur, sinon celui de ses postes où il serait le meilleur. */
export function slotOf(engine: TacticEngine, project: Project, p: FmPlayer): { slot: ProjectSlot | null; starter: boolean } {
  const own = project.slots.find((sl) => sl.player?.id === p.id);
  if (own) return { slot: own, starter: true };
  let best: { slot: ProjectSlot; fit: number } | null = null;
  for (const sl of project.slots) {
    if (!p.positions.includes(sl.pos)) continue;
    const f = fitAt(engine, p, sl);
    if (f != null && (!best || f > best.fit)) best = { slot: sl, fit: f };
  }
  return { slot: best?.slot ?? null, starter: false };
}

/** Postes à chercher dans la base pour remplacer le joueur (celui du onze cible, sinon ses postes naturels). */
export function replacementPositions(engine: TacticEngine, project: Project, p: FmPlayer): PosCode[] {
  const { slot } = slotOf(engine, project, p);
  return slot ? [slot.pos] : p.positions;
}

export function replacementFor<T extends FmPlayer>(
  engine: TacticEngine,
  project: Project,
  leaving: FmPlayer,
  candidates: T[],
  squad: FmPlayer[] = [],
): Replacement<T> {
  const { slot, starter } = slotOf(engine, project, leaving);
  if (!slot) return { leaving, slot: null, starter, fit: null, internal: null, candidates: [] };
  const fit = fitAt(engine, leaving, slot);
  const ref = fit ?? 0;
  const rank = <P extends FmPlayer>(list: P[]): ReplacementCandidate<P>[] =>
    list
      .filter((c) => c.id !== leaving.id && c.positions.includes(slot.pos))
      .flatMap((c) => {
        const f = fitAt(engine, c, slot);
        return f == null ? [] : [{ player: c, fit: f, delta: f - ref }];
      })
      .sort((a, b) => b.fit - a.fit);
  const others = new Set(project.slots.flatMap((sl) => (sl !== slot && sl.player ? [sl.player.id] : [])));
  const internal = rank(squad.filter((p) => !others.has(p.id)))[0] ?? null;
  return { leaving, slot, starter, fit, internal, candidates: rank(candidates) };
}

/* ---------- Niveau de la division ---------- */

/** Onze d'un club de la division, évalué sur le schéma du projet. */
export interface ClubLevel {
  clubId: number;
  club: string;
  /** Adéquation moyenne des titulaires au schéma du projet (sur 20). */
  xiFit: number | null;
  /** CA moyen des onze meilleurs CA du club (0-200). */
  xiCa: number;
  players: number;
  own: boolean;
}

export interface DivisionLevel {
  division: string;
  reputation: number | null;
  clubs: ClubLevel[];
  /** Rang de notre club (1 = meilleur onze), null s'il n'est pas dans cette division. */
  ownRank: number | null;
  /** Repères : moyenne des trois meilleurs onze, onze médian, et le plus faible. */
  top3: number | null;
  median: number | null;
  bottom: number | null;
  top3Ca: number;
  medianCa: number;
}

/** Moins de joueurs que ça : club incomplet (équipe réserve mal rattachée, club sans effectif), ignoré. */
const MIN_CLUB_PLAYERS = 11;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Niveau des clubs d'une ou plusieurs divisions lues dans la base du jeu : pour chaque club, son meilleur onze sur
 * le schéma du projet (même calcul que pour notre effectif) et le CA moyen de ses onze meilleurs joueurs.
 * Les vraies valeurs du jeu sont lues pour tous les clubs, le nôtre compris : la comparaison est à base égale.
 */
export function divisionLevels(engine: TacticEngine, slots: Slot[], players: DbPlayer[], ownClubId: number | null): DivisionLevel[] {
  const byDivision = new Map<string, DbPlayer[]>();
  for (const p of players) {
    if (p.clubId == null || !p.division) continue;
    const list = byDivision.get(p.division) ?? [];
    list.push(p);
    byDivision.set(p.division, list);
  }
  const out: DivisionLevel[] = [];
  for (const [division, list] of byDivision) {
    const byClub = new Map<number, DbPlayer[]>();
    for (const p of list) byClub.set(p.clubId!, [...(byClub.get(p.clubId!) ?? []), p]);
    const clubs: ClubLevel[] = [];
    for (const [clubId, ps] of byClub) {
      if (ps.length < MIN_CLUB_PLAYERS) continue;
      const fm = ps.filter((p) => !p.injured).flatMap((p) => baseTarget(p) ?? []);
      const places = squadPlaces(engine, slots, fm);
      const fits = [...places.values()].filter((pl) => pl.tier === 0 && pl.fit != null).map((pl) => pl.fit!);
      const cas = ps.map((p) => p.ca).sort((a, b) => b - a).slice(0, 11);
      clubs.push({
        clubId,
        club: ps[0]!.club ?? String(clubId),
        xiFit: fits.length ? mean(fits) : null,
        xiCa: mean(cas) ?? 0,
        players: ps.length,
        own: clubId === ownClubId,
      });
    }
    clubs.sort((a, b) => (b.xiFit ?? -1) - (a.xiFit ?? -1) || b.xiCa - a.xiCa);
    const fits = clubs.flatMap((c) => (c.xiFit == null ? [] : [c.xiFit]));
    const cas = clubs.map((c) => c.xiCa);
    const own = clubs.findIndex((c) => c.own);
    out.push({
      division,
      reputation: list.find((p) => p.divisionReputation != null)?.divisionReputation ?? null,
      clubs,
      ownRank: own < 0 ? null : own + 1,
      top3: mean(fits.slice(0, 3)),
      median: medianOf(fits),
      bottom: fits.length ? fits[fits.length - 1]! : null,
      top3Ca: mean([...cas].sort((a, b) => b - a).slice(0, 3)) ?? 0,
      medianCa: medianOf(cas) ?? 0,
    });
  }
  return out.sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));
}
