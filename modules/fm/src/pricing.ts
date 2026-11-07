import type { FmPlayer } from './player';

/*
 * Prix conseillé d'une vente : la valeur estimée par le jeu, corrigée par ce qui pèse dans une négociation de FM27.
 * Un long contrat met le vendeur en position de force ; un contrat qui finit pousse à brader (le joueur peut partir
 * libre). Les jeunes et les gros potentiels se vendent au-dessus de leur valeur, les trentenaires en dessous.
 * Coefficients de FM Immersion, pas du jeu : un point de départ pour la liste des transferts, avec un plancher sous
 * lequel refuser. Les offres réelles du jeu restent la référence.
 */

export type PriceFactor = 'longContract' | 'midContract' | 'shortContract' | 'expiring' | 'young' | 'prospect' | 'thirty' | 'veteran';

const CONTRACT: { factor: PriceFactor; min: number; k: number }[] = [
  { factor: 'longContract', min: 24, k: 1.5 },
  { factor: 'midContract', min: 12, k: 1.2 },
  { factor: 'shortContract', min: 6, k: 0.9 },
  { factor: 'expiring', min: -Infinity, k: 0.6 },
];

/** Part du prix demandé sous laquelle refuser une offre. */
export const PRICE_FLOOR = 0.7;

export interface AskingPrice {
  value: number;
  ask: number;
  floor: number;
  factors: PriceFactor[];
}

/** Arrondi à deux chiffres significatifs (« 437 500 » → 440 000). */
export const roundPrice = (x: number) => {
  if (x <= 0) return 0;
  const p = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
};

/** Prix demandé et plancher pour vendre `p` ; null sans valeur connue. `months` : mois de contrat restants. */
export function askingPrice(p: FmPlayer, months: number | null): AskingPrice | null {
  if (p.value == null || p.value <= 0) return null;
  const factors: PriceFactor[] = [];
  let k = 1;
  if (months != null) {
    const c = CONTRACT.find((x) => months >= x.min)!;
    factors.push(c.factor);
    k *= c.k;
  }
  const age = p.age;
  if (age != null && age <= 23) {
    factors.push('young');
    k *= 1.25;
    if ((p.stars?.potential ?? 0) >= 4 || (p.pa != null && p.ca != null && p.pa - p.ca >= 20)) {
      factors.push('prospect');
      k *= 1.2;
    }
  } else if (age != null && age >= 32) {
    factors.push('veteran');
    k *= 0.7;
  } else if (age != null && age >= 30) {
    factors.push('thirty');
    k *= 0.85;
  }
  const ask = roundPrice(p.value * k);
  return { value: p.value, ask, floor: roundPrice(ask * PRICE_FLOOR), factors };
}
