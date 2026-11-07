import { normalizePlayer, toNumber } from './player';
import { officialResults, type MatchResult, type Outcome } from './results';
import { competitionKind } from './rules';
import { leagueFixturesLeft, seasonSegments } from './season';
import { matchStatsFull } from './stats';
import type { FmSnapshot } from './snapshot';

/**
 * Défis communautaires vérifiés : les défis célèbres de FM (De zéro à héros, Invincibles, Pentagone…) contrôlés à partir
 * des instantanés du plugin, sans déclaration du joueur.
 *
 * Deux étages, pour qu'un autre joueur puisse refaire le calcul :
 * 1. `challengeFacts` réduit l'historique aux faits utiles (matchs officiels, saisons, éditeur, rechargements) ;
 * 2. `evaluateChallenge` applique les règles du défi à ces faits seuls.
 * Le certificat partagé contient les faits ; FM Immersion chez l'autre joueur relance l'étage 2 et compare.
 */

export type ChallengeId = 'zero-to-hero' | 'invincibles' | 'u19' | 'locals' | 'pentagon';

export interface ChallengeDef {
  id: ChallengeId;
  /** Le défi se joue depuis une carrière commencée sans club (inscription seulement si le manager est sans club). */
  unemployedStart: boolean;
  /** Paramètre à choisir à l'inscription. */
  param?: 'nationality';
  /** Faux : la règle demande une donnée que le plugin ne lit pas encore (le défi est montré, pas jouable). */
  available: boolean;
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'zero-to-hero', unemployedStart: true, available: true },
  { id: 'invincibles', unemployedStart: false, available: true },
  { id: 'u19', unemployedStart: false, available: true },
  { id: 'locals', unemployedStart: false, param: 'nationality', available: true },
  { id: 'pentagon', unemployedStart: true, available: false },
];

export const challengeDef = (id: string) => CHALLENGES.find((c) => c.id === id) ?? null;

/** Génération U19 : nombre de matchs et de titulaires de moins de 19 ans demandés. */
export const U19_MATCHES = 10;
export const U19_STARTERS = 3;
export const U19_AGE = 19;

/* ---------- Rechargements ---------- */

/** Résultat tel qu'il était connu au moment d'un retour en arrière de la date de jeu. */
export interface KnownResult {
  date: string;
  opponent: string | null;
  outcome: Outcome | null;
  goalsFor: number | null;
  goalsAgainst: number | null;
}

/**
 * Retour en arrière de la date de jeu vu à l'import (sauvegarde rechargée, ou plantage sans sauvegarde) :
 * la partie revient à `to` alors que FM Immersion avait déjà vu `from`. Les résultats déjà connus entre les deux sont
 * gardés pour voir si un match rejoué change d'issue.
 */
export interface Rewind {
  to: string;
  from: string;
  /** Date réelle (ISO) où le retour a été vu. */
  seenAt: string;
  results: KnownResult[];
}

const known = (r: MatchResult): KnownResult => ({
  date: r.date,
  opponent: r.opponent,
  outcome: r.outcome,
  goalsFor: r.matches === 1 ? r.goalsFor : null,
  goalsAgainst: r.matches === 1 ? r.goalsAgainst : null,
});

/** Matchs officiels suivis (un seul match par période) joués après `to` et jusqu'à `from` compris. */
export function resultsBetween(history: Entry[], to: string, from: string): KnownResult[] {
  return officialResults(history)
    .filter((r) => r.matches === 1 && r.outcome && r.since >= to && r.date <= from)
    .map(known);
}

/**
 * Faut-il noter un retour en arrière ? Oui quand la date importée est antérieure à la plus récente déjà vue et que ce
 * jour était déjà dans l'historique (l'import de jours manquants ne compte pas), une seule fois par date atteinte.
 */
export function isRewind(latest: string | null, incoming: string, dayExisted: boolean, rewinds: Rewind[]): boolean {
  return !!latest && incoming < latest && dayExisted && !rewinds.some((r) => r.from === latest);
}

/* ---------- Faits ---------- */

type Entry = { gameDate: string; data: FmSnapshot };

export interface FactPlayer {
  id: string;
  name: string;
  age: number | null;
  /** Nationalités lues dans le jeu (NationalitiesText), null si le plugin ne les lit pas. */
  nat: string | null;
  started: boolean;
  minutes: number;
}

