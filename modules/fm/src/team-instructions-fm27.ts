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
  /** Titre de la case dans l'écran Consignes d'équipe du jeu (« Caract. direct des passes »). */
  title: string;
  /** Valeur affichée dans la case, option par option (« Plus courtes ») ; même ordre que `options`. */
  short: string[];
}

const S = null;

export const TEAM_INSTRUCTIONS_FM27: TeamInstructionDef[] = [
  // Avec ballon, vue d'ensemble
  { id: 1, code: 'PassingDirectness', phase: 'ip', stage: 'overview', options: ['Passes beaucoup plus courtes', 'Faites plus de passes courtes', S, 'Faites plus de passes directes', 'Jouez beaucoup plus direct'], def: 2, title: 'Caract. direct des passes', short: ['Beaucoup plus courtes', 'Plus courtes', 'Standard', 'Plus directes', 'Beaucoup plus directes'] },
  { id: 4, code: 'TeamWidth', phase: 'ip', stage: 'overview', options: ['Beaucoup plus axiale', 'Plus axiale', S, 'Plus large', 'Beaucoup plus large'], def: 2, title: 'Largeur du jeu offensif', short: ['Beaucoup plus axiale', 'Plus axiale', 'Standard', 'Plus large', 'Beaucoup plus large'] },
  { id: 5, code: 'CreativeFreedom', phase: 'ip', stage: 'overview', options: ['Soyez plus disciplinés', S, 'Soyez plus expressifs'], def: 1, title: 'Liberté créative', short: ['Plus disciplinés', 'Équilibrée', 'Plus expressifs'] },
  { id: 6, code: 'PlayForSetPieces', phase: 'ip', stage: 'overview', options: [S, 'Obtenir des coups de pied arrêtés'], def: 0, title: 'Obtenir des coups de pied arrêtés', short: ['Garder le ballon en jeu', 'Obtenir des coups de pied arrêtés'] },
  { id: 7, code: 'TimeWasting', phase: 'ip', stage: 'overview', options: [S, 'Gagnez du temps', 'Gagnez beaucoup plus de temps'], def: 0, title: 'Perdre du temps', short: ['Normal', 'Gagner du temps', 'Gagner beaucoup plus de temps'] },
  { id: 21, code: 'Tempo', phase: 'ip', stage: 'overview', options: ['Rythme beaucoup plus lent', 'Rythme plus lent', S, 'Rythme plus élevé', 'Rythme beaucoup plus élevé'], def: 2, title: 'Rythme', short: ['Beaucoup plus lent', 'Plus lent', 'Standard', 'Plus élevé', 'Beaucoup plus élevé'] },
  // Avec ballon, construction
  {
    id: 16,
    code: 'GoalkeeperDistributionTarget',
    phase: 'ip',
    stage: 'buildUp',
    options: [S, 'Relancez vers défenseurs centraux', 'Relancez vers défenseurs latéraux', 'Relancez sur les ailes', 'Relancez vers meneur de jeu', 'Relancez vers attaquant pivot', 'Relancez par-dessus la défense adverse'],
    def: 0, title: 'Relances GB', short: ['Équilibrées', 'Défenseurs centraux', 'Défenseurs latéraux', 'Ailes', 'Meneur de jeu', 'Attaquant pivot', 'Par-dessus la défense'] },
  { id: 17, code: 'GoalkeeperDistributionSpeed', phase: 'ip', stage: 'buildUp', options: ['Ralentissez le rythme', S, 'Relances rapides'], def: 1, title: 'Relances GB (vitesse)', short: ['Ralentir le rythme', 'Équilibrées', 'Rapides'] },
  { id: 24, code: 'BuildUpStrategy', phase: 'ip', stage: 'buildUp', options: ['Jouer malgré le pressing', S, 'Contourner le pressing'], def: 1, title: "Stratégie d'attaques placées", short: ['Gérer le pressing', 'Équilibrée', 'Contourner le pressing'] },
  { id: 29, code: 'GoalKicks', phase: 'ip', stage: 'buildUp', options: ['Dégagements au pied courts', S, 'Longs dégagements au pied'], def: 1, title: 'Sorties de but', short: ['Courtes', 'Équilibrées', 'Longues'] },
  // Avec ballon, progression
  { id: 19, code: 'Dribbling', phase: 'ip', stage: 'progression', options: ['Faites moins de dribbles', S, 'Prenez la défense de vitesse'], def: 1, title: 'Dribbles', short: ['Moins de dribbles', 'Standard', 'Prendre la défense de vitesse'] },
  { id: 20, code: 'PassReception', phase: 'ip', stage: 'progression', options: ['Passer dans les pieds', S, 'Passer dans les espaces'], def: 1, title: 'Réception des passes', short: ['Dans les pieds', 'Standard', 'Dans les espaces'] },
  { id: 28, code: 'SupportingRuns', phase: 'ip', stage: 'progression', options: [S, 'Dédoublements intérieurs gauches', 'Dédoublements intérieurs droits', 'Cherchez le dédoublement intérieur'], def: 0, title: 'Courses de soutien', short: ['Équilibré', 'Intérieur gauche', 'Intérieur droit', 'Intérieur'] },
  { id: 30, code: 'ProgressThrough', phase: 'ip', stage: 'progression', options: [S, "Concentrez le jeu dans l'axe", "Concentrez le jeu sur l'aile gauche", "Concentrez le jeu sur l'aile droite", 'Jouez sur les deux flancs'], def: 0, title: 'Progression', short: ['Équilibrée', "Par l'axe", 'Aile gauche', 'Aile droite', 'Les deux flancs'] },
  { id: 31, code: 'SupportingRunsSecondary', phase: 'ip', stage: 'progression', options: [S, 'Dédoublements extérieurs gauches', 'Dédoublements extérieurs droits', 'Cherchez à dédoubler'], def: 0, title: 'Courses de soutien (extérieur)', short: ['Équilibré', 'Extérieur gauche', 'Extérieur droit', 'Dédoubler'] },
  // Avec ballon, dernier tiers
  { id: 18, code: 'Patience', phase: 'ip', stage: 'finalThird', options: ['Centrer de loin', S, 'Jouer le ballon dans la surface'], def: 1, title: 'Patience', short: ['Centrer de loin', 'Standard', 'Jouer le ballon dans la surface'] },
  { id: 26, code: 'CrossingStyle', phase: 'ip', stage: 'finalThird', options: [S, 'Faites des centres flottants', 'Centrez en force', 'Centres à ras de terre'], def: 0, title: 'Style de centres', short: ['Équilibrées', 'Flottants', 'En force', 'À ras de terre'] },
  { id: 27, code: 'ShotsFromDistance', phase: 'ip', stage: 'finalThird', options: ['Dissuader de frapper de loin', S, 'Tirez à vue'], def: 1, title: 'Tirs de loin', short: ['Moins de tirs de loin', 'Standard', 'Tirer à vue'] },
  // Transitions
  { id: 3, code: 'AttackingTransition', phase: 'transition', stage: 'transition', options: ['Rester en place', S, 'Contrez'], def: 1, title: 'Transition offensive', short: ['Rester en place', 'Standard', 'Contrer'] },
  { id: 11, code: 'DefensiveTransition', phase: 'transition', stage: 'transition', options: ['Regroupement', S, 'Effectuer un contre-pressing'], def: 1, title: 'Transition défensive', short: ['Regroupement', 'Standard', 'Effectuer un contre-pressing'] },
  // Sans ballon
  { id: 8, code: 'LineOfEngagement', phase: 'oop', stage: 'defence', options: ['Bloc bas', 'Bloc médian', 'Pressing haut'], def: null, title: 'Hauteur du pressing', short: ['Bloc bas', 'Bloc médian', 'Pressing haut'] },
  { id: 9, code: 'DefensiveLine', phase: 'oop', stage: 'defence', options: ['Ligne défensive beaucoup plus basse', 'Ligne défensive plus basse', S, 'Ligne défensive plus haute', 'Ligne défensive beaucoup plus haute'], def: 2, title: 'Ligne défensive', short: ['Beaucoup plus basse', 'Plus basse', 'Standard', 'Plus haute', 'Beaucoup plus haute'] },
  {
    id: 10,
    code: 'PressingTrigger',
    phase: 'oop',
    stage: 'defence',
    options: ['Déclenchez le pressing beaucoup moins souvent', 'Déclenchez le pressing moins souvent', S, 'Déclenchez le pressing plus souvent', 'Déclenchez le pressing beaucoup plus souvent'],
    def: 2, title: 'Déclench. pressing', short: ['Beaucoup moins souvent', 'Moins souvent', 'Standard', 'Plus souvent', 'Beaucoup plus souvent'] },
  { id: 12, code: 'Tackling', phase: 'oop', stage: 'defence', options: ['Ne pas se jeter', S, "S'engager plus"], def: 1, title: 'En taclant', short: ['Ne pas se jeter', 'Standard', "S'engager plus"] },
  { id: 15, code: 'DefensiveLineBehaviour', phase: 'oop', stage: 'defence', options: ['Rester plus haut', S, 'Rester plus bas'], def: 1, title: 'Comportement de la ligne défensive', short: ['Rester plus haut', 'Équilibré', 'Rester plus bas'] },
  { id: 22, code: 'CrossEngagement', phase: 'oop', stage: 'defence', options: ['Empêchez de centrer', S, 'Laissez centrer'], def: 1, when: 'lowBlock', title: 'Pressing sur centres', short: ['Empêcher de centrer', 'Équilibré', 'Laisser centrer'] },
  { id: 23, code: 'PreventShortGKDistribution', phase: 'oop', stage: 'defence', options: [S, 'Empêchez les relances courtes du GB'], def: 0, when: 'highBlock', title: 'Relance courte du gardien', short: ['Non', 'Oui'] },
  { id: 25, code: 'PressingTrap', phase: 'oop', stage: 'defence', options: ["Pressing vers l'axe", S, 'Pressing vers les côtés'], def: 1, title: 'Piège du pressing', short: ["Vers l'axe", 'Équilibrée', 'Vers les côtés'] },
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

/**
 * Anciens libellés (repères locaux `simloom-roles.json`, versions précédentes de Simloom) → consigne du jeu.
 * Relevés sur l'écran Consignes d'équipe de FM27 le 01/11/2026.
 */
const ALIASES: Record<string, [number, number]> = {
  'passes plus courtes': [1, 1],
  'passes beaucoup plus courtes': [1, 0],
  'passes plus directes': [1, 3],
  'gerer le pressing': [24, 0],
  'gb relance vers dc': [16, 1],
  'gb relance vers les dc': [16, 1],
  'gb relance vers lateraux': [16, 2],
  'declencher le pressing plus souvent': [10, 3],
  'declencher le pressing beaucoup plus souvent': [10, 4],
  'declencher le pressing moins souvent': [10, 1],
  'empecher relances courtes du gb': [23, 1],
  'empecher les relances courtes du gb': [23, 1],
  'contre-pressing en transition': [11, 2],
  'contre-pressing': [11, 2],
  'regroupement en transition': [11, 0],
  'contre-attaque': [3, 2],
  'contre-attaquer': [3, 2],
  // Fichier local simloom-roles.json du 31/10/2026 (inspection du 02/11).
  'plus de passes directes': [1, 3],
  'plus de passes courtes': [1, 1],
  'contre-attaque en transition': [3, 2],
  'relances rapides du gb': [17, 2],
  'ligne def. descend plus bas': [15, 2],
  'ligne defensive descend plus bas': [15, 2],
};

/** Consigne d'équipe du jeu correspondant à un libellé (option longue, « Titre : valeur » de la case, ou ancien libellé), ou null. */
export function teamInstructionOf(label: string): { def: TeamInstructionDef; option: number } | null {
  const n = norm(label);
  for (const def of TEAM_INSTRUCTIONS_FM27) {
    const option = def.options.findIndex((o) => o != null && norm(o) === n);
    if (option >= 0) return { def, option };
  }
  // « Caract. direct des passes : Plus courtes » (titre de la case et valeur, comme à l'écran)
  const sep = n.indexOf(':');
  if (sep > 0) {
    const [title, value] = [n.slice(0, sep).trim(), n.slice(sep + 1).trim()];
    const def = TEAM_INSTRUCTIONS_FM27.find((d) => norm(d.title) === title);
    const option = def ? def.short.findIndex((o) => norm(o) === value) : -1;
    if (def && option >= 0 && def.options[option] != null) return { def, option };
  }
  const alias = ALIASES[n];
  if (alias) {
    const def = TEAM_INSTRUCTIONS_FM27.find((d) => d.id === alias[0]);
    if (def) return { def, option: alias[1] };
  }
  return null;
}

/** Libellé tel qu'à l'écran du jeu : « Caract. direct des passes : Plus courtes », ou null si la consigne est inconnue. */
export function gameInstructionLabel(label: string): string | null {
  const m = teamInstructionOf(label);
  return m ? `${m.def.title} : ${m.def.short[m.option] ?? m.def.options[m.option]}` : null;
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

/** Ordre des cases de l'écran Consignes d'équipe du jeu (vue d'ensemble), relevé le 01/11/2026. */
const CARD_ORDER: Record<'ip' | 'oop', number[]> = {
  ip: [1, 21, 4, 3, 5, 7, 6, 18, 27, 26, 19, 28, 30, 20, 24, 29, 17, 16],
  oop: [8, 9, 15, 10, 11, 12, 23, 25, 22],
};

export interface TeamInstructionCard {
  def: TeamInstructionDef;
  /** Option affichée : celle demandée, sinon la valeur par défaut du jeu. */
  option: number;
  /** Valeur de la case (« Plus courtes », « Standard »). */
  value: string;
  /** Vrai si la consigne s'écarte de la valeur par défaut. */
  set: boolean;
}

/**
 * Toutes les cases de l'écran Consignes d'équipe, avec et sans ballon, dans l'ordre du jeu : chaque consigne
 * demandée prend sa valeur, les autres gardent celle par défaut (comme dans le jeu). La transition offensive
 * est rangée avec le ballon, la transition défensive sans, comme à l'écran.
 */
export function teamInstructionCards(labels: string[]): Record<'ip' | 'oop', TeamInstructionCard[]> {
  const chosen = new Map<number, number>();
  for (const l of labels) {
    const m = teamInstructionOf(l);
    if (m && !chosen.has(m.def.id)) chosen.set(m.def.id, m.option);
  }
  const byId = new Map(TEAM_INSTRUCTIONS_FM27.map((d) => [d.id, d]));
  const card = (id: number): TeamInstructionCard | null => {
    const def = byId.get(id);
    if (!def) return null;
    const option = chosen.get(id) ?? def.def ?? 0;
    return { def, option, value: def.short[option] ?? def.options[option] ?? '', set: chosen.has(id) && option !== def.def };
  };
  const of = (ph: 'ip' | 'oop') => CARD_ORDER[ph].map(card).filter((c): c is TeamInstructionCard => !!c);
  return { ip: of('ip'), oop: of('oop') };
}
