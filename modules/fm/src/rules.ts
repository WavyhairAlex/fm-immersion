import type { FmPlayer } from './player';
import type { FormationPlan } from './tactic';

/**
 * Règles de compétition qui pèsent sur la feuille de match : changements, banc, joueurs hors UE, jeunes formés
 * au pays. Elles sont propres à chaque championnat et coupe dans FM27 (base de données du jeu).
 *
 * Tant qu'elles ne sont pas lues dans le jeu, on part des valeurs connues, à confirmer sur l'écran Règles de la
 * compétition. 2. liga slovaque (récapitulatif FM des championnats slovaques, the9llamas) : 5 joueurs hors UE au
 * plus sur la feuille, au moins 1 Slovaque de moins de 21 ans sur la feuille et dans le onze de départ.
 */
export interface CompetitionRules {
  /** Changements autorisés et arrêts de jeu pour les faire (5 en 3 fois dans la plupart des championnats). */
  subs: number;
  windows: number | null;
  /** Remplaçants sur la feuille de match (null : inconnu). */
  bench: number | null;
  /** Joueurs hors UE au plus sur la feuille de match (null : pas de limite connue). */
  nonEuMax: number | null;
  /** Joueurs formés au pays de moins de 21 ans exigés sur la feuille et dans le onze de départ. */
  u21Squad: number;
  u21Xi: number;
  /** Valeurs reprises d'une source externe, à vérifier dans le jeu. */
  unverified: boolean;
}

export const DEFAULT_RULES: CompetitionRules = { subs: 5, windows: 3, bench: null, nonEuMax: null, u21Squad: 0, u21Xi: 0, unverified: true };

/** Règles connues par nom de compétition (minuscules, sans accents). */
const KNOWN: { match: RegExp; rules: CompetitionRules }[] = [
  { match: /^(2\.?\s*(liga|slovenska futbalova liga)|monacobet liga|slovak.*(second|2))/i, rules: { subs: 5, windows: 3, bench: null, nonEuMax: 5, u21Squad: 1, u21Xi: 1, unverified: true } },
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Match amical (« Match Amical » dans l'instantané FR) : rien en jeu, ni classement, ni temps de jeu promis. */
export function isFriendly(name: string | null | undefined): boolean {
  return /amical|friendl|testspiel/i.test(fold(name ?? ''));
}

/** Nature d'une compétition d'après son nom (FR, EN et quelques langues du jeu). */
export type CompetitionKind = 'friendly' | 'league' | 'cup' | 'europe' | 'other';

export function competitionKind(name: string | null | undefined): CompetitionKind {
  const n = fold(name ?? '').toLowerCase();
  if (!n) return 'other';
  if (isFriendly(n)) return 'friendly';
  if (/champions|europa|conference|uefa|europe|libertadores|sudamericana|afc |concacaf/.test(n)) return 'europe';
  if (/\bcup\b|coupe|pokal|copa|pohar|coppa|taca|beker|trophy|trophee|shield|supercup|super cup|community/.test(n)) return 'cup';
  if (/liga|league|ligue|division|championnat|premier|serie|bundesliga|eredivisie|primeira|national|championship|\bl1\b|\bl2\b/.test(n)) return 'league';
  return 'other';
}

/**
 * Poids d'un match pour la gestion de l'effectif : le championnat et l'Europe passent en premier, une coupe nationale
 * est l'occasion de faire tourner (sans brader : la colonne vertébrale reste), un amical n'a rien en jeu.
 * `congested` : un autre match à 3 jours ou moins, donc rotation conseillée quelle que soit la compétition.
 */
export interface CompetitionWeight {
  kind: CompetitionKind;
  importance: 'low' | 'normal' | 'high';
  /** L'adjoint conseille de faire tourner avant ce match. */
  rotate: boolean;
  reason: 'friendly' | 'cup' | 'congested' | null;
}

export function competitionWeight(name: string | null | undefined, opts: { congested?: boolean } = {}): CompetitionWeight {
  const kind = competitionKind(name);
  if (kind === 'friendly') return { kind, importance: 'low', rotate: true, reason: 'friendly' };
  if (kind === 'cup') return { kind, importance: 'normal', rotate: true, reason: 'cup' };
  const importance = kind === 'other' ? 'normal' : 'high';
  return opts.congested ? { kind, importance, rotate: true, reason: 'congested' } : { kind, importance, rotate: false, reason: null };
}

/** Deux matchs à 3 jours ou moins : calendrier chargé. */
export const CONGESTED_DAYS = 3;

/** Calendrier chargé autour du prochain match : un autre match dans les `CONGESTED_DAYS` jours qui le suivent. */
export function isCongested(fixtures: { date: string }[], gameDate: string): boolean {
  const next = [...fixtures].filter((f) => f.date >= gameDate).sort((a, b) => a.date.localeCompare(b.date));
  if (next.length < 2) return false;
  const gap = (Date.parse(next[1]!.date) - Date.parse(next[0]!.date)) / 86_400_000;
  return gap <= CONGESTED_DAYS;
}

export function competitionRules(name: string | null | undefined): CompetitionRules {
  const n = fold(name ?? '');
  return KNOWN.find((k) => k.match.test(n))?.rules ?? DEFAULT_RULES;
}

/** Changements à prévoir avant le match : on en garde 2 pour une blessure ou un carton (au moins 1 prévu). */
export const plannedSubs = (r: CompetitionRules) => Math.max(1, Math.min(3, r.subs - 2));

export interface RuleCheck {
  id: 'u21Xi' | 'u21Squad' | 'nonEu';
  status: 'ok' | 'bad' | 'unknown';
  need: number;
  have: number | null;
}

/**
 * Contrôle du onze et du banc. Moins de 21 ans : d'après l'âge (la nationalité n'est pas encore lue, donc « formé
 * au pays » n'est pas vérifiable : le contrôle dit « inconnu » s'il manque l'âge). Hors UE : inconnu tant que la
 * nationalité n'est pas lue.
 */
export function ruleChecks(plan: FormationPlan, r: CompetitionRules, bench: FmPlayer[]): RuleCheck[] {
  const xi = plan.slots.flatMap((s) => (s.player ? [s.player] : []));
  const young = (ps: FmPlayer[]) => (ps.some((p) => p.age == null) ? null : ps.filter((p) => (p.age ?? 99) < 21).length);
  const out: RuleCheck[] = [];
  const status = (have: number | null, need: number) => (have == null ? 'unknown' : have >= need ? 'ok' : 'bad');
  if (r.u21Xi) {
    const have = young(xi);
    out.push({ id: 'u21Xi', status: status(have, r.u21Xi), need: r.u21Xi, have });
  }
  if (r.u21Squad) {
    const have = young([...xi, ...bench]);
    out.push({ id: 'u21Squad', status: status(have, r.u21Squad), need: r.u21Squad, have });
  }
  if (r.nonEuMax != null) out.push({ id: 'nonEu', status: 'unknown', need: r.nonEuMax, have: null });
  return out;
}
