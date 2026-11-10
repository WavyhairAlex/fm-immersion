import type { ChallengeFacts, ChallengeIssue, ChallengeParams, ChallengeResult, ChallengeStep, FactMatch, FactSeason } from './challenges';
import { inSeason, isTopFlight, leagueCoverage } from './challenges';
import { COUNTRIES, countryOfLeague } from './countries';
import { competitionKind } from './rules';

/**
 * Glory Hunter, version FM27 (défi de la communauté) : gagner les 15 grands trophées avant la fin de l'horloge.
 * - Trophées : championnat et coupe nationale d'Angleterre, d'Espagne, d'Allemagne, de France et d'Italie, Ligue des
 *   champions, Ligue Europa, Ligue Conférence, Euro et Coupe du monde.
 * - Horloge : 15 saisons, plus une saison par bonus (10 au plus), moins une par malus (5 au plus).
 * - Jokers, déclarés avant le premier match de championnat de la saison : deux « quitte ou double » (le bonus visé vaut
 *   deux saisons s'il est réussi cette saison-là, sinon il est perdu pour toujours) et une « préparation » (saison sans
 *   risque : ni malus, ni bonus, ni trophée ne comptent).
 *
 * Tout est déduit des faits du certificat (matchs officiels, saisons, départs). Une coupe gagnée est déduite du dernier
 * tour gagné en fin de saison (le jeu ne dit pas « vainqueur »). Les sélections nationales (Euro, Coupe du monde), le
 * Ballon d'or et le classement des buteurs européens ne sont pas lus : ces lignes restent « pas encore lisibles ».
 */

export const GH_BASE_SEASONS = 15;
export const GH_MAX_BONUS = 10;
export const GH_MAX_MALUS = 5;
export const GH_DOUBLES = 2;
export const GH_PRESEASONS = 1;

/** Les cinq pays du défi (codes de `countries.ts`) et le suffixe de leurs trophées. */
const FIVE = { 'GB-ENG': 'Eng', ES: 'Esp', DE: 'Ger', FR: 'Fra', IT: 'Ita' } as const;
type Five = keyof typeof FIVE;

export const GH_TROPHIES = [
  'leagueEng',
  'cupEng',
  'leagueEsp',
  'cupEsp',
  'leagueGer',
  'cupGer',
  'leagueFra',
  'cupFra',
  'leagueIta',
  'cupIta',
  'ucl',
  'uel',
  'uecl',
  'euro',
  'worldCup',
] as const;
export type GhTrophy = (typeof GH_TROPHIES)[number];
/** Trophées de sélection : le plugin ne suit que le club. */
export const GH_UNREADABLE_TROPHIES: GhTrophy[] = ['euro', 'worldCup'];

export const GH_BONUSES = ['treble', 'invincibles', 'hundred', 'ballonDor', 'streak15', 'backToBack', 'uclWin', 'fiveGoals', 'sharpshooter', 'gapYear'] as const;
export type GhBonus = (typeof GH_BONUSES)[number];
export const GH_UNREADABLE_BONUSES: GhBonus[] = ['ballonDor', 'sharpshooter'];

export const GH_MALUSES = ['sacked', 'uclFinalLost', 'fiveLosses', 'drought', 'humiliation'] as const;
export type GhMalus = (typeof GH_MALUSES)[number];

