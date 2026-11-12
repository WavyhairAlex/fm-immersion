import { monthsBetween } from './alerts';
import type { ClubReach, Reach } from './reach';
import { reachOf } from './reach';
import type { DbPlayer } from './targets';

/**
 * Trading : repérer dans la base de FM27 des joueurs à acheter peu cher, faire progresser, puis revendre.
 * Tout est calculé sur les vraies valeurs lues en mémoire (CA, PA, âge, valeur, salaire, contrat), jamais sur l'avis
 * des recruteurs. Les modèles sont ceux de FM Immersion, pas du jeu : un tri pour savoir où regarder, pas une promesse.
 *
 * - Progression : le CA monte chaque saison selon l'âge (plus vite jeune), sans dépasser le PA, et moins vite s'il
 *   ne joue pas (doublure, ou rien chez nous : à prêter pour qu'il joue).
 * - Valeur de revente : régression log(valeur) ~ CA + âge sur les joueurs trouvés (le marché du moment), sinon repli.
 *   Un joueur coté au-dessus ou au-dessous du marché le reste en partie (réputation, championnat).
 * - Prix d'achat : la valeur, corrigée par le contrat (long = plus cher, fin proche = moins cher). Libre ou en
 *   précontrat : 0. Un prêt ne compte pas : on ne revend pas un joueur prêté, on l'achète.
 * - Gain = valeur de revente − prix − salaires payés d'ici la revente.
 */

/** Points de CA gagnés par saison selon l'âge, pour un joueur qui joue régulièrement (repères FM). */
export function caGrowth(age: number): number {
  return age <= 17 ? 14 : age <= 19 ? 11 : age <= 21 ? 8 : age <= 23 ? 5 : age <= 25 ? 2 : 0;
}

/** Temps de jeu chez nous : titulaire, doublure, ou rien (à prêter). */
export type PlayRole = 'starter' | 'backup' | 'none';
/** Part de la progression gardée selon le temps de jeu (un prêt fait jouer, mais moins encadré). */
export const PLAY_GROWTH: Record<PlayRole, number> = { starter: 1, backup: 0.7, none: 0.6 };

/** Points de CA gagnés par saison selon l'âge : repères génériques, ou mesurés dans la partie (`measuredGrowth`). */
export type Growth = (age: number) => number;

/** CA projeté dans `years` saisons, plafonné par le PA ; `rate` : part de la progression (temps de jeu). */
export function projectCa(ca: number, pa: number, age: number, years: number, rate = 1, growth: Growth = caGrowth): number {
  let x = ca;
  for (let y = 0; y < years; y++) x += growth(age + y) * rate;
  return Math.min(Math.max(ca, pa), x);
}

/** PA du jeu : un nombre négatif est une fourchette (−10 = 170-200, −9 = 150-180…). On en prend le milieu. */
export function paValue(pa: number, ca: number): number {
  if (pa > 0) return pa;
  const ranges: Record<number, number> = { [-10]: 185, [-9]: 165, [-95]: 155, [-85]: 145, [-8]: 145, [-75]: 135, [-7]: 125, [-65]: 115, [-6]: 105, [-55]: 95, [-5]: 85, [-45]: 75, [-4]: 65, [-35]: 55, [-3]: 45, [-25]: 35, [-2]: 25, [-15]: 15, [-1]: 5 };
  return Math.max(ca, ranges[pa] ?? ca);
}

export interface ValueModel {
  /** Valeur estimée (monnaie de base) d'un joueur de ce CA et de cet âge. */
  value(ca: number, age: number): number;
  n: number;
}

/**
 * Valeur de marché selon le CA et l'âge, ajustée sur les joueurs trouvés : log(valeur) = a + b·CA + c·âge.
 * Au moins 20 joueurs chiffrés ; sinon repli sur une courbe générique (×1,045 par point de CA, décote après 27 ans).
 */
