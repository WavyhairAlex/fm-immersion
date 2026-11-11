import type { FmPlayer } from './player';

/*
 * « Indice moteur » : ce que les attributs d'un joueur pèsent vraiment dans le moteur de match de FM27.
 *
 * Source : tests d'Harvestgreen sur FM27, mis en tableau par squirrel_plays et résumés par ZaZ sur FM-Arena
 * (« Player Attributes », https://fm-arena.com/threads/player-attributes.59/, 10/11/2026). Méthode : tous les
 * joueurs de champ d'une équipe passent de 12 partout à une autre valeur dans un seul attribut, et l'on mesure le
 * taux de victoire. Trois paliers testés (1, 6, 12, 18), interpolés en ligne droite entre eux.
 *
 * Limites, à dire au joueur : un seul jeu de tests et une seule tactique ; d'autres testeurs trouvent les passes
 * plus utiles, ou l'endurance encore plus lourde avec un pressing intense. Une tendance, pas une vérité. Les
 * gardiens ne sont pas couverts (réflexes et agilité y font l'essentiel). Les attributs cachés testés (pression,
 * régularité, grands matchs) ne sont pas lus : ils comptent pour 0, comme un 12.
 *
 * Ce n'est pas la note du jeu : les étoiles et la note au poste restent celles de FM27 (role-ratings-fm27.ts).
 */

/** Gain de taux de victoire (en points de %) de 1 à 6, de 6 à 12 et de 12 à 18, par attribut. */
export const ENGINE_GAINS: Record<string, readonly [number, number, number]> = {
  Pace: [13.2, 26.8, 19.4],
  Acceleration: [12.6, 21.4, 14.1],
  Stamina: [11.8, 17.6, 14.0],
  JumpingReach: [5.8, 12.2, 15.4],
  Anticipation: [11.0, 8.8, 4.8],
  Strength: [10.0, 8.8, 4.6],
  Concentration: [7.8, 5.6, 4.4],
  Dribbling: [3.0, 3.8, 3.6],
  NaturalFitness: [8.6, 4.0, 2.8],
  Determination: [6.0, 0.0, 2.8],
  Positioning: [-3.0, -0.4, 2.6],
  Finishing: [3.0, 4.8, 2.2],
  Flair: [-1.0, 1.6, 1.8],
  Bravery: [0.0, 2.4, 1.4],
  Aggression: [1.2, -1.4, 1.2],
  Decisions: [-0.8, 2.4, 1.0],
  Crossing: [0.6, 4.0, 0.6],
  Agility: [5.2, 3.2, 0.2],
  WorkRate: [15.8, 6.2, 0.0],
  Balance: [6.0, 8.2, 0.0],
  LongShots: [5.2, 4.6, 0.0],
  Heading: [5.2, 1.6, 0.0],
  Passing: [-1.0, -1.0, -0.8],
  Composure: [3.0, 2.0, -2.0],
  Marking: [3.6, 0.6, -2.2],
  FirstTouch: [0.8, -1.6, -3.6],
  Tackling: [2.6, -1.6, -5.0],
  Vision: [0.0, 8.2, -5.2],
  Technique: [-0.8, 1.2, -5.4],
  Movement: [-4.0, 2.4, -6.0],
};

/** Attributs à ne pas laisser sous 6 : ils coûtent cher en dessous et rapportent peu au-dessus de 12. */
export const ENGINE_MINIMUMS = ['WorkRate', 'Anticipation', 'Strength', 'Balance', 'Concentration', 'NaturalFitness'] as const;
export const ENGINE_MIN_VALUE = 6;

/**
 * Effet d'un attribut à cette valeur, comparé à 12 (en points de taux de victoire, pour un onze entier à cette
 * valeur). Au-delà de 18, la pente du dernier palier continue.
 */
export function attributeEffect(attr: string, value: number): number | null {
  const g = ENGINE_GAINS[attr];
  if (!g || !Number.isFinite(value)) return null;
  const [a, b, c] = g;
  const v = Math.max(1, Math.min(20, value));
  if (v >= 12) return (c * (v - 12)) / 6;
  if (v >= 6) return (-b * (12 - v)) / 6;
  return -b - (a * (6 - v)) / 5;
}

export interface EngineFactor {
  attr: string;
  value: number;
  /** Effet comparé à 12, en points de taux de victoire. */
  effect: number;
}

export interface EngineValue {
  /** Somme des effets : un onze entier de ce profil gagnerait environ autant de points de % qu'un onze à 12 partout. */
  index: number;
  /** Atouts les plus nets (effet ≥ 4), du plus fort au moins fort. */
  strengths: EngineFactor[];
  /** Points faibles les plus coûteux (effet ≤ −4), du plus coûteux au moins coûteux. */
  weaknesses: EngineFactor[];
  /** Attributs minimums sous 6. */
  belowMin: EngineFactor[];
  /** Nombre d'attributs testés lus pour ce joueur. */
  read: number;
}

/** Attributs testés en dessous desquels l'indice ne veut rien dire (attributs non lus). */
const MIN_READ = 20;
const NOTABLE = 4;

/** Indice moteur d'un joueur de champ ; null pour un gardien ou si ses attributs ne sont pas lus. */
export function engineValue(p: Pick<FmPlayer, 'attributes' | 'positions'>): EngineValue | null {
  if (p.positions.length > 0 && p.positions.every((pos) => pos === 'GB')) return null;
  const factors: EngineFactor[] = [];
  for (const attr of Object.keys(ENGINE_GAINS)) {
    const value = p.attributes[attr];
    if (value == null) continue;
    const effect = attributeEffect(attr, value);
    if (effect != null) factors.push({ attr, value, effect });
  }
  if (factors.length < MIN_READ) return null;
  const index = factors.reduce((s, f) => s + f.effect, 0);
  const round = (f: EngineFactor) => ({ ...f, effect: Math.round(f.effect * 10) / 10 });
  return {
    index: Math.round(index),
    strengths: factors.filter((f) => f.effect >= NOTABLE).sort((a, b) => b.effect - a.effect).slice(0, 3).map(round),
    weaknesses: factors.filter((f) => f.effect <= -NOTABLE).sort((a, b) => a.effect - b.effect).slice(0, 3).map(round),
    belowMin: factors.filter((f) => (ENGINE_MINIMUMS as readonly string[]).includes(f.attr) && f.value < ENGINE_MIN_VALUE).map(round),
    read: factors.length,
  };
}

export type EngineTier = 'top' | 'good' | 'average' | 'poor';

/** Repères pour la pastille : un joueur à 12 partout vaut 0. */
export function engineTier(index: number): EngineTier {
  return index >= 25 ? 'top' : index >= 8 ? 'good' : index > -10 ? 'average' : 'poor';
}
