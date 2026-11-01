/*
 * Consignes d'équipe de FM27, relevées dans les fichiers du jeu le 01/11/2026 (game_plugin.dll : fiches
 * d'interface, options et valeur par défaut ; libellés FR de languages.fmf et de FUN_184a33d40).
 * Résultat complet sur le PC du joueur : D:\COMFY\archivix-analyse\consignes-equipe-fm27.json.
 *
 * Sûr : 28 consignes avec fiche, options, défaut, mentalité à 7 valeurs. Déduit : phase (d'après les icônes)
 * et rapprochement libellé ↔ option (par position). Les consignes d'équipe ne verrouillent pas les consignes
 * individuelles dans les fonctions de règles du jeu (elles ne les reçoivent pas).
 * À vérifier à l'écran : « Jouer malgré le pressing » (une autre clé du jeu dit « Gérer le pressing »).
 */

export type TeamPhase = 'ip' | 'transition' | 'oop';
export type TeamStage = 'overview' | 'buildUp' | 'progression' | 'finalThird' | 'transition' | 'defence';

export interface TeamInstructionDef {
  /** Identifiant numérique du jeu. */
  id: number;
  /** Nom anglais de l'énumération du jeu. */
  code: string;
  phase: TeamPhase;
  stage: TeamStage;
  /** Options dans l'ordre du jeu ; `null` = Standard (aucune consigne). */
  options: (string | null)[];
  /** Index de l'option par défaut, ou null si le jeu n'en donne pas. */
  def: number | null;
  /** Condition affichée par le jeu (ex. bloc haut). */
  when?: 'highBlock' | 'lowBlock';
}

const S = null;

export const TEAM_INSTRUCTIONS_FM27: TeamInstructionDef[] = [
  // Avec ballon, vue d'ensemble
  { id: 1, code: 'PassingDirectness', phase: 'ip', stage: 'overview', options: ['Passes beaucoup plus courtes', 'Faites plus de passes courtes', S, 'Faites plus de passes directes', 'Jouez beaucoup plus direct'], def: 2 },
  { id: 4, code: 'TeamWidth', phase: 'ip', stage: 'overview', options: ['Beaucoup plus axiale', 'Plus axiale', S, 'Plus large', 'Beaucoup plus large'], def: 2 },
  { id: 5, code: 'CreativeFreedom', phase: 'ip', stage: 'overview', options: ['Soyez plus disciplinés', S, 'Soyez plus expressifs'], def: 1 },
  { id: 6, code: 'PlayForSetPieces', phase: 'ip', stage: 'overview', options: [S, 'Obtenir des coups de pied arrêtés'], def: 0 },
  { id: 7, code: 'TimeWasting', phase: 'ip', stage: 'overview', options: [S, 'Gagnez du temps', 'Gagnez beaucoup plus de temps'], def: 0 },
  { id: 21, code: 'Tempo', phase: 'ip', stage: 'overview', options: ['Rythme beaucoup plus lent', 'Rythme plus lent', S, 'Rythme plus élevé', 'Rythme beaucoup plus élevé'], def: 2 },
  // Avec ballon, construction
  {
    id: 16,
    code: 'GoalkeeperDistributionTarget',
    phase: 'ip',
    stage: 'buildUp',
    options: [S, 'Relancez vers défenseurs centraux', 'Relancez vers défenseurs latéraux', 'Relancez sur les ailes', 'Relancez vers meneur de jeu', 'Relancez vers attaquant pivot', 'Relancez par-dessus la défense adverse'],
    def: 0,
  },
  { id: 17, code: 'GoalkeeperDistributionSpeed', phase: 'ip', stage: 'buildUp', options: ['Ralentissez le rythme', S, 'Relances rapides'], def: 1 },
  { id: 24, code: 'BuildUpStrategy', phase: 'ip', stage: 'buildUp', options: ['Jouer malgré le pressing', S, 'Contourner le pressing'], def: 1 },
  { id: 29, code: 'GoalKicks', phase: 'ip', stage: 'buildUp', options: ['Dégagements au pied courts', S, 'Longs dégagements au pied'], def: 1 },
  // Avec ballon, progression
  { id: 19, code: 'Dribbling', phase: 'ip', stage: 'progression', options: ['Faites moins de dribbles', S, 'Prenez la défense de vitesse'], def: 1 },
  { id: 20, code: 'PassReception', phase: 'ip', stage: 'progression', options: ['Passer dans les pieds', S, 'Passer dans les espaces'], def: 1 },
  { id: 28, code: 'SupportingRuns', phase: 'ip', stage: 'progression', options: [S, 'Dédoublements intérieurs gauches', 'Dédoublements intérieurs droits', 'Cherchez le dédoublement intérieur'], def: 0 },
  { id: 30, code: 'ProgressThrough', phase: 'ip', stage: 'progression', options: [S, "Concentrez le jeu dans l'axe", "Concentrez le jeu sur l'aile gauche", "Concentrez le jeu sur l'aile droite", 'Jouez sur les deux flancs'], def: 0 },
  { id: 31, code: 'SupportingRunsSecondary', phase: 'ip', stage: 'progression', options: [S, 'Dédoublements extérieurs gauches', 'Dédoublements extérieurs droits', 'Cherchez à dédoubler'], def: 0 },
  // Avec ballon, dernier tiers
  { id: 18, code: 'Patience', phase: 'ip', stage: 'finalThird', options: ['Centrer de loin', S, 'Jouer le ballon dans la surface'], def: 1 },
  { id: 26, code: 'CrossingStyle', phase: 'ip', stage: 'finalThird', options: [S, 'Faites des centres flottants', 'Centrez en force', 'Centres à ras de terre'], def: 0 },
  { id: 27, code: 'ShotsFromDistance', phase: 'ip', stage: 'finalThird', options: ['Dissuader de frapper de loin', S, 'Tirez à vue'], def: 1 },
  // Transitions
  { id: 3, code: 'AttackingTransition', phase: 'transition', stage: 'transition', options: ['Rester en place', S, 'Contrez'], def: 1 },
  { id: 11, code: 'DefensiveTransition', phase: 'transition', stage: 'transition', options: ['Regroupement', S, 'Effectuer un contre-pressing'], def: 1 },
  // Sans ballon
  { id: 8, code: 'LineOfEngagement', phase: 'oop', stage: 'defence', options: ['Bloc bas', 'Bloc médian', 'Pressing haut'], def: null },
  { id: 9, code: 'DefensiveLine', phase: 'oop', stage: 'defence', options: ['Ligne défensive beaucoup plus basse', 'Ligne défensive plus basse', S, 'Ligne défensive plus haute', 'Ligne défensive beaucoup plus haute'], def: 2 },
  {
    id: 10,
    code: 'PressingTrigger',
    phase: 'oop',
    stage: 'defence',
    options: ['Déclenchez le pressing beaucoup moins souvent', 'Déclenchez le pressing moins souvent', S, 'Déclenchez le pressing plus souvent', 'Déclenchez le pressing beaucoup plus souvent'],
    def: 2,
  },
  { id: 12, code: 'Tackling', phase: 'oop', stage: 'defence', options: ['Ne pas se jeter', S, "S'engager plus"], def: 1 },
  { id: 15, code: 'DefensiveLineBehaviour', phase: 'oop', stage: 'defence', options: ['Rester plus haut', S, 'Rester plus bas'], def: 1 },
  { id: 22, code: 'CrossEngagement', phase: 'oop', stage: 'defence', options: ['Empêchez de centrer', S, 'Laissez centrer'], def: 1, when: 'highBlock' },
  { id: 23, code: 'PreventShortGKDistribution', phase: 'oop', stage: 'defence', options: [S, 'Empêchez les relances courtes du GB'], def: 0, when: 'lowBlock' },
  { id: 25, code: 'PressingTrap', phase: 'oop', stage: 'defence', options: ["Pressing vers l'axe", S, 'Pressing vers les côtés'], def: 1 },
];

