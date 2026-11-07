/**
 * Écrans du club (ex-FM Coach), listés à plat dans la barre latérale sous « Mon club ».
 * Chaque écran montre ses parties en sous-onglets, une à la fois (la première par défaut).
 * Les anciens noms d'écran restent valides : `/club/contracts` ouvre Mercato et finances sur Contrats.
 */
export const CLUB_PAGES = ['tactic', 'squad', 'results', 'mercato'] as const;
export type ClubPage = (typeof CLUB_PAGES)[number];

export const PARTS: Record<ClubPage, readonly string[]> = {
  tactic: ['tactic', 'instructions', 'opponent', 'depth', 'calendar', 'style', 'effectiveness', 'project', 'training', 'staff'],
  squad: ['squad', 'playtime', 'dressing', 'progression', 'roles', 'compare', 'numbers', 'loans'],
  results: ['results', 'diagnosis', 'stats', 'analysis'],
  mercato: ['mercato', 'targets', 'finances', 'wages', 'contracts'],
};

/** Sous-onglets montrés directement ; les suivants passent dans « Plus ». */
export const VISIBLE_PARTS = 5;

/** Écran qui contient une partie (lui-même, ou l'écran où elle a été regroupée) ; `home` pour l'accueil. */
export function pageOf(v: string): ClubPage | 'home' {
  if ((CLUB_PAGES as readonly string[]).includes(v)) return v as ClubPage;
  return CLUB_PAGES.find((k) => PARTS[k].includes(v)) ?? 'home';
}

/** Lien d'une partie : l'accueil est la page « Aujourd'hui ». */
export const clubPath = (v: string) => (v === 'home' ? '/' : `/club/${v}`);