/** Joker déclaré : vaut pour la première saison dont aucun match de championnat n'était joué à `declaredAt`. */
export interface GhJoker {
  kind: 'double' | 'preseason';
  bonus?: GhBonus;
  /** Date de jeu au moment de la déclaration (ISO). */
  declaredAt: string;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Coupe nationale principale de chaque pays (l'équivalent de la FA Cup, pas la coupe de la Ligue). */
const MAIN_CUP: Record<Five, RegExp> = {
  'GB-ENG': /\bfa cup\b|coupe d'angleterre/,
  ES: /copa del rey|coupe du roi/,
  DE: /dfb[- ]?pokal|coupe d'allemagne/,
  FR: /^coupe de france/,
  IT: /coppa italia|coupe d'italie/,
};
const NOT_UEFA = /afc|caf\b|concacaf|asie|asia|afri|feminin|women|jeunes|youth|u19|u-19/;
/** Coupe d'Europe d'après son nom (FR / EN). La Conférence d'abord : « Ligue Europa Conférence ». */
export function europeanCup(name: string | null | undefined): 'ucl' | 'uel' | 'uecl' | null {
  const n = fold(name ?? '');
  if (!n || NOT_UEFA.test(n) || /super ?coupe|super ?cup/.test(n)) return null;
  if (/conference/.test(n)) return 'uecl';
  if (/europa/.test(n)) return 'uel';
  if (/champions/.test(n)) return 'ucl';
  return null;
}

const US = COUNTRIES.findIndex((c) => c.code === 'US');
/** Pays d'Europe : ceux listés avant les Amériques dans `countries.ts`. */
const EUROPE = new Set(COUNTRIES.slice(0, US < 0 ? COUNTRIES.length : US).map((c) => c.code));

const DAY_MS = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);

interface Tie {
  date: string;
  gf: number;
  ga: number;
  legs: number;
}

/** Bilan des coupes d'une saison : gagnées, finale perdue (match sec perdu en fin de saison), finale nulle. */
function cupsOf(f: ChallengeFacts, s: FactSeason) {
  const byComp = new Map<string, FactMatch[]>();
  for (const m of f.matches) {
    if (!inSeason(m, s) || m.n !== 1 || m.gf == null || m.ga == null || !m.competition || m.league) continue;
    const k = competitionKind(m.competition);
    if (k !== 'cup' && k !== 'europe') continue;
    byComp.set(m.competition, [...(byComp.get(m.competition) ?? []), m]);
  }
  const won: string[] = [];
  const lostFinal: string[] = [];
  const drawnFinal: string[] = [];
  for (const [comp, ms] of byComp) {
    const ties: (Tie & { opponent: string | null })[] = [];
    for (const m of ms) {
      const prev = ties.at(-1);
      if (prev && prev.legs === 1 && m.opponent && prev.opponent === m.opponent && days(prev.date, m.date) <= 21) {
        prev.gf += m.gf!;
        prev.ga += m.ga!;
        prev.legs = 2;
        prev.date = m.date;
      } else ties.push({ opponent: m.opponent, date: m.date, gf: m.gf!, ga: m.ga!, legs: 1 });
    }
    const last = ties.at(-1)!;
    if (!s.ended) continue;
    const late = days(last.date, s.end) <= 21;
    // Un seul match gagné : super coupe (ou finale seule suivie).
    if (last.gf > last.ga && (late || ms.length === 1)) won.push(comp);
    else if (late && last.legs === 1 && ties.length > 1 && last.gf < last.ga) lostFinal.push(comp);
    else if (late && last.legs === 1 && ties.length > 1 && last.gf === last.ga) drawnFinal.push(comp);
  }
  return { won, lostFinal, drawnFinal };
}

/** Une saison du défi : les passages (clubs) d'une même année de football. */
interface GhSeason {
  key: number;
  label: string;
  parts: FactSeason[];
  firstLeague: string | null;
  ended: boolean;
}

/** Année de la saison : celle de son premier match de championnat (août 2027 et janvier 2028 : 2027/28). */
const yearOf = (date: string) => {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 7 ? y : y - 1;
};

function seasonsOf(f: ChallengeFacts): GhSeason[] {
  const out: GhSeason[] = [];
  for (const s of f.seasons) {
    const first = f.matches.find((m) => m.league && inSeason(m, s))?.date ?? null;
    const key = yearOf(first ?? s.end);
    const cur = out.find((x) => x.key === key);
    if (cur) {
      cur.parts.push(s);
      cur.firstLeague = cur.firstLeague ?? first;
      cur.ended = s.ended;
    } else out.push({ key, label: `${key}/${String((key + 1) % 100).padStart(2, '0')}`, parts: [s], firstLeague: first, ended: s.ended });
  }
  return out.sort((a, b) => a.key - b.key);
}

const countryOf = (league: string | null) => (league ? countryOfLeague(league) : null);
const isFive = (c: string | null): c is Five => !!c && c in FIVE;

/** Ce qui s'est passé dans une saison : trophées du défi, bonus et malus réalisés. */
function seasonEvents(f: ChallengeFacts, g: GhSeason, prev: GhSeason | null) {
  const trophies = new Set<GhTrophy>();
  const bonuses = new Set<GhBonus>();
  const maluses = new Set<GhMalus>();
  const penalties: string[] = [];
  let anyTrophy = false;

  const titles = g.parts.filter((s) => s.ended && s.position === 1);
  if (titles.length) anyTrophy = true;
  const topTitles = titles.filter((s) => isTopFlight(s.league));
  for (const s of topTitles) {
    const c = countryOf(s.league);
    if (isFive(c)) trophies.add(`league${FIVE[c]}` as GhTrophy);
    else if (c && EUROPE.has(c)) bonuses.add('gapYear');
  }

  let uclWon = false;
  let domesticCup = false;
  for (const s of g.parts) {
    const cups = cupsOf(f, s);
    const c = countryOf(s.league);
    if (cups.won.length) anyTrophy = true;
    for (const comp of cups.won) {
      const eu = europeanCup(comp);
      if (eu) {
        trophies.add(eu);
        if (eu === 'ucl') uclWon = true;
      }
      const n = fold(comp);
      if (isFive(c) && MAIN_CUP[c].test(n)) {
        trophies.add(`cup${FIVE[c]}` as GhTrophy);
        domesticCup = true;
      } else if (!isFive(c) && competitionKind(comp) === 'cup' && f.matches.filter((m) => m.competition === comp && inSeason(m, s)).length > 1) domesticCup = true;
    }
    if (cups.lostFinal.some((x) => europeanCup(x) === 'ucl')) maluses.add('uclFinalLost');
    penalties.push(...cups.drawnFinal);

    // Saison de championnat suivie de bout en bout : invincibles, 100 points.
    const cov = leagueCoverage(f, s);
    if (s.ended && cov.complete) {
      const ms = cov.ms.filter((m) => m.league || m.n > 1);
      if (ms.every((m) => m.l === 0)) bonuses.add('invincibles');
      if (ms.reduce((a, m) => a + 3 * m.w + m.d, 0) >= 100) bonuses.add('hundred');
    }
  }
  if (uclWon) bonuses.add('uclWin');
  if (uclWon && domesticCup && titles.length) bonuses.add('treble');

  // Titres de suite dans deux pays différents.
  const prevCountries = new Set((prev?.parts ?? []).filter((s) => s.ended && s.position === 1 && isTopFlight(s.league)).map((s) => countryOf(s.league)).filter(Boolean));
  if (prev && prev.key === g.key - 1 && topTitles.some((s) => { const c = countryOf(s.league); return !!c && prevCountries.size > 0 && !prevCountries.has(c); }))
    bonuses.add('backToBack');

  const inG = (date: string) => g.parts.some((s) => inSeason({ date }, s));
  for (const m of f.matches) {
    if (!inG(m.date) || m.n !== 1) continue;
    if (m.gf != null && m.ga != null && m.ga - m.gf >= 5) maluses.add('humiliation');
    if (m.league && m.players.some((p) => (p.goals ?? 0) >= 5)) bonuses.add('fiveGoals');
  }
  // Limogeage : départ deviné « limogé » pendant la saison (ou juste après sa fin).
  if ((f.exits ?? []).some((x) => x.sacked && g.parts.some((s) => x.date >= s.start && x.date <= s.end))) maluses.add('sacked');

  return { trophies, bonuses, maluses, penalties, anyTrophy };
}

/**
 * Séries sur tous les matchs officiels, dans l'ordre : dates où 15 victoires de suite (ou 5 défaites de suite) sont
 * atteintes. Une période de plusieurs matchs regroupés compte si tous ont la même issue, sinon elle coupe la série.
 */
function streakDates(f: ChallengeFacts, target: number, outcome: 'W' | 'L'): string[] {
  const out: string[] = [];
  let n = 0;
  for (const m of f.matches) {
    const same = m.n === 1 ? m.outcome === outcome : (outcome === 'W' ? m.w : m.l) === m.n;
    n = same ? n + m.n : 0;
    if (n >= target) {
      out.push(m.date);
      n = 0;
    }
  }
  return out;
}

export interface GloryHunterState {
  seasons: { label: string; ended: boolean; preseason: boolean; double: GhBonus | null }[];
  /** Saisons finies (comptées sur l'horloge) et saisons accordées. */
  used: number;
  allowed: number;
  bonus: number;
  malus: number;
  trophies: { id: GhTrophy; season: string }[];
  bonuses: { id: GhBonus; season: string; value: number }[];
  maluses: { id: GhMalus; season: string }[];
  /** Bonus perdus pour toujours (quitte ou double raté). */
  frozen: GhBonus[];
  doublesLeft: number;
  preseasonsLeft: number;
  /** Jokers déclarés dont la saison n'a pas encore commencé. */
  pending: GhJoker[];
  timeUp: boolean;
  penalties: { competition: string; season: string }[];
  ignored: GhBonus[];
}

export function gloryHunterState(f: ChallengeFacts, params: ChallengeParams = {}): GloryHunterState {
  const seasons = seasonsOf(f);
  const jokers = [...(params.jokers ?? [])].sort((a, b) => a.declaredAt.localeCompare(b.declaredAt));
  const doubles = jokers.filter((j) => j.kind === 'double' && j.bonus).slice(0, GH_DOUBLES);
  const preseasons = jokers.filter((j) => j.kind === 'preseason').slice(0, GH_PRESEASONS);
  // Saison visée par un joker : la première dont le premier match de championnat est après la déclaration.
  const target = (j: GhJoker) => seasons.find((g) => !g.firstLeague || g.firstLeague > j.declaredAt) ?? null;

  const keyOf = (date: string) => seasons.find((g) => g.parts.some((s) => inSeason({ date }, s)))?.key ?? null;
  const winKeys = new Set(streakDates(f, 15, 'W').map(keyOf));
  const lossKeys = new Set(streakDates(f, 5, 'L').map(keyOf));

  const state: GloryHunterState = {
    seasons: [],
    used: 0,
    allowed: GH_BASE_SEASONS,
    bonus: 0,
    malus: 0,
    trophies: [],
    bonuses: [],
    maluses: [],
    frozen: [],
    doublesLeft: GH_DOUBLES - doubles.length,
    preseasonsLeft: GH_PRESEASONS - preseasons.length,
    pending: jokers.filter((j) => !target(j) || !target(j)!.firstLeague),
    timeUp: false,
    penalties: [],
    ignored: [],
  };
  const clock = () => GH_BASE_SEASONS + Math.min(GH_MAX_BONUS, state.bonus) - Math.min(GH_MAX_MALUS, state.malus);
  let drought = 0;
  let prev: GhSeason | null = null;

  for (const g of seasons) {
    if (state.used >= state.allowed) {
      state.timeUp = true;
      break;
    }
    const preseason = preseasons.some((j) => target(j) === g);
    const double = doubles.find((j) => target(j) === g)?.bonus ?? null;
    state.seasons.push({ label: g.label, ended: g.ended, preseason, double });
    const ev = seasonEvents(f, g, prev);
    if (winKeys.has(g.key)) ev.bonuses.add('streak15');
    if (lossKeys.has(g.key)) ev.maluses.add('fiveLosses');
    state.penalties.push(...ev.penalties.map((competition) => ({ competition, season: g.label })));

    if (!preseason) {
      for (const id of GH_TROPHIES) if (ev.trophies.has(id) && !state.trophies.some((t) => t.id === id)) state.trophies.push({ id, season: g.label });
      const has = (b: GhBonus) => state.bonuses.some((x) => x.id === b);
      if (double && (has(double) || state.frozen.includes(double))) state.ignored.push(double);
      for (const id of GH_BONUSES) {
        if (!ev.bonuses.has(id) || has(id) || state.frozen.includes(id)) continue;
        const value = double === id && !state.ignored.includes(id) ? 2 : 1;
        state.bonuses.push({ id, season: g.label, value });
        state.bonus += value;
      }
      // Quitte ou double raté : le bonus visé est perdu pour toujours une fois la saison finie.
      if (double && g.ended && !has(double) && !state.frozen.includes(double)) state.frozen.push(double);

      if (g.ended) {
        drought = ev.anyTrophy ? 0 : drought + 1;
        if (drought >= 3) {
          ev.maluses.add('drought');
          drought = 0;
        }
      }
      for (const id of GH_MALUSES)
        if (ev.maluses.has(id) && !state.maluses.some((x) => x.id === id)) {
          state.maluses.push({ id, season: g.label });
          state.malus += 1;
        }
    }
    if (g.ended) state.used += 1;
    state.allowed = clock();
    prev = g;
  }
  if (state.used >= state.allowed) state.timeUp = true;
  return state;
}

const READABLE = GH_TROPHIES.filter((t) => !GH_UNREADABLE_TROPHIES.includes(t));

export function gloryHunter(f: ChallengeFacts, params: ChallengeParams = {}): ChallengeResult {
  const s = gloryHunterState(f, params);
  const won = new Set(s.trophies.map((t) => t.id));
  const missing = READABLE.filter((t) => !won.has(t));
  const issues: ChallengeIssue[] = [
    ...s.penalties.map((p) => ({ kind: 'ghPenalties' as const, competition: p.competition, season: p.season })),
    ...[...new Set(s.ignored)].map((bonus) => ({ kind: 'ghJokerIgnored' as const, bonus })),
  ];
  const steps: ChallengeStep[] = [
    { key: 'ghClock', done: !s.timeUp, value: s.used, target: s.allowed },
    { key: 'ghTrophies', done: !missing.length, value: s.trophies.length, target: GH_TROPHIES.length, items: s.trophies.map((t) => ({ key: `trophy.${t.id}`, detail: t.season })) },
    { key: 'ghMissing', done: !missing.length, items: missing.map((t) => ({ key: `trophy.${t}` })) },
    { key: 'ghBonus', done: s.bonus >= GH_MAX_BONUS, value: Math.min(GH_MAX_BONUS, s.bonus), target: GH_MAX_BONUS, items: s.bonuses.map((b) => ({ key: `bonus.${b.id}`, detail: b.value > 1 ? `${b.season}, ×2` : b.season })) },
    { key: 'ghMalus', done: s.malus === 0, value: Math.min(GH_MAX_MALUS, s.malus), target: GH_MAX_MALUS, items: s.maluses.map((m) => ({ key: `malus.${m.id}`, detail: m.season })) },
    {
      key: 'ghJokers',
      done: true,
      value: s.doublesLeft,
      target: s.preseasonsLeft,
      items: [
        ...s.seasons.filter((x) => x.double).map((x) => ({ key: `bonus.${x.double}`, detail: `${x.label}, ×2` })),
        ...s.seasons.filter((x) => x.preseason).map((x) => ({ key: 'joker.preseason', detail: x.label })),
        ...s.frozen.map((b) => ({ key: `frozen.${b}` })),
      ],
    },
    { key: 'ghUnreadable', done: false },
  ];
  // Les 13 trophées lisibles gagnés : prouvé sauf l'Euro et la Coupe du monde (sélections non suivies).
  const status = !missing.length ? 'unproven' : s.timeUp ? 'failed' : 'running';
  return { id: 'glory-hunter', status, steps, issues, headline: `${s.trophies.length}/${GH_TROPHIES.length}` };
}
