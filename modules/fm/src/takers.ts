import type { FmPlayer } from './player';

/**
 * Tireurs de coups de pied arrêtés et capitaine (repris de l'ancienne appli FM Notebook) : moyenne pondérée des
 * attributs utiles, sur 20, parmi les joueurs du onze. Un premier choix et un remplaçant, à régler dans FM27
 * (Tactique > Coups de pied arrêtés et capitaines).
 */
export type TakerRole = 'captain' | 'penalties' | 'freeKicks' | 'corners' | 'longThrows';
export const TAKER_ROLES: TakerRole[] = ['captain', 'penalties', 'freeKicks', 'corners', 'longThrows'];

const WEIGHTS: Record<TakerRole, [string, number][]> = {
  captain: [['Leadership', 3], ['Determination', 1.5], ['Bravery', 1], ['Composure', 1], ['WorkRate', 0.5]],
  penalties: [['PenaltyTaking', 3], ['Composure', 1.5], ['Finishing', 1]],
  freeKicks: [['FreeKicks', 3], ['Technique', 1], ['Composure', 0.5]],
  corners: [['Corners', 3], ['Crossing', 1], ['Technique', 1]],
  longThrows: [['LongThrows', 3], ['Strength', 0.5]],
};

/** Note sur 20 d'un joueur pour une tâche, null si aucun attribut utile n'est connu (le gardien ne tire pas de corner). */
export function takerScore(p: FmPlayer, role: TakerRole): number | null {
  let sum = 0;
  let w = 0;
  for (const [k, x] of WEIGHTS[role]) {
    const v = p.attributes[k];
    if (typeof v !== 'number') continue;
    sum += v * x;
    w += x;
  }
  // Le premier attribut est celui de la tâche : sans lui, pas de note.
  return w && typeof p.attributes[WEIGHTS[role][0]![0]] === 'number' ? sum / w : null;
}

export interface TakerPick {
  role: TakerRole;
  first: { player: FmPlayer; score: number } | null;
  second: { player: FmPlayer; score: number } | null;
}

export function setPieceTakers(players: FmPlayer[]): TakerPick[] {
  const field = players.filter((p) => !p.positions.every((x) => x === 'GB'));
  return TAKER_ROLES.map((role) => {
    const pool = role === 'captain' ? players : field;
    const ranked = pool
      .map((player) => ({ player, score: takerScore(player, role) }))
      .filter((x): x is { player: FmPlayer; score: number } => x.score != null)
      .sort((a, b) => b.score - a.score);
    return { role, first: ranked[0] ?? null, second: ranked[1] ?? null };
  });
}
