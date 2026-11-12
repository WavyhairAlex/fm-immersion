import { monthsBetween } from './alerts';
import type { FmPlayer } from './player';
import type { SquadAt } from './progress';
import type { DbPlayer, TargetRecord } from './targets';
import { caGrowth, paValue, projectCa, valueModel, type Growth, type ValueModel } from './trading';

/**
 * Outils de repérage autour de `trading.ts` :
 * - progression mesurée dans la partie (CA lu en mémoire à chaque date de jeu) plutôt que des repères génériques ;
 * - moment de vendre ses propres joueurs (valeur qui culmine) ;
 * - suivi des joueurs repérés (prix, contrat, progression relus dans la base) ;
 * - profils que le CA sous-estime (note dans le projet au-dessus de ce que leur CA laisse attendre) ;
 * - carte des marchés : où le point de CA est le moins cher.
 * Coefficients de FM Immersion, pas du jeu.
 */

/* ---------- Progression mesurée ---------- */

/** Tranches d'âge mesurées (âge au début de la période). */
export const GROWTH_BUCKETS: [number, number][] = [
  [15, 17],
  [18, 19],
  [20, 21],
  [22, 23],
  [24, 25],
];
/** Période minimale entre deux lectures du CA pour mesurer une progression. */
export const GROWTH_MIN_DAYS = 120;
/** Poids des repères génériques, en nombre de joueurs : avec peu de mesures, on reste près des repères. */
export const GROWTH_PRIOR = 3;

export interface GrowthBucket {
  ages: [number, number];
  /** Joueurs mesurés, progression moyenne par saison (null : aucun), repère générique, valeur retenue. */
  n: number;
  measured: number | null;
  base: number;
  used: number;
}
export interface GrowthCurve {
  growth: Growth;
  buckets: GrowthBucket[];
  /** Joueurs mesurés en tout. */
  samples: number;
}

const DAY = 86_400_000;

/**
 * Progression du CA par saison selon l'âge, mesurée sur l'effectif d'une lecture à l'autre (au moins 4 mois d'écart).
 * Les joueurs déjà au plafond (PA atteint) ne disent rien de la vitesse : écartés. Le résultat mêle mesures et repères
 * génériques (moyenne pondérée) : quelques joueurs ne suffisent pas à changer la courbe.
 */
export function measuredGrowth(history: SquadAt[]): GrowthCurve {
  const seen = new Map<string, { first: { d: string; ca: number; pa: number | null; age: number }; last: { d: string; ca: number } }>();
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  for (const h of sorted) {
    for (const p of h.players) {
      if (p.ca == null || p.age == null) continue;
      const s = seen.get(p.id);
      if (!s) seen.set(p.id, { first: { d: h.gameDate, ca: p.ca, pa: p.pa, age: p.age }, last: { d: h.gameDate, ca: p.ca } });
      else s.last = { d: h.gameDate, ca: p.ca };
    }
  }
  const rates = GROWTH_BUCKETS.map(() => [] as number[]);
  for (const { first, last } of seen.values()) {
    const days = (Date.parse(last.d) - Date.parse(first.d)) / DAY;
    if (!(days >= GROWTH_MIN_DAYS)) continue;
    if (first.pa != null && first.pa - first.ca <= 3) continue;
    const i = GROWTH_BUCKETS.findIndex(([lo, hi]) => first.age >= lo && first.age <= hi);
    if (i < 0) continue;
    const rate = ((last.ca - first.ca) * 365) / days;
    rates[i]!.push(Math.max(-10, Math.min(30, rate)));
  }
  const buckets: GrowthBucket[] = GROWTH_BUCKETS.map((ages, i) => {
    const xs = rates[i]!;
    const base = caGrowth(ages[1]);
    const measured = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
    const used = measured == null ? base : Math.max(0, (xs.length * measured + GROWTH_PRIOR * base) / (xs.length + GROWTH_PRIOR));
    return { ages, n: xs.length, measured, base, used };
  });
  const samples = buckets.reduce((a, b) => a + b.n, 0);
  const growth: Growth = (age) => {
    const b = buckets.find((x) => age >= x.ages[0] && age <= x.ages[1]);
    return b ? b.used : age < GROWTH_BUCKETS[0]![0] ? buckets[0]!.used : caGrowth(age);
  };
  return { growth, buckets, samples };
}

/* ---------- Quand vendre ses joueurs ---------- */