export interface FactMatch {
  date: string;
  since: string;
  /** Matchs joués dans la période (1 = détail exact ; plus = bilan seulement). */
  n: number;
  competition: string | null;
  league: boolean;
  opponent: string | null;
  outcome: Outcome | null;
  w: number;
  d: number;
  l: number;
  gf: number | null;
  ga: number | null;
  players: FactPlayer[];
}

export interface FactSeason {
  club: string;
  /** Nom du championnat (LeagueTableName), null si non lu. */
  league: string | null;
  start: string;
  end: string;
  ended: boolean;
  /** Place au dernier instantané de la saison. */
  position: number | null;
  /** Matchs de championnat restants au premier instantané : la saison est suivie depuis la 1re journée si = total. */
  fixturesAtStart: number | null;
  /**
   * Saison suivie depuis son début : premier instantané d'avant tout match de la saison (cumuls de titularisations à
   * zéro), ou juste après la fin de la saison précédente du même club.
   */
  fromStart: boolean;
}

export interface ChallengeFacts {
  /** Date de jeu de l'inscription au défi et dernier instantané pris en compte. */
  start: string;
  end: string | null;
  /** Manager sans club à l'inscription (lu dans l'état du plugin). */
  unemployedStart: boolean;
  /** Première date où le jeu signale l'usage de l'éditeur en jeu, ou null. */
  editorUsed: string | null;
  /** Le plugin lit-il l'indicateur de l'éditeur ? (sinon on ne peut ni l'affirmer ni l'exclure) */
  editorKnown: boolean;
  clubs: string[];
  matches: FactMatch[];
  seasons: FactSeason[];
  rewinds: Rewind[];
}

const custom = (s: FmSnapshot) => (s as { custom?: Record<string, unknown> }).custom ?? {};
const section = (s: FmSnapshot, k: string) => (custom(s)[k] ?? {}) as Record<string, unknown>;

const boolOf = (v: unknown): boolean | null =>
  typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? (/^(true|oui|yes|1)$/i.test(v.trim()) ? true : /^(false|non|no|0)$/i.test(v.trim()) ? false : null) : null;

const leagueName = (s: FmSnapshot) => {
  const n = section(s, 'equipe').classementNom;
  return typeof n === 'string' && n.trim() ? n.trim() : null;
};
const position = (s: FmSnapshot) => {
  const n = toNumber(section(s, 'equipe').classementPosition as never);
  return n != null && n > 0 && n < 100 ? Math.round(n) : null;
};

/** Nationalités par id de joueur (custom.joueurs[].nationalites). */
function nationalities(s: FmSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  const rows = custom(s).joueurs as Record<string, Record<string, unknown>> | unknown[] | undefined;
  for (const row of Object.values(rows ?? {}) as Record<string, unknown>[]) {
    if (!row || typeof row !== 'object') continue;
    const n = row.nationalites;
    if (row.id != null && typeof n === 'string' && n.trim()) out.set(String(row.id), n.trim());
  }
  return out;
}

/**
 * Réduit l'historique d'une partie aux faits utiles aux défis, à partir de la date d'inscription.
 * `history` : instantanés de la partie (dans n'importe quel ordre).
 */
export function challengeFacts(history: Entry[], opts: { start: string; unemployedStart: boolean; rewinds?: Rewind[] }): ChallengeFacts {
  const sorted = [...history].filter((e) => e.gameDate >= opts.start).sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const byDate = new Map(sorted.map((e) => [e.gameDate, e.data]));

  let editorUsed: string | null = null;
  let editorKnown = false;
  for (const e of sorted) {
    const v = boolOf(section(e.data, 'partie').editeurUtilise);
    if (v != null) editorKnown = true;
    if (v && !editorUsed) editorUsed = e.gameDate;
  }

  const matches: FactMatch[] = officialResults(sorted).map((r) => {
    const snap = byDate.get(r.date);
    const ages = new Map((snap?.players ?? []).map((p) => [String(p.id), normalizePlayer(p).age]));
    const nats = snap ? nationalities(snap) : new Map<string, string>();
    return {
      date: r.date,
      since: r.since,
      n: r.matches,
      competition: r.competition,
      league: competitionKind(r.competition) === 'league',
      opponent: r.opponent,
      outcome: r.outcome,
      w: r.wins,
      d: r.draws,
      l: r.losses,
      gf: r.goalsFor,
      ga: r.goalsAgainst,
      players: r.players.map((p) => ({ id: p.id, name: p.name, age: ages.get(p.id) ?? null, nat: nats.get(p.id) ?? null, started: p.started, minutes: p.minutes })),
    };
  });

  const segs = seasonSegments(sorted);
  const seasons: FactSeason[] = segs.map(({ entries, ended }, i) => {
    const first = entries[0]!.data;
    const prev = segs[i - 1];
    const starts = [...matchStatsFull(first).values()].reduce((a, m) => a + Math.max(0, m.raw.StartingAppearances ?? 0), 0);
    const last = entries[entries.length - 1]!.data;
    return {
      club: last.club,
      league: leagueName(last) ?? leagueName(first),
      start: entries[0]!.gameDate,
      end: entries[entries.length - 1]!.gameDate,
      ended,
      position: position(last),
      fixturesAtStart: leagueFixturesLeft(first),
      fromStart: Math.round(starts / 11) === 0 || (!!prev?.ended && prev.entries[0]!.data.club === first.club),
    };
  });

  return {
    start: opts.start,
    end: sorted.at(-1)?.gameDate ?? null,
    unemployedStart: opts.unemployedStart,
    editorUsed,
    editorKnown,
    clubs: [...new Set(sorted.map((e) => e.data.club))],
    matches,
    seasons,
    rewinds: opts.rewinds ?? [],
  };
}