/** Mentalités de FM27, de la plus prudente à la plus offensive (libellés du jeu, au féminin). */
export const MENTALITIES_FM27 = ['Très défensive', 'Défensive', 'Prudente', 'Équilibrée', 'Positive', 'Offensive', 'Très offensive'] as const;
export type Mentality = (typeof MENTALITIES_FM27)[number];

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();

/** Consigne d'équipe du jeu correspondant à un libellé d'option, ou null si le jeu ne la connaît pas. */
export function teamInstructionOf(label: string): { def: TeamInstructionDef; option: number } | null {
  const n = norm(label);
  for (const def of TEAM_INSTRUCTIONS_FM27) {
    const option = def.options.findIndex((o) => o != null && norm(o) === n);
    if (option >= 0) return { def, option };
  }
  return null;
}

export interface TeamInstructionIssue {
  label: string;
  kind: 'unknown' | 'sameGroup' | 'condition';
  /** Autre libellé en conflit (même consigne) ou condition manquante. */
  other?: string;
}

/**
 * Vérifie une liste de consignes d'équipe : chaque libellé doit exister dans FM27, une consigne ne peut
 * prendre qu'une option (le jeu remplace l'une par l'autre), et les consignes liées à un bloc
 * (« Empêchez de centrer » en bloc haut, « Empêchez les relances courtes du GB » en bloc bas) demandent ce bloc.
 */
export function checkTeamInstructions(labels: string[]): TeamInstructionIssue[] {
  const issues: TeamInstructionIssue[] = [];
  const seen = new Map<number, string>();
  const found = labels.map((l) => ({ l, m: teamInstructionOf(l) }));
  const block = found.find((f) => f.m?.def.code === 'LineOfEngagement')?.m?.option;
  for (const { l, m } of found) {
    if (!m) {
      issues.push({ label: l, kind: 'unknown' });
      continue;
    }
    const prev = seen.get(m.def.id);
    if (prev) issues.push({ label: l, kind: 'sameGroup', other: prev });
    else seen.set(m.def.id, l);
    if (m.def.when === 'highBlock' && block !== 2) issues.push({ label: l, kind: 'condition', other: 'Pressing haut' });
    if (m.def.when === 'lowBlock' && block !== 0) issues.push({ label: l, kind: 'condition', other: 'Bloc bas' });
  }
  return issues;
}
