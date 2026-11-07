import { moraleLevel } from './club';
import { unavailable, type FmPlayer } from './player';
import type { PosCode } from './positions';
import { ROLE_RATINGS_FM27, roleThreshold } from './role-ratings-fm27';
import type { StatKey, StatMark } from './stats';
import { footInfo, INVERTED, sideOf, type FormationPlan, type TacticEngine } from './tactic';

/**
 * Pourquoi un joueur ne performe pas à son poste : pour chaque titulaire du onze (poste + rôles avec et sans ballon),
 * on compare sa note en match à celle des autres titulaires, puis on cherche les causes, de la plus lourde à la plus
 * légère :
 * - le poste : familiarité (pas naturel), pied du mauvais côté ;
 * - le rôle : note au rôle faible, attributs clés du rôle trop bas, rôle exigeant au-dessus de son niveau (seuil FM27) ;
 * - le match : stats de sa ligne où il est dans le moins bon quart ;
 * - la forme : condition, rythme, moral ;
 * - et s'il y a mieux : un autre joueur disponible noté plus haut à ce créneau.
 * Tout vient de ce que FM Immersion lit déjà (instantané, Centre de données, résultats) : rien de nouveau dans le jeu.
 */

export type DiagReason =
  | { kind: 'familiarity'; value: number }
  | { kind: 'foot'; side: 'L' | 'R' }
  | { kind: 'roleFit'; fit: number; xi: number }
  | { kind: 'keyAttrs'; attrs: { key: string; value: number }[] }
  | { kind: 'threshold'; ca: number | null; t: number }
  | { kind: 'stats'; marks: StatMark[] }
  | { kind: 'condition'; value: number }
  | { kind: 'sharpness'; value: number }
  | { kind: 'morale'; text: string }
  | { kind: 'better'; player: FmPlayer; fit: number };

export interface PlayerDiagnosis {
  player: FmPlayer;
  slot: number;
  pos: PosCode;
  ip: string;
  oop: string;
  /** Note moyenne en match (matchs récents retrouvés, sinon note de la saison). */
  rating: number | null;
  /** Matchs derrière la note récente (0 = note de la saison). */
  ratedMatches: number;
  /** Écart à la moyenne des titulaires (négatif = en dessous). */
  gap: number | null;
  /** Sous la moyenne du onze d'au moins RATING_GAP, ou sous BAD_RATING. */
  under: boolean;
  reasons: DiagReason[];
}

/** Écart de note jugé parlant, et note sous laquelle un titulaire déçoit quoi qu'il arrive. */
export const RATING_GAP = 0.25;
export const BAD_RATING = 6.6;
/** Attribut clé jugé trop bas pour le rôle. */
export const WEAK_ATTR = 10;
/** Familiarité au poste sous laquelle il n'est pas naturel (sur 20). */
export const NATURAL = 15;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/**
 * Diagnostic de chaque titulaire du plan. `ratings` : notes des derniers matchs par id de joueur (résultats
 * retrouvés), `marks` : points faibles en match par id (Centre de données, déjà classés dans la ligne).
 */
