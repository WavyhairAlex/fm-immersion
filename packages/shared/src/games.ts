import { z } from 'zod';

/**
 * Jeux pris en charge. L'identifiant sert de clé partout (base, routes, i18n).
 * Afficher toujours « pour <nom du jeu> » : FM Immersion n'est affilié à aucun éditeur.
 */
export const GAME_IDS = ['fm'] as const;
export const gameIdSchema = z.enum(GAME_IDS);
export type GameId = z.infer<typeof gameIdSchema>;

export type GameStatus = 'available' | 'soon';

export interface GameInfo {
  id: GameId;
  /** Nom officiel du jeu, à précéder de « pour » dans l'interface. */
  name: string;
  status: GameStatus;
  /** Couleur d'accent du module (palette FM Immersion). */
  accent: string;
}

export const GAMES: Record<GameId, GameInfo> = {
  fm: { id: 'fm', name: 'Football Manager', status: 'available', accent: '#0F4B58' },
};
