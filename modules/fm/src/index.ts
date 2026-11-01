import type { GameModuleManifest } from '@simloom/shared';

/**
 * Module Football Manager.
 * Les données viennent du plugin BepInEx (lecture seule) qui écrit un instantané JSON
 * dans le dossier du jeu ; Simloom l'importe, le garde en historique et l'analyse.
 */
export const manifest: GameModuleManifest = {
  id: 'fm',
  supportedVersions: ['27'],
};

export * from './snapshot';
export * from './positions';
export * from './player';
export * from './alerts';
export * from './analysis';
export * from './summary';
export * from './tactic';
export * from './tactic-defaults';
export * from './club';
export * from './progress';
export * from './project';
export * from './targets';
export * from './training';
export * from './fixtures';
export * from './instructions';
export * from './team-instructions-fm27';
export * from './role-ratings-fm27';
export * from './game-stars';
export * from './lineup';
export * from './opponent';
export * from './matchup';
export * from './mercato';
