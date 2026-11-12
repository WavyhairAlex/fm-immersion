import type { InstructionGroup } from './instructions';
import type { Phase } from './tactic';

/*
 * Consignes individuelles de FM27 telles qu'affichées à l'écran du jeu (Tactique > joueur > Consignes
 * individuelles), relevées le 08/11/2026 : 13 groupes avec ballon, 4 sans ballon, chacun avec ses options
 * (libellés FR du jeu) et une valeur neutre (Normal, Standard…) qui n'est pas une consigne.
 * Le gardien a les mêmes groupes ; la plupart sont verrouillés par son rôle (voir instruction-locks-fm27.ts).
 */

export interface PiOptionDef {
  fr: string;
  en: string;
}

export interface PiGroupDef {
  group: InstructionGroup;
  phase: Phase;
  fr: string;
  en: string;
  /** Valeur neutre affichée par le jeu quand aucune option n'est choisie. */
  neutral: PiOptionDef;
  options: PiOptionDef[];
}

const o = (fr: string, en: string): PiOptionDef => ({ fr, en });
const NORMAL = o('Normal', 'Normal');
const STANDARD = o('Standard', 'Standard');

export const PLAYER_INSTRUCTIONS_FM27: readonly PiGroupDef[] = [
  { group: 'AttackingWidth', phase: 'ip', fr: 'Largeur du jeu offensif', en: 'Attacking Width', neutral: STANDARD, options: [o('Restez excentrés', 'Stay Wider'), o("Restez plus dans l'axe", 'Sit Narrower'), o('Prenez les espaces', 'Move Into Channels')] },
  { group: 'DribblingDirection', phase: 'ip', fr: 'Direction des courses balle au pied', en: 'Dribbling Direction', neutral: STANDARD, options: [o('Prenez les couloirs', 'Run Wide With Ball'), o("Repiquez dans l'axe", 'Cut Inside With Ball')] },
  { group: 'DribblingFrequency', phase: 'ip', fr: 'Fréquence des courses balle au pied', en: 'Dribbling Frequency', neutral: STANDARD, options: [o('Dribblez plus', 'Dribble More'), o('Dribblez moins', 'Dribble Less')] },
  { group: 'ForwardRuns', phase: 'ip', fr: "Courses vers l'avant", en: 'Forward Runs', neutral: o('Normale', 'Normal'), options: [o('Effectuez plus de courses', 'Get Further Forward'), o('Effectuez moins de courses', 'Hold Position')] },
  { group: 'FreedomOfMovement', phase: 'ip', fr: 'Liberté de mouvement', en: 'Freedom Of Movement', neutral: o('Suivez le positionnement tactique', 'Follow Tactical Positioning'), options: [o('Décrochez plus souvent', 'Roam From Position')] },
  { group: 'HoldUpBall', phase: 'ip', fr: 'Gardez la balle', en: 'Hold Up Ball', neutral: o('Non', 'No'), options: [o('Oui', 'Yes')] },
  { group: 'Shooting', phase: 'ip', fr: 'Tirs', en: 'Shooting', neutral: NORMAL, options: [o('Tirer plus souvent', 'Shoot More Often'), o('Tirer moins souvent', 'Shoot Less Often')] },
  { group: 'PassingRisk', phase: 'ip', fr: 'Risque des passes', en: 'Passing Risk', neutral: NORMAL, options: [o('Prenez plus de risques', 'Take More Risks'), o('Prenez moins de risques', 'Take Fewer Risks')] },
  { group: 'PassingStrategy', phase: 'ip', fr: 'Stratégie du jeu de passes', en: 'Passing Strategy', neutral: NORMAL, options: [o('Plus courtes', 'Shorter'), o('Plus directes', 'More Direct')] },
  { group: 'CrossFrom', phase: 'ip', fr: 'Centrer de', en: 'Cross From', neutral: NORMAL, options: [o('Centrez en profondeur', 'Cross From Deep'), o('Ligne de but', 'Byline')] },
  { group: 'CrossingStrategy', phase: 'ip', fr: 'Stratégie des centres', en: 'Crossing Strategy', neutral: NORMAL, options: [o('Second poteau', 'Far Post'), o('Centre', 'Centre'), o('Premier poteau', 'Near Post'), o('Attaquant pivot', 'Target Forward')] },
  { group: 'AttackBoxSide', phase: 'ip', fr: 'Attaquer la surface - côté', en: 'Attack The Box - Side', neutral: NORMAL, options: [o('Centre', 'Centre'), o('Gauche', 'Left'), o('Droite', 'Right'), o('Premier poteau', 'Near Post'), o('Second poteau', 'Far Post')] },
  { group: 'AttackBoxDepth', phase: 'ip', fr: 'Attaquer la surface - profondeur', en: 'Attack The Box - Depth', neutral: NORMAL, options: [o('Attaquer la ligne défensive', 'Attack The Defensive Line'), o('Arriver en retard dans la surface', 'Arrive Late In Box')] },
  { group: 'TriggerPress', phase: 'oop', fr: 'Pressing', en: 'Pressing', neutral: NORMAL, options: [o('Plus souvent', 'More Often'), o('Moins souvent', 'Less Often')] },
  { group: 'Marking', phase: 'oop', fr: 'Marquage', en: 'Marking', neutral: NORMAL, options: [o('Marquez de plus près', 'Mark Tighter')] },
  { group: 'Tackling', phase: 'oop', fr: 'Tacles', en: 'Tackling', neutral: NORMAL, options: [o('Taclez plus durement', 'Tackle Harder'), o('Taclez moins durement', 'Ease Off Tackles')] },
  { group: 'MarkingTarget', phase: 'oop', fr: 'Marquage individuel', en: 'Man Marking', neutral: NORMAL, options: [o('Marquage individuel', 'Man Marking'), o('Marquage de zone', 'Zonal Marking')] },
];