export function valueModel(players: Pick<DbPlayer, 'ca' | 'age' | 'valueRaw'>[]): ValueModel {
  const pts = players.filter((p) => p.valueRaw != null && p.valueRaw > 0 && p.age != null).map((p) => ({ x1: p.ca, x2: p.age!, y: Math.log(p.valueRaw!) }));
  if (pts.length >= 20) {
    // Moindres carrés à deux variables (équations normales centrées).
    const n = pts.length;
    const m1 = pts.reduce((s, p) => s + p.x1, 0) / n;
    const m2 = pts.reduce((s, p) => s + p.x2, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    let s11 = 0;
    let s22 = 0;
    let s12 = 0;
    let s1y = 0;
    let s2y = 0;
    for (const p of pts) {
      const d1 = p.x1 - m1;
      const d2 = p.x2 - m2;
      const dy = p.y - my;
      s11 += d1 * d1;
      s22 += d2 * d2;
      s12 += d1 * d2;
      s1y += d1 * dy;
      s2y += d2 * dy;
    }
    const det = s11 * s22 - s12 * s12;
    if (det > 1e-9) {
      const b = (s1y * s22 - s2y * s12) / det;
      const c = (s2y * s11 - s1y * s12) / det;
      // Un marché où la valeur baisse avec le CA n'a pas de sens : on garde le repli.
      if (b > 0) {
        const a = my - b * m1 - c * m2;
        return { value: (ca, age) => Math.exp(a + b * ca + c * age), n };
      }
    }
  }
  return { value: (ca, age) => 50_000 * 1.045 ** (ca - 80) * (age > 27 ? 0.85 ** (age - 27) : 1), n: 0 };
}

/** Facteur du prix d'achat selon le contrat restant (FM : un long contrat renchérit, une fin proche brade). */
export function contractFactor(months: number | null): number {
  if (months == null) return 1;
  return months >= 36 ? 1.5 : months >= 24 ? 1.3 : months >= 12 ? 1.1 : months >= 6 ? 0.8 : 0.5;
}

export interface TradeIdea {
  player: DbPlayer;
  pa: number;
  /** Saisons avant la revente conseillée (1 à 3) et CA à ce moment-là. */
  years: number;
  caAtSale: number;
  ageAtSale: number;
  /** Prix d'achat estimé (0 : libre, précontrat ou prêt) et masse salariale payée d'ici la revente. */
  buy: number;
  wages: number;
  /** Valeur de revente estimée, gain et rendement (gain / argent engagé). */
  sale: number;
  profit: number;
  roi: number | null;
  /** Prix d'achat comparé à la valeur d'un joueur de même CA et âge : < 1 = sous-coté. */
  priceRatio: number | null;
  reach: Reach;
  /** Mois de contrat restants (null : inconnu ou libre). */
  months: number | null;
  /** Temps de jeu chez nous (null : inconnu, compté comme titulaire). */
  role: PlayRole | null;
  /** Pourquoi il est intéressant : pépite (jeune, grosse marge), sous-coté, fin de contrat, libre. */
  kinds: TradeKind[];
}

export type TradeKind = 'nugget' | 'undervalued' | 'expiring' | 'free' | 'profile';
export const NUGGET_MAX_AGE = 21;
export const NUGGET_MARGIN = 15;
export const UNDERVALUED_RATIO = 0.8;
export const EXPIRING_MONTHS = 12;

export interface TradeOpts {
  /** Saisons envisagées avant de revendre (la meilleure est retenue). */
  maxYears?: number;
  /** Temps de jeu de chaque joueur chez nous, par id de la base. */
  play?: Map<string, PlayRole>;
  /** Progression par âge (repères génériques par défaut). */
  growth?: Growth;
  /** Avance de note sur 20 dans le projet par rapport à son CA (`profileEdge`), par id de la base. */
  edge?: Map<string, number>;
}

/** Avance de note (sur 20) au-delà de laquelle un profil est sous-estimé par son CA. */
export const PROFILE_EDGE = 1;

/**
 * Idées d'achat-revente parmi des joueurs de la base, de la plus rentable à la moins rentable. On ne garde que les
 * joueurs qui ont encore de la marge (PA au-dessus du CA) et dont la revente rapporte plus que ce qu'ils coûtent.
 */
export function tradeIdeas(players: DbPlayer[], club: ClubReach, gameDate: string, opts: TradeOpts = {}): TradeIdea[] {
  const model = valueModel(players);
  const maxYears = opts.maxYears ?? 3;
  const out: TradeIdea[] = [];
  for (const p of players) {
    if (p.age == null) continue;
    const pa = paValue(p.pa, p.ca);
    if (pa <= p.ca + 2) continue;
    const reach = reachOf(p, club, gameDate);
    if (reach.level === 'out') continue;
    const months = p.contractEnd ? monthsBetween(gameDate, p.contractEnd) : null;
    const known = p.valueRaw != null && p.valueRaw > 0;
    const fair = model.value(p.ca, p.age);
    const base = known ? p.valueRaw! : fair;
    const costless = reach.why.includes('free') || reach.why.includes('preContract');
    const buy = costless ? 0 : base * contractFactor(months);
    // Cote propre au joueur (réputation, championnat) : elle suit à moitié à la revente.
    const premium = known ? Math.sqrt(Math.min(2, Math.max(0.5, p.valueRaw! / fair))) : 1;
    const role = opts.play?.get(String(p.id)) ?? null;
    const rate = PLAY_GROWTH[role ?? 'starter'];
    const weekly = p.wageWeekly != null && p.wageWeekly > 0 ? p.wageWeekly : 0;
    const priceRatio = buy > 0 ? buy / fair : null;
    const kinds: TradeKind[] = [];
    if (p.age <= NUGGET_MAX_AGE && pa - p.ca >= NUGGET_MARGIN) kinds.push('nugget');
    if (priceRatio != null && priceRatio < UNDERVALUED_RATIO) kinds.push('undervalued');
    if (months != null && months <= EXPIRING_MONTHS && buy > 0) kinds.push('expiring');
    if (buy === 0) kinds.push('free');
    const edge = opts.edge?.get(String(p.id));
    if (edge != null && edge >= PROFILE_EDGE) kinds.push('profile');
    let best: TradeIdea | null = null;
    for (let y = 1; y <= maxYears; y++) {
      const caAtSale = projectCa(p.ca, pa, p.age, y, rate, opts.growth);
      const ageAtSale = p.age + y;
      // Revente sous contrat long (signé à l'achat) : les jeunes se vendent au-dessus de leur valeur.
      const sale = model.value(caAtSale, ageAtSale) * premium * (ageAtSale <= 23 ? 1.25 : 1);
      const wages = weekly * 52 * y;
      const profit = sale - buy - wages;
      const spent = buy + wages;
      const idea: TradeIdea = {
        player: p,
        pa,
        years: y,
        caAtSale,
        ageAtSale,
        buy,
        wages,
        sale,
        profit,
        roi: spent > 0 ? profit / spent : null,
        priceRatio,
        reach,
        months,
        role,
        kinds,
      };
      // Rendement par saison : une revente rapide vaut mieux qu'une plus grosse trois ans plus tard.
      if (!best || profit / y > best.profit / best.years) best = idea;
    }
    // Un profil sous-estimé reste dans la liste même sans gain à la revente : il vaut plus chez nous que sur le marché.
    if (best && (best.profit > 0 || kinds.includes('profile'))) out.push(best);
  }
  return out.sort((a, b) => b.profit / b.years - a.profit / a.years);
}
