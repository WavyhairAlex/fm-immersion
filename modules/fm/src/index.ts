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
