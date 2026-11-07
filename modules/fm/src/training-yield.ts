import type { FmPlayer } from './player';
import { ATTR_GROUPS, growthAt, type SquadAt } from './progress';

/**
 * Rendement mesuré de l'entraînement : ce que les attributs ont réellement fait entre deux instantanés de notre
 * effectif. Les tables de rendement (`SESSION_YIELD`) viennent d'un banc d'essai extérieur ; ici on vérifie sur la
 * partie du joueur. Un attribut gagné = 1 point (sur 20) ; les sommes portent sur les attributs connus aux deux dates.
 */

/** Durée minimale entre les deux instantanés comparés pour que la mesure veuille dire quelque chose. */
export const YIELD_MIN_DAYS = 14;
/** Fenêtre de mesure visée (un cycle de quatre semaines). */
export const YIELD_WINDOW_DAYS = 28;
/** Attributs d'un joueur de champ comptés dans la courbe d'âge (`growthAt` est en points de niveau, moyenne de ces attributs). */
const FIELD_ATTRS = ATTR_GROUPS.filter(([g]) => g !== 'goalkeeping').flatMap(([, keys]) => keys).length;

export type YieldVerdict = 'good' | 'flat' | 'bad';
export type AttrGroup = 'technical' | 'mental' | 'physical' | 'goalkeeping';

export interface PlayerGain {
  player: FmPlayer;
  /** Somme des points d'attributs gagnés (négatif = perdus) sur la période. */
  delta: number;
  /** Attribut qui a le plus bougé chez ce joueur, et de combien. */
  top: { key: string; delta: number } | null;
}

export interface TrainingYield {
  from: string;
  to: string;
  days: number;
  /** Joueurs présents aux deux dates avec des attributs connus. */
  players: number;
  /** Points d'attributs gagnés par joueur sur la période, en moyenne. */
  perPlayer: number;
  /** La même chose ramenée à 28 jours, pour comparer d'une mesure à l'autre. */
  perMonth: number;
  /** Ce que la courbe d'âge laissait attendre sur 28 jours, par joueur. */
  expectedPerMonth: number;
  /** Points gagnés par famille d'attributs, par joueur (gardiens exclus des trois premières). */
  groups: Record<AttrGroup, number>;
  /** Attributs qui ont le plus progressé dans l'effectif (somme sur les joueurs), du plus au moins. */
  attrs: { key: string; delta: number }[];
  up: PlayerGain[];
  down: PlayerGain[];
  /** Moyenne par joueur pour les 23 ans et moins, et pour les 28 ans et plus (null sans joueur). */
  young: number | null;
  senior: number | null;
  verdict: YieldVerdict;
}

const DAY = 864e5;
const daysBetween = (a: string, b: string) => Math.round((new Date(b.slice(0, 10)).getTime() - new Date(a.slice(0, 10)).getTime()) / DAY);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Instantané de référence : le plus ancien dans la fenêtre, à au moins `YIELD_MIN_DAYS` du dernier ; sinon le plus ancien. */
export function yieldBaseline(history: SquadAt[], window = YIELD_WINDOW_DAYS): SquadAt | null {
  const last = history.at(-1);
  if (!last || history.length < 2) return null;
  const inWindow = history.filter((h) => {
    const d = daysBetween(h.gameDate, last.gameDate);
    return d >= YIELD_MIN_DAYS && d <= window;
  });
  return inWindow[0] ?? history.find((h) => daysBetween(h.gameDate, last.gameDate) >= YIELD_MIN_DAYS) ?? history[0]!;
}

/** Seuils du verdict, en points d'attributs par joueur et par 28 jours. */
export const YIELD_GOOD = 1.5;
export const YIELD_BAD = -0.5;

/**
 * Mesure entre le dernier instantané et sa référence. Null quand il n'y a pas deux instantanés assez espacés
 * (`YIELD_MIN_DAYS`) ou aucun joueur comparable.
 */
export function trainingYield(history: SquadAt[], window = YIELD_WINDOW_DAYS): TrainingYield | null {
  const last = history.at(-1);
  const base = yieldBaseline(history, window);
  if (!last || !base) return null;
  const days = daysBetween(base.gameDate, last.gameDate);
  if (days < YIELD_MIN_DAYS) return null;
  const before = new Map(base.players.map((p) => [p.id, p]));
  const attrTotals = new Map<string, number>();
  const groups: Record<AttrGroup, number> = { technical: 0, mental: 0, physical: 0, goalkeeping: 0 };
  const groupOf = new Map<string, AttrGroup>();
  for (const [g, keys] of ATTR_GROUPS) for (const k of keys) groupOf.set(k, g as AttrGroup);
  const gains: PlayerGain[] = [];
  let expected = 0;
  for (const p of last.players) {
    const was = before.get(p.id);
    if (!was) continue;
    const keys = Object.keys(p.attributes).filter((k) => k in was.attributes);
    if (!keys.length) continue;
    let delta = 0;
    let top: PlayerGain['top'] = null;
    for (const k of keys) {
      const d = p.attributes[k]! - was.attributes[k]!;
      if (!d) continue;
      delta += d;
      attrTotals.set(k, (attrTotals.get(k) ?? 0) + d);
      const g = groupOf.get(k);
      if (g) groups[g] += d;
      if (!top || Math.abs(d) > Math.abs(top.delta)) top = { key: k, delta: d };
    }
    gains.push({ player: p, delta, top });
    // Courbe d'âge : points de niveau par an → points d'attributs sur la période.
    expected += (growthAt(p.age ?? 25) * FIELD_ATTRS * days) / 365;
  }
  if (!gains.length) return null;
  const n = gains.length;
  const total = gains.reduce((a, g) => a + g.delta, 0);
  const perPlayer = total / n;
  const perMonth = (perPlayer * YIELD_WINDOW_DAYS) / days;
  const mean = (list: PlayerGain[]) => (list.length ? r1(list.reduce((a, g) => a + g.delta, 0) / list.length) : null);
  const sorted = [...gains].sort((a, b) => b.delta - a.delta);
  for (const g of Object.keys(groups) as AttrGroup[]) groups[g] = r1(groups[g] / n);
  return {
    from: base.gameDate,
    to: last.gameDate,
    days,
    players: n,
    perPlayer: r1(perPlayer),
    perMonth: r1(perMonth),
    expectedPerMonth: r1(((expected / n) * YIELD_WINDOW_DAYS) / days),
    groups,
    attrs: [...attrTotals].map(([key, delta]) => ({ key, delta })).sort((a, b) => b.delta - a.delta),
    up: sorted.filter((g) => g.delta > 0),
    down: sorted.filter((g) => g.delta < 0).reverse(),
    young: mean(gains.filter((g) => g.player.age != null && g.player.age <= 23)),
    senior: mean(gains.filter((g) => g.player.age != null && g.player.age >= 28)),
    verdict: perMonth >= YIELD_GOOD ? 'good' : perMonth <= YIELD_BAD ? 'bad' : 'flat',
  };
}

/** Jours d'instantanés qu'il manque encore pour mesurer (0 quand la mesure est possible). */
export function yieldDaysMissing(history: SquadAt[]): number {
  const first = history[0];
  const last = history.at(-1);
  if (!first || !last) return YIELD_MIN_DAYS;
  return Math.max(0, YIELD_MIN_DAYS - daysBetween(first.gameDate, last.gameDate));
}