export type SellCall = 'sellNow' | 'hold' | 'stable';
export interface SellTiming {
  player: FmPlayer;
  /** Valeur actuelle (affichée par le jeu) et valeur estimée chaque saison (0 = maintenant). */
  value: number;
  path: number[];
  /** Saison où la valeur culmine (0 = maintenant) et cette valeur. */
  peakYear: number;
  peak: number;
  call: SellCall;
}
/** Baisse attendue dans l'année au-delà de laquelle il faut vendre maintenant (10 %). */
export const SELL_DROP = 0.9;
/** Hausse attendue au pic au-delà de laquelle il faut le garder pour le vendre plus tard (15 %). */
export const HOLD_RISE = 1.15;

/**
 * Valeur de chaque joueur de l'effectif dans 1 à 3 saisons (CA projeté, âge), sur un marché ajusté sur l'effectif
 * lui-même (valeurs affichées par le jeu). Sa cote propre suit à moitié, comme pour les recrues.
 */
export function sellTiming(players: FmPlayer[], growth: Growth = caGrowth, years = 3, model?: ValueModel): SellTiming[] {
  const known = players.filter((p) => p.ca != null && p.age != null && p.value != null && p.value > 0);
  const m = model ?? valueModel(known.map((p) => ({ ca: p.ca!, age: p.age!, valueRaw: p.value! })));
  return known
    .map((p) => {
      const ca = p.ca!;
      const age = p.age!;
      const pa = paValue(p.pa ?? ca, ca);
      const premium = Math.sqrt(Math.min(2, Math.max(0.5, p.value! / m.value(ca, age))));
      // Toute la courbe sur le même modèle (aujourd'hui compris) : l'écart entre deux saisons ne vient que du CA et de l'âge.
      const path = [m.value(ca, age) * premium];
      for (let y = 1; y <= years; y++) path.push(m.value(projectCa(ca, pa, age, y, 1, growth), age + y) * premium);
      let peakYear = 0;
      path.forEach((v, i) => {
        if (v > path[peakYear]!) peakYear = i;
      });
      const peak = path[peakYear]!;
      const now = path[0]!;
      const call: SellCall = peakYear === 0 && path[1]! < now * SELL_DROP ? 'sellNow' : peak >= now * HOLD_RISE ? 'hold' : 'stable';
      // Valeur affichée par le jeu aujourd'hui, et le pic rapporté à elle.
      return { player: p, value: p.value!, path: path.map((v) => (v * p.value!) / now), peakYear, peak: (peak * p.value!) / now, call };
    })
    .sort((a, b) => b.value - a.value);
}

/* ---------- Suivi des joueurs repérés ---------- */

/** Une relecture d'un joueur suivi dans la base du jeu. */
export interface TrackPoint {
  d: string;
  ca: number;
  value: number | null;
  contractEnd: string | null;
  listed: boolean;
  club: string | null;
}

export function trackOf(r: TargetRecord): TrackPoint[] {
  const t = (r.data as { track?: unknown } | null)?.track;
  return Array.isArray(t) ? (t as TrackPoint[]) : [];
}

export function trackPoint(p: DbPlayer, d: string): TrackPoint {
  return { d, ca: p.ca, value: p.valueRaw, contractEnd: p.contractEnd, listed: !!p.transferListed, club: p.club ?? p.loanClub };
}

/** Ajoute (ou remplace, même date) une relecture au suivi, gardé trié et limité aux 24 dernières. */
export function withTrack(track: TrackPoint[], pt: TrackPoint): TrackPoint[] {
  return [...track.filter((x) => x.d !== pt.d), pt].sort((a, b) => a.d.localeCompare(b.d)).slice(-24);
}

export type WatchSignal = 'priceDrop' | 'preContract' | 'contractEnding' | 'listed' | 'free' | 'ahead' | 'stalled' | 'moved';
export interface WatchAlert {
  record: TargetRecord;
  last: TrackPoint;
  first: TrackPoint;
  signals: WatchSignal[];
  /** Variation de valeur (en part) et de CA depuis la première lecture. */
  valueChange: number | null;
  caChange: number;
  months: number | null;
}
/** Baisse de prix signalée : 20 % sous le plus haut relu. */
export const PRICE_DROP = 0.8;