export function diagnoseLineup(
  engine: TacticEngine,
  plan: FormationPlan,
  squad: FmPlayer[],
  opts: { ratings?: Map<string, number[]>; weaknesses?: Map<string, StatMark[]> } = {},
): PlayerDiagnosis[] {
  const xi = plan.slots.flatMap((s, slot) => (s.player ? [{ s, slot, p: s.player }] : []));
  const ratingOf = (p: FmPlayer) => {
    const recent = (opts.ratings?.get(p.id) ?? []).slice(-5);
    if (recent.length) return { rating: round(mean(recent)!), n: recent.length };
    return { rating: (p.apps ?? 0) > 0 && p.avgRating ? p.avgRating : null, n: 0 };
  };
  const rated = xi.map((x) => ({ ...x, ...ratingOf(x.p) }));
  const xiAvg = mean(rated.flatMap((x) => (x.rating != null ? [x.rating] : [])));
  const fits = xi.flatMap((x) => (x.s.fit != null ? [x.s.fit] : []));
  const xiFit = mean(fits);
  const used = new Set(xi.map((x) => x.p.id));
  const attrMemo = new Map<string, number | null>();
  const xiAttr = (k: string) => {
    if (!attrMemo.has(k)) attrMemo.set(k, mean(xi.flatMap((x) => (x.p.attributes[k] != null && x.s.pos !== 'GB' ? [x.p.attributes[k]!] : []))));
    return attrMemo.get(k)!;
  };

  return rated.map(({ s, slot, p, rating, n }) => {
    const reasons: DiagReason[] = [];
    // Le poste.
    const fam = p.familiarity?.[s.pos];
    if (!p.positions.includes(s.pos) && fam != null && fam < NATURAL) reasons.push({ kind: 'familiarity', value: fam });
    const side = sideOf(s.pos);
    const fi = footInfo(p);
    if (side && fi.strong && fi.strong !== 'B') {
      const want = INVERTED.has(s.ip) ? (side === 'L' ? 'R' : 'L') : side;
      if (fi.strong !== want) reasons.push({ kind: 'foot', side });
    }
    // Le rôle.
    if (s.fit != null && xiFit != null && s.fit < xiFit - 1.5) reasons.push({ kind: 'roleFit', fit: round(s.fit, 1), xi: round(xiFit, 1) });
    const weak = new Map<string, number>();
    let threshold: number | null = null;
    for (const code of [s.ip, s.oop]) {
      const r = engine.roles.get(code);
      const game = code === s.ip ? r?.game?.ip : r?.game?.oop;
      const rr = game ? ROLE_RATINGS_FM27[game] : null;
      for (const k of rr?.k ?? []) {
        const v = p.attributes[k];
        // Bas dans l'absolu ET nettement sous le reste du onze : en division modeste, tout le monde est à 10.
        const ref = xiAttr(k);
        if (v != null && v <= WEAK_ATTR && (ref == null || v <= ref - 2)) weak.set(k, v);
      }
      const t = game ? roleThreshold(game) : null;
      if (t != null && (p.ca == null || p.ca < t)) threshold = Math.max(threshold ?? 0, t);
    }
    if (weak.size) reasons.push({ kind: 'keyAttrs', attrs: [...weak].map(([key, value]) => ({ key, value })).sort((a, b) => a.value - b.value).slice(0, 4) });
    if (threshold != null) reasons.push({ kind: 'threshold', ca: p.ca, t: threshold });
    // Le match.
    const marks = (opts.weaknesses?.get(p.id) ?? []).filter((m) => m.rank <= 0.15).slice(0, 2);
    if (marks.length) reasons.push({ kind: 'stats', marks });
    // La forme.
    if (p.condition != null && p.condition < 85) reasons.push({ kind: 'condition', value: p.condition });
    if (p.sharpness != null && p.sharpness < 75) reasons.push({ kind: 'sharpness', value: p.sharpness });
    const m = moraleLevel(p.morale);
    if (m != null && m <= 1 && p.morale) reasons.push({ kind: 'morale', text: p.morale });
    // Mieux ailleurs dans l'effectif.
    const fitAt = (q: FmPlayer) => ((engine.roleFit(q, s.ip, 'ip', s.pos) ?? 0) + (engine.roleFit(q, s.oop, 'oop', s.pos) ?? 0)) / 2;
    const alt = squad
      .filter((q) => !used.has(q.id) && !unavailable(q) && engine.canPlay(q, s.pos))
      .map((q) => ({ q, f: fitAt(q) }))
      .sort((a, b) => b.f - a.f)[0];
    if (alt && s.fit != null && alt.f >= s.fit + 1) reasons.push({ kind: 'better', player: alt.q, fit: round(alt.f, 1) });

    const gap = rating != null && xiAvg != null ? round(rating - xiAvg) : null;
    const under = rating != null && ((gap != null && gap <= -RATING_GAP) || rating < BAD_RATING);
    return { player: p, slot, pos: s.pos, ip: s.ip, oop: s.oop, rating, ratedMatches: n, gap, under, reasons };
  });
}

/** Notes des matchs par joueur, d'après les résultats retrouvés (du plus ancien au plus récent). */
export function ratingsByPlayer(results: { players: { id: string; rating: number | null; started: boolean }[] }[]): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const r of results)
    for (const p of r.players) if (p.rating != null && p.started) out.set(p.id, [...(out.get(p.id) ?? []), p.rating]);
  return out;
}

