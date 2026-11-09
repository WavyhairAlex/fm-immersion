import { CONDITION_HORIZON_DAYS, ROTATION_CONDITION, TIRED_CONDITION } from './briefing';
import { unavailable, type FmPlayer } from './player';
import type { FormationPlan, TacticEngine } from './tactic';

/**
 * Écart d'adéquation (sur 20) qu'on accepte pour reposer un titulaire : plus large pour un joueur fatigué (sous 85 %,
 * il joue nettement moins bien) que pour une simple rotation. Au-delà, il joue quand même.
 */
export const REST_MAX_DROP = { tired: 5, rotation: 3 } as const;
/** Un remplaçant n'est « frais » que s'il est au-dessus de 85 % et nettement plus en forme que le titulaire. */
export const FRESHER_BY = 5;

export interface MatchdayChange {
  slot: number;
  out: FmPlayer;
  /** Remplaçant retenu ; null si personne ne peut tenir le poste (le titulaire absent laisse un trou). */
  in: FmPlayer | null;
  /** Absent (blessé, suspendu), fatigué (sous 85 %), ou à faire tourner (coupe, calendrier chargé : sous 92 %). */
  reason: 'unavailable' | 'tired' | 'rotation';
}

/**
 * Onze du prochain match : le onze de base (celui du jeu ou le calculé) corrigé pour ce match-là.
 * Les absents sont remplacés ; les titulaires sous le seuil de condition (85 %, ou 92 % quand il faut faire tourner)
 * laissent leur place au meilleur joueur frais du poste, si l'écart d'adéquation reste raisonnable.
 */
export function matchdayPlan(engine: TacticEngine, plan: FormationPlan, players: FmPlayer[], opts: { rotate: boolean; inDays?: number | null }): { plan: FormationPlan; changes: MatchdayChange[] } {
  const limit = opts.rotate ? ROTATION_CONDITION : TIRED_CONDITION;
  // Match lointain (trêve) : la condition d'aujourd'hui sera remontée, seuls les absents comptent.
  const far = opts.inDays != null && opts.inDays > CONDITION_HORIZON_DAYS;
  const fresh = (c: FmPlayer, out: FmPlayer) =>
    !unavailable(c) && (c.condition ?? 100) >= TIRED_CONDITION && (c.condition ?? 100) >= (out.condition ?? 100) + FRESHER_BY;
  const slots = plan.slots.map((s) => ({ ...s }));
  const xi = new Set(slots.flatMap((s) => (s.player ? [s.player.id] : [])));
  const fitAt = (p: FmPlayer, i: number) => {
    const s = slots[i]!;
    return ((engine.roleFit(p, s.ip, 'ip', s.pos) ?? 0) + (engine.roleFit(p, s.oop, 'oop', s.pos) ?? 0)) / 2;
  };
  const changes: MatchdayChange[] = [];
  // Les absents d'abord (le poste doit être tenu), puis les plus fatigués.
  const order = slots
    .map((s, i) => ({ i, p: s.player }))
    .filter((x): x is { i: number; p: FmPlayer } => !!x.p)
    .map((x) => ({ ...x, reason: unavailable(x.p) ? ('unavailable' as const) : far ? null : x.p.condition != null && x.p.condition < TIRED_CONDITION ? ('tired' as const) : x.p.condition != null && x.p.condition < limit ? ('rotation' as const) : null }))
    .filter((x) => x.reason)
    .sort((a, b) => (a.reason === 'unavailable' ? -1 : 0) - (b.reason === 'unavailable' ? -1 : 0) || (a.p.condition ?? 100) - (b.p.condition ?? 100));
  for (const { i, p, reason } of order) {
    const pos = slots[i]!.pos;
    const cands = players
      .filter((c) => !xi.has(c.id) && !unavailable(c) && engine.canPlay(c, pos))
      .map((c) => ({ c, f: fitAt(c, i), fresh: fresh(c, p) }))
      .sort((a, b) => Number(b.fresh) - Number(a.fresh) || b.f - a.f);
    const best = cands[0];
    if (reason === 'unavailable') {
      // Un absent ne joue pas : le meilleur disponible, même entamé.
      const pick = cands.sort((a, b) => b.f - a.f)[0];
      xi.delete(p.id);
      if (pick) xi.add(pick.c.id);
      slots[i]!.player = pick?.c ?? null;
      slots[i]!.fit = pick ? pick.f : null;
      changes.push({ slot: i, out: p, in: pick?.c ?? null, reason });
      continue;
    }
    if (!best || !best.fresh || best.f < fitAt(p, i) - REST_MAX_DROP[reason!]) continue;
    xi.delete(p.id);
    xi.add(best.c.id);
    slots[i]!.player = best.c;
    slots[i]!.fit = best.f;
    changes.push({ slot: i, out: p, in: best.c, reason: reason! });
  }
  if (!changes.length) return { plan, changes };
  // Doublures : les titulaires reposés en premier (ils peuvent entrer), puis les anciennes doublures encore libres.
  const subs = slots.map((_, i) => {
    const rested = changes.filter((c) => c.slot === i && c.reason !== 'unavailable').map((c) => c.out);
    return [...rested, ...(plan.subs[i] ?? []).filter((p) => !xi.has(p.id) && !rested.includes(p))];
  });
  return { plan: { ...plan, slots, subs }, changes };
}