/**
 * Libellés de la table des verrous (relevés dans le code du jeu) qui diffèrent de ceux de l'écran :
 * on les ramène au libellé affiché.
 */
export const LOCK_LABEL: Record<string, string> = {
  'Attaquer le côté gauche de la surface': 'Gauche',
  'Jouez plus court': 'Plus courtes',
  'Plus de passes directes': 'Plus directes',
};
export const lockLabel = (s: string) => LOCK_LABEL[s] ?? s;

/** Clé d'une consigne choisie : « Groupe:Option » (libellé FR de l'option). */
export const piKey = (group: InstructionGroup, option: string) => `${group}:${option}`;
export const piKeyGroup = (key: string) => key.split(':')[0] as InstructionGroup;
export const piKeyOption = (key: string) => key.slice(key.indexOf(':') + 1);

/** Anciennes consignes de l'éditeur (0.1.90) → clé du jeu. */
export const LEGACY_PI: Record<string, string> = {
  gkShort: 'PassingStrategy:Plus courtes', gkLong: 'PassingStrategy:Plus directes', shortPass: 'PassingStrategy:Plus courtes', directPass: 'PassingStrategy:Plus directes',
  riskMore: 'PassingRisk:Prenez plus de risques', riskLess: 'PassingRisk:Prenez moins de risques', dribbleMore: 'DribblingFrequency:Dribblez plus', dribbleLess: 'DribblingFrequency:Dribblez moins',
  cutInside: "DribblingDirection:Repiquez dans l'axe", shootMore: 'Shooting:Tirer plus souvent', shootLess: 'Shooting:Tirer moins souvent',
  holdPosition: 'ForwardRuns:Effectuez moins de courses', roam: 'FreedomOfMovement:Décrochez plus souvent', holdBall: 'HoldUpBall:Oui',
  runBehind: 'AttackBoxDepth:Attaquer la ligne défensive', lateRuns: 'AttackBoxDepth:Arriver en retard dans la surface',
  nearPost: 'AttackBoxSide:Premier poteau', farPost: 'AttackBoxSide:Second poteau', crossByline: 'CrossFrom:Ligne de but', crossToTarget: 'CrossingStrategy:Attaquant pivot',
  pressMore: 'TriggerPress:Plus souvent', pressLess: 'TriggerPress:Moins souvent', tackleHarder: 'Tackling:Taclez plus durement', tackleLess: 'Tackling:Taclez moins durement',
  markTighter: 'Marking:Marquez de plus près',
  stayWider: 'AttackingWidth:Restez excentrés', sitNarrower: "AttackingWidth:Restez plus dans l'axe", moveChannels: 'AttackingWidth:Prenez les espaces',
  runWide: 'DribblingDirection:Prenez les couloirs', getForward: 'ForwardRuns:Effectuez plus de courses',
};

/** Libellé d'une consigne choisie dans la langue voulue. */
export function piLabel(key: string, en = false): { group: string; option: string } {
  const g = PLAYER_INSTRUCTIONS_FM27.find((d) => d.group === piKeyGroup(key));
  const opt = g?.options.find((x) => x.fr === piKeyOption(key));
  return { group: g ? (en ? g.en : g.fr) : piKeyGroup(key), option: opt ? (en ? opt.en : opt.fr) : piKeyOption(key) };
}
