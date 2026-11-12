import type { FmPlayer } from './player';
import { countryOfLeague, countryOfNationality } from './countries';
import { snapshotFixtures } from './fixtures';
import { competitionKind, eligibilityOf, type Eligibility } from './rules';
import type { FmSnapshot } from './snapshot';

/**
 * Liste d'inscription d'un championnat (repris de l'ancienne appli FM Notebook) : taille de la liste, joueurs formés
 * localement exigés (dont formés au club), plafond de joueurs hors UE. Les moins de 21 ans s'inscrivent à part et
 * ne prennent pas de place. Règles réelles des grands championnats, à confirmer sur l'écran Règles de la compétition
 * de FM27 ; ailleurs, rien n'est imposé et l'écran montre seulement les comptes.
 */
export interface RegistrationRules {
  key: 'FR' | 'IT' | 'ES' | 'EN' | 'DE' | 'generic';
  /** Joueurs de 22 ans et plus inscrits au plus (null : pas de limite). */
  squadSize: number | null;
  /** Formés localement exigés, dont formés au club (null : pas d'exigence). */
  hgTotal: number | null;
  hgClub: number | null;
  /** Joueurs hors UE inscrits au plus (null : pas de plafond). */
  nonEuCap: number | null;
}

const RULES: { match: RegExp; rules: RegistrationRules }[] = [
  { match: /^ligue 1\b/i, rules: { key: 'FR', squadSize: null, hgTotal: 8, hgClub: 4, nonEuCap: null } },
  { match: /^serie a\b/i, rules: { key: 'IT', squadSize: 25, hgTotal: 8, hgClub: 4, nonEuCap: null } },
  { match: /^(laliga|la liga)\b/i, rules: { key: 'ES', squadSize: 25, hgTotal: 8, hgClub: 4, nonEuCap: 3 } },
  { match: /^premier league$/i, rules: { key: 'EN', squadSize: 25, hgTotal: 8, hgClub: null, nonEuCap: null } },
  { match: /^bundesliga$/i, rules: { key: 'DE', squadSize: null, hgTotal: 12, hgClub: 6, nonEuCap: null } },
];
export const GENERIC_REGISTRATION: RegistrationRules = { key: 'generic', squadSize: null, hgTotal: null, hgClub: null, nonEuCap: null };

export function registrationRules(league: string | null | undefined): RegistrationRules {
  const n = (league ?? '').trim();
  return RULES.find((r) => r.match.test(n))?.rules ?? GENERIC_REGISTRATION;
}

/** Pays de l'UE (codes de countries.ts). */
const EU = new Set(['FR', 'DE', 'ES', 'IT', 'PT', 'BE', 'NL', 'AT', 'PL', 'SE', 'DK', 'FI', 'IE', 'GR', 'HR', 'CZ', 'SK', 'SI', 'HU', 'RO', 'BG', 'LU', 'MT', 'CY', 'EE', 'LV', 'LT']);

/** Moins de 21 ans : inscrit à part, sans prendre de place. */
export const U21_MAX_AGE = 21;
const isU21 = (p: { age: number | null }) => p.age != null && p.age <= U21_MAX_AGE;

/** Ce qu'on sait d'un joueur pour la liste : lu dans le jeu, sinon déduit de sa nationalité (`estimated`). */
export interface RegStatus {
  eu: boolean | null;
  /** 'club' : formé au club, 'nation' : formé au pays, false : ni l'un ni l'autre, null : inconnu. */
  homeGrown: 'club' | 'nation' | false | null;
  estimated: boolean;
}

/**
 * Statut d'un joueur. Avec le jeu : `estUE` et le texte « formé au pays / au club ». Sans : citoyen de l'UE d'après
 * sa (première) nationalité ; un joueur d'un autre pays que le championnat n'est pas formé localement (il pourrait
 * l'être s'il y a été formé jeune, cas rare).
 */
export function regStatus(p: { id: string; nationality?: string | null }, elig: Map<string, Eligibility>, leagueCountry: string | null): RegStatus {
  const e = elig.get(String(p.id));
  const nat = p.nationality ?? null;
  const codes = (nat ?? '').split(',').map((x) => countryOfNationality(x)).filter((x): x is string => !!x);
  const euGuess = codes.length ? codes.some((c) => EU.has(c)) : null;
  const hgGame = e?.homeGrown == null ? null : e.homeGrown ? (e.club ? 'club' : 'nation') : false;
  const hgGuess = leagueCountry && codes.length && !codes.includes(leagueCountry) ? false : null;
  return {
    eu: e?.eu ?? euGuess,
    homeGrown: hgGame ?? hgGuess,
    estimated: e?.eu == null || e?.homeGrown == null,
  };
}

