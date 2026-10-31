import { z } from 'zod';

/**
 * Jeux pris en charge. L'identifiant sert de clé partout (base, routes, i18n).
 * Afficher toujours « pour <nom du jeu> » : Simloom n'est affilié à aucun éditeur.
 */
export const GAME_IDS = ['tf3', 'pz2', 'fm'] as const;
export const gameIdSchema = z.enum(GAME_IDS);
export type GameId = z.infer<typeof gameIdSchema>;

export type GameStatus = 'available' | 'soon';

export interface GameInfo {
  id: GameId;
  /** Nom officiel du jeu, à précéder de « pour » dans l'interface. */
  name: string;
  status: GameStatus;
  /** Couleur d'accent du module (palette Simloom). */
  accent: string;
}

export const GAMES: Record<GameId, GameInfo> = {
  tf3: { id: 'tf3', name: 'Transport Fever 3', status: 'available', accent: '#FF6B6B' },
  pz2: { id: 'pz2', name: 'Planet Zoo 2', status: 'available', accent: '#63D1B1' },
  fm: { id: 'fm', name: 'Football Manager', status: 'available', accent: '#0F4B58' },
};