/* ---------- Règles ---------- */

export type ChallengeStatus = 'running' | 'success' | 'failed' | 'unproven' | 'unavailable';

export type ChallengeIssue =
  | { kind: 'editor'; date: string }
  | { kind: 'editorUnknown' }
  | { kind: 'replayed'; date: string; opponent: string | null; before: string; after: string }
  | { kind: 'rewind'; to: string; from: string }
  | { kind: 'notUnemployed' }
  | { kind: 'untracked'; season: string; tracked: number; expected: number }
  | { kind: 'unknownLoss'; date: string; matches: number }
  | { kind: 'nationalityUnknown'; count: number };

/** Une étape du défi, à traduire dans l'interface (`challenges.step.<key>`). */
export interface ChallengeStep {
  key: string;
  done: boolean;
  value?: number | string | null;
  target?: number;
  detail?: string | null;
}

export interface ChallengeResult {
  id: ChallengeId;
  status: ChallengeStatus;
  steps: ChallengeStep[];
  issues: ChallengeIssue[];
  /** Fait marquant à mettre en avant (titre gagné, saison invaincue…). */
  headline: string | null;
}

/**
 * Premières divisions des pays les plus joués, d'après le nom du championnat dans le jeu (FR et EN, avec ou sans
 * sponsor). Un titre ailleurs est montré avec son nom : la communauté juge sur pièce.
 */