/**
 * Signaux sur les joueurs suivis à partir de leurs relectures : prix en baisse, fin de contrat (précontrat possible à
 * 6 mois), mis sur la liste des transferts, libéré, progression plus rapide ou à l'arrêt, changement de club.
 */
export function watchAlerts(records: TargetRecord[], gameDate: string, growth: Growth = caGrowth): WatchAlert[] {
  const out: WatchAlert[] = [];
  for (const r of records) {
    if (r.dismissed) continue;
    const tr = trackOf(r);
    const last = tr[tr.length - 1];
    if (!last) continue;
    const first = tr[0]!;
    const prev = tr[tr.length - 2];
    const signals: WatchSignal[] = [];
    const peak = Math.max(0, ...tr.map((x) => x.value ?? 0));
    if (last.value != null && peak > 0 && last.value <= peak * PRICE_DROP) signals.push('priceDrop');
    const months = last.contractEnd ? monthsBetween(gameDate, last.contractEnd) : null;
    if (!last.club) signals.push('free');
    else if (months != null && months <= 6) signals.push('preContract');
    else if (months != null && months <= 12) signals.push('contractEnding');
    if (last.listed && !prev?.listed) signals.push('listed');
    if (prev && prev.club !== last.club && last.club) signals.push('moved');
    const days = (Date.parse(last.d) - Date.parse(first.d)) / DAY;
    const age = (r.data as { age?: number | null } | null)?.age ?? null;
    if (days >= GROWTH_MIN_DAYS && age != null) {
      const expected = (growth(age) * days) / 365;
      const gained = last.ca - first.ca;
      if (gained >= 3 && gained >= expected * 1.5) signals.push('ahead');
      else if (expected >= 3 && gained <= 0) signals.push('stalled');
    }
    out.push({
      record: r,
      last,
      first,
      signals,
      valueChange: last.value != null && first.value ? last.value / first.value - 1 : null,
      caChange: last.ca - first.ca,
      months,
    });
  }
  return out.sort((a, b) => b.signals.length - a.signals.length || a.record.name.localeCompare(b.record.name));
}

/* ---------- Profils sous-estimés ---------- */

/**
 * Avance de note de chaque joueur sur ce que son CA laisse attendre : droite note ~ CA ajustée sur les joueurs lus
 * (note sur 20 à son meilleur poste du projet), puis écart à cette droite. Le CA mesure tout le joueur ; la note ne
 * compte que ce qui sert à nos rôles. Au moins 10 joueurs notés, sinon rien.
 */
export function profileEdge(rows: { id: string; ca: number; fit: number | null | undefined }[]): Map<string, number> {
  const pts = rows.filter((r): r is { id: string; ca: number; fit: number } => r.fit != null);
  const out = new Map<string, number>();
  if (pts.length < 10) return out;
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.ca, 0) / n;
  const my = pts.reduce((s, p) => s + p.fit, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.ca - mx) ** 2;
    sxy += (p.ca - mx) * (p.fit - my);
  }
  const b = sxx > 1e-9 ? sxy / sxx : 0;
  for (const p of pts) out.set(p.id, p.fit - (my + b * (p.ca - mx)));
  return out;
}

/* ---------- Carte des marchés ---------- */

export interface MarketRow {
  division: string;
  n: number;
  /** Prix médian comparé au marché (1 = au prix d'un joueur de même CA et âge ; 0,7 = 30 % moins cher). */
  priceIndex: number;
  medianCa: number;
  medianAge: number;
}
export const MARKET_MIN = 4;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Championnats où un point de CA coûte le moins cher, d'après les joueurs lus (4 au moins par championnat). */
export function marketMap(players: DbPlayer[], model: ValueModel = valueModel(players)): MarketRow[] {
  const by = new Map<string, DbPlayer[]>();
  for (const p of players) {
    if (!p.division || p.age == null || p.valueRaw == null || p.valueRaw <= 0) continue;
    by.set(p.division, [...(by.get(p.division) ?? []), p]);
  }
  return [...by.entries()]
    .filter(([, xs]) => xs.length >= MARKET_MIN)
    .map(([division, xs]) => ({
      division,
      n: xs.length,
      priceIndex: median(xs.map((p) => p.valueRaw! / model.value(p.ca, p.age!))),
      medianCa: median(xs.map((p) => p.ca)),
      medianAge: median(xs.map((p) => p.age!)),
    }))
    .sort((a, b) => a.priceIndex - b.priceIndex);
}