export interface RegistrationCheck {
  rules: RegistrationRules;
  /** Joueurs de 22 ans et plus (ceux qui prennent une place). */
  seniors: number;
  u21: number;
  /** Formés localement parmi les 22 ans et plus, dont formés au club (null : statut inconnu pour quelqu'un). */
  homeGrown: number | null;
  homeGrownClub: number | null;
  nonEu: number | null;
  /** Places de 22 ans et plus : la liste se réduit quand il manque des formés localement (null : pas de limite). */
  maxSeniors: number | null;
  free: number | null;
  issues: ('full' | 'hgShort' | 'hgClubShort' | 'nonEuOver')[];
}

export function registrationCheck(players: FmPlayer[], statusOf: (p: FmPlayer) => RegStatus, rules: RegistrationRules): RegistrationCheck {
  const seniors = players.filter((p) => !isU21(p));
  const st = seniors.map(statusOf);
  const hgKnown = st.every((s) => s.homeGrown != null);
  const homeGrown = hgKnown ? st.filter((s) => s.homeGrown).length : null;
  const homeGrownClub = hgKnown ? st.filter((s) => s.homeGrown === 'club').length : null;
  const euKnown = st.every((s) => s.eu != null);
  const nonEu = euKnown ? st.filter((s) => s.eu === false).length : null;
  // Liste de N avec H formés localement exigés : au plus N − H joueurs non formés localement.
  const maxSeniors = rules.squadSize == null ? null : rules.hgTotal == null || homeGrown == null ? rules.squadSize : Math.min(rules.squadSize, rules.squadSize - rules.hgTotal + homeGrown);
  const free = maxSeniors == null ? null : maxSeniors - seniors.length;
  const issues: RegistrationCheck['issues'] = [];
  if (free != null && free < 0) issues.push('full');
  if (rules.hgTotal != null && homeGrown != null && homeGrown < rules.hgTotal) issues.push('hgShort');
  if (rules.hgClub != null && homeGrownClub != null && homeGrownClub < rules.hgClub) issues.push('hgClubShort');
  if (rules.nonEuCap != null && nonEu != null && nonEu > rules.nonEuCap) issues.push('nonEuOver');
  return { rules, seniors: seniors.length, u21: players.length - seniors.length, homeGrown, homeGrownClub, nonEu, maxSeniors, free, issues };
}

/** Ce qui bloquerait l'inscription d'une recrue : plus de place pour un 22 ans et plus non formé localement, ou plafond hors UE atteint. */
export function signingBlock(check: RegistrationCheck, s: RegStatus, age: number | null): 'full' | 'nonEu' | null {
  if (age != null && age <= U21_MAX_AGE) return null;
  if (check.rules.nonEuCap != null && s.eu === false && check.nonEu != null && check.nonEu >= check.rules.nonEuCap) return 'nonEu';
  if (check.free != null && check.free <= 0 && !s.homeGrown) return 'full';
  if (check.rules.squadSize != null && check.seniors >= check.rules.squadSize) return 'full';
  return null;
}

/** Ce qu'il faut pour juger la liste : championnat, son pays, nationalités et statuts lus dans le jeu. */
export interface RegistrationContext {
  league: string | null;
  country: string | null;
  rules: RegistrationRules;
  elig: Map<string, Eligibility>;
  nationality: Map<string, string>;
}

export function registrationContext(snap: FmSnapshot): RegistrationContext {
  const custom = ((snap as { custom?: Record<string, Record<string, unknown>> }).custom ?? {}) as Record<string, Record<string, unknown>>;
  const named = custom.equipe?.classementNom;
  // Nom du classement s'il ressemble à un championnat (le jeu y met parfois le nom du club), sinon le calendrier.
  const table = typeof named === 'string' && competitionKind(named) === 'league' ? named.trim() : null;
  const league = table ?? snapshotFixtures(snap).find((f) => competitionKind(f.competition) === 'league')?.competition ?? null;
  const nationality = new Map<string, string>();
  const votes = new Map<string, number>();
  for (const raw of (Array.isArray(snap.players) ? snap.players : []) as { id?: unknown; nationality?: unknown }[]) {
    if (raw?.id == null || typeof raw.nationality !== 'string' || !raw.nationality.trim()) continue;
    nationality.set(String(raw.id), raw.nationality.trim());
    const c = countryOfNationality(raw.nationality);
    if (c) votes.set(c, (votes.get(c) ?? 0) + 1);
  }
  const top = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { league, country: countryOfLeague(league) ?? top, rules: registrationRules(league), elig: eligibilityOf(snap), nationality };
}
