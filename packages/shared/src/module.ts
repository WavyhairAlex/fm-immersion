import type { GameId } from './games';

/**
 * Contrat d'un module de jeu. Le socle ne connaît rien du contenu d'un module :
 * il lui demande seulement sa carte de résumé pour le tableau de bord.
 *
 * Règle d'or : une carte affiche ce qui demande une ACTION, pas des totaux.
 */
export type AlertLevel = 'urgent' | 'warning' | 'ok';

export interface DashboardAlert {
  level: AlertLevel;
  /** Ex. « 2 lions à relâcher » */
  title: string;
  /** Ex. « Enclos savane · mâles adultes en surnombre » */
  detail?: string;
}

export interface DashboardCard {
  /** 3 ou 4 lignes maximum, triées par urgence. */
  alerts: DashboardAlert[];
  /** Ligne de contexte discrète, ex. « 3 zoos · 1 réserve ». */
  meta?: string;
}

export interface GameModuleManifest {
  id: GameId;
  /** Versions du jeu prises en charge (ex. ["1.0"]). */
  supportedVersions: string[];
}

/** Côté serveur, chaque module expose au moins ceci. */
export interface GameModuleServer {
  manifest: GameModuleManifest;
  /** Calcule la carte de résumé d'une partie. */
  dashboardCard(saveId: string): Promise<DashboardCard>;
}