const TOP_FLIGHTS = [
  /^ligue 1\b/,
  /^premier league$|^english premier|^premier league \(eng|^barclays/,
  /^la ?liga\b(?! 2| hypermotion| smartbank)|^laliga ea|^primera division$/,
  /^serie a\b/,
  /^bundesliga\b(?! 2)/,
  /^eredivisie\b/,
  /^liga portugal\b(?! 2)|^primeira liga\b|^liga portugal betclic/,
  /^(jupiler|pro) league\b|^belgian pro league|^first division a\b/,
  /^scottish premiership|^premiership\b|^william hill premiership/,
  /^super lig\b|^trendyol super lig/,
  /^superliga\b|^(3f )?superliga/,
  /^eliteserien\b|^allsvenskan\b|^veikkausliiga\b/,
  /^(ekstraklasa|pko bp ekstraklasa)\b/,
  /^(fortuna|chance)? ?liga$|^nike liga\b|^niké liga\b|^slovak first|^1\. hnl\b|^supersport hnl/,
  /^super league\b|^raiffeisen super league|^credit suisse super league|^stoiximan super league/,
  /^(austrian )?bundesliga \(aut|^admiral bundesliga/,
  /^mls$|^major league soccer/,
  /^brasileirao|^serie a \(bra|^campeonato brasileiro serie a/,
  /^liga profesional|^primera division \(arg|^torneo/,
  /^liga mx\b/,
  /^j1 league|^meiji yasuda j1/,
  /^k league 1\b/,
  /^saudi pro league|^roshn saudi league/,
  /^a-league\b|^isuzu ute a-league/,
];

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function isTopFlight(league: string | null | undefined): boolean {
  if (!league) return false;
  const n = fold(league);
  return TOP_FLIGHTS.some((r) => r.test(n));
}

/** Le joueur a-t-il la nationalité voulue (parmi toutes les siennes) ? null si inconnue. */
export function hasNationality(nat: string | null, wanted: string): boolean | null {
  if (!nat) return null;
  const w = fold(wanted);
  return fold(nat)
    .split(/[,/()|;]+/)
    .map((x) => x.trim())
    .some((x) => x === w || x.startsWith(w));
}

/** Matchs rejoués avec une autre issue après un retour en arrière (même ordre, même adversaire). */
function replayed(f: ChallengeFacts): ChallengeIssue[] {
  const out: ChallengeIssue[] = [];
  const score = (r: { outcome: Outcome | null; gf: number | null; ga: number | null }) => (r.gf != null && r.ga != null ? `${r.gf}-${r.ga}` : (r.outcome ?? '?'));
  for (const rw of f.rewinds) {
    const now = f.matches.filter((m) => m.n === 1 && m.outcome && m.since >= rw.to);
    let i = 0;
    for (const old of rw.results) {
      const cur = now[i];
      if (!cur) break;
      if (old.opponent && cur.opponent && old.opponent !== cur.opponent) break;
      i++;
      const a = score({ outcome: old.outcome, gf: old.goalsFor, ga: old.goalsAgainst });
      const b = score(cur);
      const differs = old.goalsFor != null && cur.gf != null ? a !== b : old.outcome !== cur.outcome;
      if (differs) out.push({ kind: 'replayed', date: cur.date, opponent: cur.opponent, before: a, after: b });
    }
  }
  return out;
}

/** Contrôles communs à tous les défis : éditeur, matchs rejoués, rechargements. */
function integrity(f: ChallengeFacts): { fatal: ChallengeIssue[]; notes: ChallengeIssue[] } {
  const fatal: ChallengeIssue[] = [];
  const notes: ChallengeIssue[] = [];
  if (f.editorUsed) fatal.push({ kind: 'editor', date: f.editorUsed });
  else if (!f.editorKnown && f.end) notes.push({ kind: 'editorUnknown' });
  fatal.push(...replayed(f));
  for (const r of f.rewinds) notes.push({ kind: 'rewind', to: r.to, from: r.from });
  return { fatal, notes };
}

const inSeason = (m: FactMatch, s: FactSeason) => m.date > s.start && m.date <= s.end;

/** Matchs de championnat de la saison, et la saison est-elle suivie depuis la 1re journée ? */
function leagueCoverage(f: ChallengeFacts, s: FactSeason) {
  const ms = f.matches.filter((m) => inSeason(m, s));
  const league = ms.filter((m) => m.league).reduce((a, m) => a + m.n, 0);
  // Période de plusieurs matchs : compétition inconnue, comptée comme possible match de championnat.
  const merged = ms.filter((m) => m.n > 1).reduce((a, m) => a + m.n, 0);
  const expected = s.fixturesAtStart;
  const complete = s.fromStart && expected != null && expected > 0 && league + merged >= expected;
  return { ms, league, merged, expected, complete };
}

/** Saison complète (suivie de la 1re à la dernière journée, terminée) pour les défis d'une saison. */
const fullSeasons = (f: ChallengeFacts) => f.seasons.filter((s) => s.ended && leagueCoverage(f, s).complete);

const label = (s: FactSeason) => `${s.club} ${s.start.slice(0, 4)}/${s.end.slice(2, 4)}`;

function zeroToHero(f: ChallengeFacts): ChallengeResult {
  const issues: ChallengeIssue[] = [];
  if (!f.unemployedStart) issues.push({ kind: 'notUnemployed' });
  const titles = f.seasons.filter((s) => s.ended && s.position === 1);
  const top = titles.find((s) => isTopFlight(s.league));
  const steps: ChallengeStep[] = [
    { key: 'unemployed', done: f.unemployedStart },
    { key: 'firstClub', done: f.clubs.length > 0, value: f.clubs[0] ?? null },
    { key: 'titles', done: titles.length > 0, value: titles.length, detail: titles.map((s) => `${s.league ?? '?'} (${label(s)})`).join(', ') || null },
    { key: 'topTitle', done: !!top, detail: top ? `${top.league} (${label(top)})` : null },
  ];
  return {
    id: 'zero-to-hero',
    status: !f.unemployedStart ? 'failed' : top ? 'success' : 'running',
    steps,
    issues,
    headline: top ? `${top.league} — ${top.club}` : null,
  };
}

function invincibles(f: ChallengeFacts): ChallengeResult {
  const issues: ChallengeIssue[] = [];
  let best: { season: FactSeason; played: number } | null = null;
  let failedSeason = false;
  let running: { played: number; losses: number } | null = null;
  for (const s of f.seasons) {
    const cov = leagueCoverage(f, s);
    const losses = cov.ms.filter((m) => m.league).reduce((a, m) => a + m.l, 0);
    const mergedLosses = cov.ms.filter((m) => m.n > 1 && m.l > 0);
    if (!s.ended) {
      running = { played: cov.league + cov.merged, losses: losses + mergedLosses.reduce((a, m) => a + m.l, 0) };
      continue;
    }
    if (!cov.complete) {
      issues.push({ kind: 'untracked', season: label(s), tracked: cov.league + cov.merged, expected: cov.expected ?? 0 });
      continue;
    }
    // Défaite dans une période regroupée : peut-être en coupe, on ne sait pas. La saison n'est pas prouvée.
    if (!losses && mergedLosses.length) {
      for (const m of mergedLosses) issues.push({ kind: 'unknownLoss', date: m.date, matches: m.n });
      continue;
    }
    if (losses) failedSeason = true;
    else if (!best) best = { season: s, played: cov.league };
  }
  const steps: ChallengeStep[] = [
    { key: 'seasonUnbeaten', done: !!best, detail: best ? label(best.season) : null },
    ...(running ? [{ key: 'currentSeason', done: false, value: running.losses, target: 0, detail: String(running.played) }] : []),
  ];
  // Une saison perdue n'élimine pas : le défi continue à la saison suivante.
  const status: ChallengeStatus = best ? 'success' : running || failedSeason ? 'running' : issues.length ? 'unproven' : 'running';
  return { id: 'invincibles', status, steps, issues, headline: best ? `${best.season.league ?? best.season.club} — ${label(best.season)}` : null };
}

function u19(f: ChallengeFacts): ChallengeResult {
  const qualifying = f.matches.filter((m) => m.n === 1 && m.players.filter((p) => p.started && p.age != null && p.age < U19_AGE).length >= U19_STARTERS);
  const done = qualifying.length >= U19_MATCHES;
  return {
    id: 'u19',
    status: done ? 'success' : 'running',
    steps: [{ key: 'u19Matches', done, value: Math.min(qualifying.length, U19_MATCHES), target: U19_MATCHES, detail: qualifying.at(-1)?.date ?? null }],
    issues: [],
    headline: done ? qualifying[U19_MATCHES - 1]!.date : null,
  };
}

function locals(f: ChallengeFacts, nationality: string): ChallengeResult {
  const issues: ChallengeIssue[] = [];
  const seasons = fullSeasons(f);
  const first = seasons[0];
  const current = f.seasons.find((s) => !s.ended);
  const check = (s: FactSeason) => {
    const used = new Map<string, FactPlayer>();
    for (const m of f.matches.filter((x) => inSeason(x, s))) for (const p of m.players) if (p.minutes > 0) used.set(p.id, p);
    const foreign = [...used.values()].filter((p) => hasNationality(p.nat, nationality) === false);
    const unknown = [...used.values()].filter((p) => hasNationality(p.nat, nationality) == null);
    return { used: used.size, foreign, unknown };
  };
  for (const s of f.seasons.filter((x) => x.ended && !leagueCoverage(f, x).complete)) {
    const cov = leagueCoverage(f, s);
    issues.push({ kind: 'untracked', season: label(s), tracked: cov.league + cov.merged, expected: cov.expected ?? 0 });
  }
  const target = first ?? current;
  if (!target) return { id: 'locals', status: issues.length ? 'unproven' : 'running', steps: [{ key: 'localsSeason', done: false, value: nationality }], issues, headline: null };
  const c = check(target);
  if (c.unknown.length) issues.push({ kind: 'nationalityUnknown', count: c.unknown.length });
  const steps: ChallengeStep[] = [
    { key: 'localsSeason', done: !!first && !c.foreign.length && !c.unknown.length, value: nationality, detail: label(target) },
    { key: c.foreign.length ? 'localsForeign' : 'localsUsed', done: !c.foreign.length, value: c.used, detail: c.foreign.map((p) => `${p.name} (${p.nat})`).join(', ') || null },
  ];
  const status: ChallengeStatus = c.foreign.length ? 'failed' : c.unknown.length ? 'unproven' : first ? 'success' : 'running';
  return { id: 'locals', status, steps, issues, headline: status === 'success' ? `${nationality} — ${label(target)}` : null };
}

/** Applique les règles du défi aux faits. Les contrôles d'intégrité passent avant le résultat. */
export function evaluateChallenge(id: ChallengeId, f: ChallengeFacts, params: { nationality?: string } = {}): ChallengeResult {
  const def = challengeDef(id);
  if (!def?.available)
    return { id, status: 'unavailable', steps: [{ key: 'unemployed', done: f.unemployedStart }, { key: 'pentagonSoon', done: false }], issues: [], headline: null };
  const base =
    id === 'zero-to-hero'
      ? zeroToHero(f)
      : id === 'invincibles'
        ? invincibles(f)
        : id === 'u19'
          ? u19(f)
          : locals(f, params.nationality ?? '');
  const { fatal, notes } = integrity(f);
  return {
    ...base,
    id,
    status: fatal.length ? 'failed' : base.status,
    issues: [...fatal, ...base.issues, ...notes],
  };
}

/* ---------- Certificat ---------- */

export const CERTIFICATE_FORMAT = 'fm-immersion-defi/1';

export interface ChallengeCertificate {
  format: typeof CERTIFICATE_FORMAT;
  challenge: ChallengeId;
  params: { nationality?: string };
  /** Pseudo choisi par le joueur (rien d'autre sur lui). */
  coach: string;
  appVersion: string;
  /** Date réelle de création (ISO). */
  createdAt: string;
  status: ChallengeStatus;
  facts: ChallengeFacts;
  /** SHA-256 (hex) du contenu canonique ci-dessus : identifie le certificat, montré sur Discord. */
  digest: string;
}

/** JSON à clés triées : même texte, donc même empreinte, sur tous les PC. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v ?? null);
}

async function sha256(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const digestOf = (c: Omit<ChallengeCertificate, 'digest'>) => sha256(canonicalJson(c));

/** Empreinte courte montrée sur Discord et dans l'appli, pour reconnaître le bon fichier. */
export const shortDigest = (digest: string) => digest.slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');

export async function buildCertificate(input: Omit<ChallengeCertificate, 'format' | 'digest' | 'status'>): Promise<ChallengeCertificate> {
  const status = evaluateChallenge(input.challenge, input.facts, input.params).status;
  const body = { format: CERTIFICATE_FORMAT, ...input, status } as const;
  return { ...body, digest: await digestOf(body) };
}

export type CertificateProblem = 'format' | 'digest' | 'status' | 'dates' | 'scores' | 'counts' | 'ages';

export interface CertificateCheck {
  ok: boolean;
  problems: CertificateProblem[];
  /** Résultat recalculé ici, à partir des faits du fichier. */
  result: ChallengeResult | null;
}

/**
 * Vérifie un certificat reçu d'un autre joueur : empreinte intacte, faits cohérents entre eux (dates croissantes,
 * score d'accord avec l'issue, âges qui ne rajeunissent pas), et même résultat quand on rejoue les règles ici.
 */
export async function verifyCertificate(raw: unknown): Promise<CertificateCheck> {
  const c = raw as ChallengeCertificate;
  if (!c || typeof c !== 'object' || c.format !== CERTIFICATE_FORMAT || !c.facts || !Array.isArray(c.facts.matches) || !challengeDef(String(c.challenge)))
    return { ok: false, problems: ['format'], result: null };
  const problems: CertificateProblem[] = [];
  const { digest, ...body } = c;
  if ((await digestOf(body)) !== digest) problems.push('digest');

  const ms = c.facts.matches;
  if (ms.some((m, i) => m.since > m.date || (i > 0 && m.since < ms[i - 1]!.date) || m.date < c.facts.start)) problems.push('dates');
  if (
    ms.some(
      (m) =>
        m.n === 1 &&
        m.gf != null &&
        m.ga != null &&
        m.outcome != null &&
        m.outcome !== (m.gf > m.ga ? 'W' : m.gf < m.ga ? 'L' : 'D'),
    )
  )
    problems.push('scores');
  if (ms.some((m) => m.w + m.d + m.l > m.n || m.w < 0 || m.d < 0 || m.l < 0 || (m.n === 1 && m.players.filter((p) => p.started).length > 11))) problems.push('counts');
  const lastAge = new Map<string, number>();
  for (const m of ms)
    for (const p of m.players) {
      if (p.age == null) continue;
      if ((lastAge.get(p.id) ?? 0) > p.age) problems.push('ages');
      lastAge.set(p.id, p.age);
    }

  const result = evaluateChallenge(c.challenge, c.facts, c.params ?? {});
  if (result.status !== c.status) problems.push('status');
  return { ok: !problems.length, problems: [...new Set(problems)], result };
}
