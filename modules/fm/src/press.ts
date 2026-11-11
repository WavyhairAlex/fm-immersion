import { monthsBetween } from './alerts';
import { bigMatchNow, type BigMatch } from './bigmatch';
import { breakingNews, isCoachBreaking } from './breaking';
import { moraleLevel } from './club';
import { snapshotFixtures } from './fixtures';
import { normalizePlayer, type FmPlayer } from './player';
import { recordNews } from './records';
import { matchResults, type MatchResult } from './results';
import { competitionKind, isCongested } from './rules';
import { leagueFixturesLeft } from './season';
import type { GazetteStory } from './gazette';
import type { FmSnapshot } from './snapshot';

/**
 * Conférences de presse : avant un gros match (affiche du choc, `bigMatchNow`) et après chaque match officiel, la
 * presse pose au coach trois questions tirées des faits déjà calculés : le match, mais aussi la vie du club (recrue,
 * départ, longue blessure, contrat qui finit, joueur au moral en berne, jeune qui débute, ancien club en face,
 * calendrier chargé, course au titre, direction ou supporters inquiets, rumeur qui envoie le coach ailleurs). Chaque
 * question vient d'une rédaction qui a son style (quotidien local, radio, presse à scandale, télé nationale), la
 * presse varie ses sujets d'une conférence à l'autre et relance sur les réponses passées. Le joueur répond (trois
 * réponses proposées selon la situation, ou ses propres mots) ; ses réponses sont reprises par la gazette. Rien n'est
 * écrit dans le jeu.
 */

export type PressKind = 'pre' | 'post';

export type QuestionTopic =
  // avant le match
  | 'stakes'
  | 'theirScorer'
  | 'form'
  | 'injuries'
  | 'ourScorer'
  | 'congestion'
  | 'titleRace'
  // après le match
  | 'result'
  | 'cup'
  | 'hero'
  | 'streak'
  | 'youthDebut'
  | 'bigWin'
  | 'runEnded'
  // l'un ou l'autre : la vie du club et du coach
  | 'pressure'
  | 'fans'
  | 'exClub'
  | 'contract'
  | 'unhappy'
  | 'signing'
  | 'exit'
  | 'longInjury'
  | 'linked'
  // la presse se souvient d'une réponse passée
  | 'followUp';

/**
 * Rédactions qui suivent le club, chacune avec son style : le quotidien local (proche du club, factuel), la radio
 * (directe, à chaud), la presse à scandale (rumeurs, conflits, petites phrases) et la télé nationale (grands enjeux).
 * Toutes inventées.
 */
export const OUTLETS = ['local', 'radio', 'tabloid', 'tv'] as const;
export type Outlet = (typeof OUTLETS)[number];

/** Journalistes inventés : chaque rédaction envoie toujours la même personne suivre un club donné. */
const REPORTERS: Record<Outlet, string[]> = {
  local: ['Claire Moreau', 'Julien Barthe', 'Nadia Ferrand', 'Thomas Lacaze'],
  radio: ['Marc Delattre', 'Sonia Rivière', 'Karim Benali', 'Lucie Garnier'],
  tabloid: ['Vincent Roche', 'Inès Marchal', 'Fred Castagne', 'Laura Vidal'],
  tv: ['Antoine Brissac', 'Élodie Sorel', 'Hugo Mercier', 'Sarah Delmas'],
};

export interface PressQuestion {
  /** Identifiant stable dans la conférence (= sujet). */
  id: QuestionTopic;
  params: Record<string, string | number | null>;
  /** Rédaction qui pose la question, et son journaliste (la même personne pour un club, d'une conférence à l'autre). */
  outlet?: Outlet;
  reporter?: string;
}

export interface PressConference {
  /** Clé stable : une conférence par match et par moment. */
  key: string;
  kind: PressKind;
  /** Date du match (ISO). */
  date: string;
  club: string;
  opponent: string;
  competition: string | null;
  questions: PressQuestion[];
}

/** Tons de réponse : chaque question en propose trois, choisis selon le sujet et la situation (`answerTones`). */
export const ANSWER_TONES = ['confident', 'calm', 'firm', 'ambitious', 'humble', 'protect', 'selfCritical', 'praise', 'deny', 'deflect', 'tease', 'humour'] as const;
export type AnswerTone = (typeof ANSWER_TONES)[number];

/** Question telle qu'elle a été posée au joueur (texte gardé : l'IA a pu la reformuler). */
export interface PressAsked {
  id: QuestionTopic;
  text: string;
  outlet?: Outlet;
  reporter?: string;
}

export interface PressAnswer {
  question: QuestionTopic;
  tone: AnswerTone | null;
  /** Ce que le coach a dit, tel que la gazette le citera. */
  text: string;
}

/** Conférence tenue, telle que gardée dans la base (`fm_press_conferences`). */
export interface PressHeld {
  kind: PressKind;
  matchDate: string;
  opponent: string;
  questions: PressAsked[];
  /** Vide : le coach a refusé de répondre. */
  answers: PressAnswer[];
}

type Entry = { gameDate: string; data: FmSnapshot };

const MAX_QUESTIONS = 3;
/** Au-delà, la conférence d'après-match n'est plus d'actualité (le joueur a avancé). */
const POST_MAX_DAYS = 4;
/** Une nouvelle du club (recrue, départ, blessure, rumeur) reste un sujet pendant dix jours. */
const NEWS_DAYS = 10;
/** La presse relance sur une réponse donnée il y a trois semaines au plus. */
const MEMORY_DAYS = 21;
/** Un sujet abordé lors des trois dernières conférences passe après les autres. */
const RECENT_CONFERENCES = 3;
const RECENT_PENALTY = 50;
/** Course au titre : dans les deux premiers, à huit journées ou moins de la fin. */
const TITLE_RACE_LEFT = 8;
/** Les joueurs qui comptent : les quatorze meilleurs de l'effectif par niveau. */
const KEY_RANK = 14;
/** Un jeune qui débute : 19 ans ou moins. */
const YOUTH_AGE = 19;
const DAY_MS = 86_400_000;

const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);

export const pressKey = (kind: PressKind, club: string, opponent: string, date: string) => `${kind}|${club}|${opponent}|${date.slice(0, 10)}`;

const official = (r: MatchResult) => !r.friendly && r.outcome != null;

/** Petit hachage stable (FNV-1a) : mêmes choix pour une même conférence, d'un affichage à l'autre. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Forme récente (matchs officiels, du plus ancien au plus récent) : « VVNDV ». */
function form(results: MatchResult[], before: string, n = 5): string {
  return results
    .filter((r) => official(r) && r.date <= before)
    .slice(-n)
    .map((r) => r.outcome!)
    .join('');
}

/** Série en cours sur les matchs officiels : même issue de suite (au moins 3), ou sans victoire (au moins 4). */
function streakOf(results: MatchResult[]): { outcome: 'W' | 'L' | 'winless' | 'unbeaten'; count: number } | null {
  const off = results.filter(official);
  const last = off.at(-1)?.outcome;
  if (!last) return null;
  let same = 0;
  for (let i = off.length - 1; i >= 0 && off[i]!.outcome === last; i--) same++;
  if ((last === 'W' || last === 'L') && same >= 3) return { outcome: last, count: same };
  let winless = 0;
  for (let i = off.length - 1; i >= 0 && off[i]!.outcome !== 'W'; i--) winless++;
  if (winless >= 4) return { outcome: 'winless', count: winless };
  let unbeaten = 0;
  for (let i = off.length - 1; i >= 0 && off[i]!.outcome !== 'L'; i--) unbeaten++;
  if (unbeaten >= 6) return { outcome: 'unbeaten', count: unbeaten };
  return null;
}

const equipe = (s: FmSnapshot): Record<string, unknown> => (s as { custom?: { equipe?: Record<string, unknown> } }).custom?.equipe ?? {};
const gameText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.replace(/<[^>]*>/g, '').trim() : null);
const injuredCount = (s: FmSnapshot) => s.players.map(normalizePlayer).filter((p) => p.injury).length;

const jobStatus = (s: FmSnapshot) => {
  const v = gameText(equipe(s).securiteEmploi);
  return v && /insécur|danger|insecure|precarious|menac/i.test(v) ? v : null;
};

/** Supporters mécontents, d'après la confiance des supporters lue dans le jeu. */
const fansStatus = (s: FmSnapshot) => {
  const v = gameText(equipe(s).confianceSupporters);
  return v && /mécontent|déçu|insatisf|colère|furieu|frustr|inquiet|unhappy|disappoint|angry|furious|dissatisf|concern/i.test(v) ? v : null;
};

const rankOf = (s: FmSnapshot) => {
  const v = equipe(s).classementPosition;
  const n = typeof v === 'number' ? v : Number(/(\d+)/.exec(String(v ?? ''))?.[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Les joueurs qui comptent (équipe première, par niveau), du meilleur au moins bon. */
const keyPlayers = (s: FmSnapshot): FmPlayer[] =>
  s.players
    .map(normalizePlayer)
    .filter((p) => !p.team)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
    .slice(0, KEY_RANK);

/** Une question candidate et son intérêt (plus haut = posée d'abord). */
interface Candidate {
  q: PressQuestion;
  score: number;
}

/** Rédactions qui posent volontiers chaque sujet (la première de préférence). Les textes existent pour ces deux-là. */
export const ASKED_BY: Record<QuestionTopic, readonly [Outlet, Outlet]> = {
  stakes: ['tv', 'local'],
  theirScorer: ['radio', 'local'],
  form: ['radio', 'local'],
  injuries: ['local', 'radio'],
  ourScorer: ['tv', 'tabloid'],
  congestion: ['radio', 'local'],
  titleRace: ['tv', 'tabloid'],
  result: ['local', 'radio'],
  cup: ['tv', 'radio'],
  hero: ['radio', 'tv'],
  streak: ['tv', 'radio'],
  youthDebut: ['local', 'tv'],
  bigWin: ['tv', 'local'],
  runEnded: ['local', 'radio'],
  pressure: ['tabloid', 'tv'],
  fans: ['local', 'tabloid'],
  exClub: ['tabloid', 'tv'],
  contract: ['local', 'tabloid'],
  unhappy: ['tabloid', 'radio'],
  signing: ['local', 'tv'],
  exit: ['tabloid', 'local'],
  longInjury: ['local', 'radio'],
  linked: ['tabloid', 'tv'],
  followUp: ['tabloid', 'radio'],
};

/**
 * Rédaction de chaque question : une des deux qui suivent ce sujet, en évitant qu'une rédaction parle deux fois dans
 * la même conférence (sinon la première libre). Le journaliste est toujours le même pour un club et une rédaction.
 */
function assignOutlets(club: string, key: string, qs: PressQuestion[]): PressQuestion[] {
  const used = new Set<Outlet>();
  return qs.map((q) => {
    const [a, b] = ASKED_BY[q.id];
    // Une fois sur trois, la seconde rédaction prend la parole : un même sujet ne vient pas toujours du même micro.
    const pref = hash(`${key}|${q.id}`) % 3 === 0 ? [b, a] : [a, b];
    const outlet = pref.find((o) => !used.has(o)) ?? pref[0]!;
    used.add(outlet);
    const names = REPORTERS[outlet];
    return { ...q, outlet, reporter: names[hash(`${club}|${outlet}`) % names.length]! };
  });
}

/** Sujets abordés lors des dernières conférences, pour ne pas reposer les mêmes questions chaque semaine. */
function recentTopics(held: readonly PressHeld[], before: string): Set<QuestionTopic> {
  return new Set(
    [...held]
      .filter((h) => h.matchDate.slice(0, 10) < before.slice(0, 10))
      .sort((a, b) => b.matchDate.localeCompare(a.matchDate))
      .slice(0, RECENT_CONFERENCES)
      .flatMap((h) => h.questions.map((q) => q.id)),
  );
}

/** La question d'ouverture, puis les plus intéressantes ; un sujet déjà abordé récemment passe après les autres. */
function pick(lead: PressQuestion, rest: Candidate[], held: readonly PressHeld[], date: string, club: string, key: string): PressQuestion[] {
  const recent = recentTopics(held, date);
  const ranked = rest
    .map((c) => ({ ...c, score: c.score - (recent.has(c.q.id) ? RECENT_PENALTY : 0) + (hash(`${key}|${c.q.id}`) % 10) }))
    .sort((a, b) => b.score - a.score)
    .map((c) => c.q);
  return assignOutlets(club, key, [lead, ...ranked].slice(0, MAX_QUESTIONS));
}

/** Nouvelles du club des derniers jours (dépêches) : recrue, départ, longue blessure, rumeur sur le coach. */
function newsCandidates(sorted: Entry[], at: string): Candidate[] {
  const out: Candidate[] = [];
  const fresh = breakingNews(sorted).filter((n) => days(n.date, at) >= 0 && days(n.date, at) <= NEWS_DAYS);
  const signing = fresh.find((n) => n.kind === 'signing');
  if (signing) out.push({ q: { id: 'signing', params: { name: signing.name } }, score: 60 });
  const exit = fresh.find((n) => n.kind === 'exit');
  if (exit) out.push({ q: { id: 'exit', params: { name: exit.name } }, score: 58 });
  const hurt = fresh.find((n) => n.kind === 'injury');
  if (hurt) out.push({ q: { id: 'longInjury', params: { name: hurt.name } }, score: 62 });
  const linked = fresh.find((n) => isCoachBreaking(n) && n.other);
  if (linked) out.push({ q: { id: 'linked', params: { other: linked.other! } }, score: 70 });
  return out;
}

/** Ce qui se dit autour du club au dernier relevé : direction, supporters, contrats, vestiaire, ancien club en face. */
function clubCandidates(sorted: Entry[], opponent: string | null, losing: boolean): Candidate[] {
  const last = sorted.at(-1)!;
  const out: Candidate[] = [];
  const job = jobStatus(last.data);
  if (job && losing) out.push({ q: { id: 'pressure', params: { status: job } }, score: 66 });
  const fans = fansStatus(last.data);
  if (fans) out.push({ q: { id: 'fans', params: { status: fans } }, score: 52 });
  const players = keyPlayers(last.data);
  const months = (p: FmPlayer) => (p.contractEnd ? monthsBetween(last.gameDate.slice(0, 10), p.contractEnd) : null);
  const expiring = players.find((p) => {
    const m = months(p);
    return m != null && m >= 0 && m <= 6;
  });
  if (expiring) out.push({ q: { id: 'contract', params: { name: expiring.name, months: Math.max(1, months(expiring)!) } }, score: 44 });
  const sulking = players.find((p) => {
    const m = moraleLevel(p.morale);
    return m != null && m <= 1;
  });
  if (sulking) out.push({ q: { id: 'unhappy', params: { name: sulking.name } }, score: 48 });
  // Clubs entraînés avant celui-ci (l'historique suit le coach d'un club à l'autre).
  if (opponent && opponent !== last.data.club && sorted.some((e) => e.data.club === opponent)) out.push({ q: { id: 'exClub', params: { opponent } }, score: 75 });
  return out;
}

/** Ton tranché : la phrase que la presse retient et ressort. */
const STRONG: readonly AnswerTone[] = ['confident', 'ambitious', 'firm', 'deny', 'tease', 'selfCritical', 'protect'];

/** Réponse d'une conférence récente sur laquelle la presse peut revenir : la plus tranchée, sinon la plus longue. */
function memoryOf(held: readonly PressHeld[], date: string): { h: PressHeld; a: PressAnswer } | null {
  const past = [...held]
    .filter((h) => h.answers.length && h.matchDate.slice(0, 10) < date.slice(0, 10) && days(h.matchDate, date) <= MEMORY_DAYS)
    .sort((a, b) => b.matchDate.localeCompare(a.matchDate))[0];
  if (!past) return null;
  const strong = (x: PressAnswer) => Number(x.tone != null && STRONG.includes(x.tone));
  const a = [...past.answers].filter((x) => x.text.trim()).sort((x, y) => strong(y) - strong(x) || y.text.length - x.text.length)[0];
  return a ? { h: past, a } : null;
}

/** Citation ramenée à sa première phrase (la presse relance sur une phrase, pas sur un discours). */
export function shortQuote(text: string): string {
  const s = text.trim().replace(/\s+/g, ' ');
  const first = /^(.{12,}?[.!?…])(\s|$)/.exec(s)?.[1] ?? s;
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
}

/**
 * Relance sur une réponse passée : rumeur qui revient après un démenti, promesse démentie par une défaite, mise au
 * point suivie d'une victoire, ou simple rappel avant une affiche.
 */
function followUp(held: readonly PressHeld[], date: string, now: { outcome?: string | null; linked?: boolean; pre?: boolean }): Candidate | null {
  const m = memoryOf(held, date);
  if (!m) return null;
  const tone = m.a.tone;
  let variant: 'broken' | 'kept' | 'denied' | 'again' | null = null;
  if (now.linked && m.a.question === 'linked') variant = 'denied';
  else if (now.outcome === 'L' && (tone === 'confident' || tone === 'ambitious' || tone === 'tease')) variant = 'broken';
  else if (now.outcome === 'W' && (tone === 'firm' || tone === 'selfCritical' || tone === 'protect')) variant = 'kept';
  else if (now.pre) variant = 'again';
  if (!variant) return null;
  return { q: { id: 'followUp', params: { variant, quote: shortQuote(m.a.text), pastOpponent: m.h.opponent } }, score: variant === 'again' ? 40 : 80 };
}

/** Conférence d'avant-match : seulement pour une affiche (coupe, Europe, choc au sommet, duel direct). */
export function preMatchConference(history: Entry[], big: BigMatch | null = bigMatchNow(history), held: readonly PressHeld[] = []): PressConference | null {
  if (!big) return null;
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const last = sorted.at(-1)!;
  const results = matchResults(sorted);
  const key = pressKey('pre', big.club, big.opponent, big.date);
  const lead: PressQuestion = {
    id: 'stakes',
    params: { kind: big.kind, opponent: big.opponent, competition: big.competition, position: big.position, opponentPosition: big.opponentPosition, home: big.home == null ? null : big.home ? 1 : 0 },
  };
  const c: Candidate[] = [];
  if (big.theirScorer?.goals) c.push({ q: { id: 'theirScorer', params: { opponent: big.opponent, name: big.theirScorer.name, goals: big.theirScorer.goals } }, score: 55 });
  const injured = injuredCount(last.data);
  if (injured >= 3) c.push({ q: { id: 'injuries', params: { count: injured } }, score: 50 });
  const f = form(results, last.gameDate);
  if (f.length >= 3) c.push({ q: { id: 'form', params: { form: f, wins: [...f].filter((x) => x === 'W').length, games: f.length } }, score: 35 });
  if (big.ourScorer && big.ourScorer.goals >= 3) c.push({ q: { id: 'ourScorer', params: { name: big.ourScorer.name, goals: big.ourScorer.goals } }, score: 42 });
  if (isCongested(snapshotFixtures(last.data), last.gameDate.slice(0, 10))) c.push({ q: { id: 'congestion', params: {} }, score: 46 });
  const pos = rankOf(last.data);
  const left = leagueFixturesLeft(last.data);
  if (big.kind !== 'cup' && big.kind !== 'europe' && pos != null && pos <= 2 && left != null && left > 0 && left <= TITLE_RACE_LEFT) {
    c.push({ q: { id: 'titleRace', params: { position: pos, left } }, score: 68 });
  }
  const news = newsCandidates(sorted, last.gameDate);
  c.push(...news, ...clubCandidates(sorted, big.opponent, false));
  const fu = followUp(held, big.date, { pre: true, linked: news.some((n) => n.q.id === 'linked') });
  if (fu) c.push(fu);
  return { key, kind: 'pre', date: big.date, club: big.club, opponent: big.opponent, competition: big.competition, questions: pick(lead, c, held, big.date, big.club, key) };
}

/** Conférence d'après-match : le dernier match officiel, s'il date de quelques jours au plus. */
export function postMatchConference(history: Entry[], held: readonly PressHeld[] = []): PressConference | null {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const last = sorted.at(-1);
  if (!last) return null;
  const results = matchResults(sorted);
  const r = [...results].reverse().find(official);
  if (!r || !r.opponent || r.matches !== 1 || r.goalsFor == null || r.goalsAgainst == null) return null;
  const date = r.played ?? r.date;
  if (days(date, last.gameDate) > POST_MAX_DAYS) return null;
  const key = pressKey('post', last.data.club, r.opponent, date);
  const ck = competitionKind(r.competition);
  const lead: PressQuestion = {
    id: 'result',
    params: { outcome: r.outcome, opponent: r.opponent, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, competition: r.competition, home: r.home == null ? null : r.home ? 1 : 0 },
  };
  const c: Candidate[] = [];
  if (ck === 'cup' || ck === 'europe') c.push({ q: { id: 'cup', params: { outcome: r.outcome, competition: r.competition, opponent: r.opponent } }, score: 72 });
  const hero = [...r.players].filter((p) => (p.goals ?? 0) >= 2).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0];
  if (hero) c.push({ q: { id: 'hero', params: { name: hero.name, goals: hero.goals ?? 0 } }, score: 64 });
  const streak = streakOf(results);
  if (streak) c.push({ q: { id: 'streak', params: { outcome: streak.outcome, count: streak.count } }, score: 54 });
  // Premier match d'un jeune : il était déjà au club au relevé d'avant le match, sans aucune apparition.
  const prev = sorted.find((e) => e.gameDate === r.since);
  if (prev) {
    const before = new Map(prev.data.players.map(normalizePlayer).map((p) => [p.id, p]));
    const now = new Map(last.data.players.map(normalizePlayer).map((p) => [p.id, p]));
    const kid = r.players.find((p) => {
      const age = now.get(p.id)?.age;
      const b = before.get(p.id);
      return p.minutes > 0 && age != null && age <= YOUTH_AGE && b != null && !b.apps;
    });
    if (kid) c.push({ q: { id: 'youthDebut', params: { name: kid.name, age: now.get(kid.id)!.age } }, score: 63 });
  }
  for (const n of recordNews(sorted).filter((x) => x.date === r.date)) {
    if (n.kind === 'bigWin') c.push({ q: { id: 'bigWin', params: { opponent: r.opponent, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst } }, score: 57 });
    if (n.kind === 'runEnded') c.push({ q: { id: 'runEnded', params: { count: n.count } }, score: 61 });
  }
  const news = newsCandidates(sorted, last.gameDate);
  c.push(...news, ...clubCandidates(sorted, r.opponent, r.outcome !== 'W'));
  const fu = followUp(held, date, { outcome: r.outcome, linked: news.some((n) => n.q.id === 'linked') });
  if (fu) c.push(fu);
  return { key, kind: 'post', date: date.slice(0, 10), club: last.data.club, opponent: r.opponent, competition: r.competition, questions: pick(lead, c, held, date, last.data.club, key) };
}

/**
 * Conférence à proposer maintenant (avant-match en priorité : le match approche), en sautant celles déjà tenues
 * ou refusées (`done` : leurs clés). `held` : conférences passées, pour varier les sujets et relancer sur une réponse.
 */
export function pendingConference(history: Entry[], done: ReadonlySet<string>, held: readonly PressHeld[] = []): PressConference | null {
  for (const c of [preMatchConference(history, undefined, held), postMatchConference(history, held)]) {
    if (c && c.questions.length && !done.has(c.key)) return c;
  }
  return null;
}

/** Les trois réponses proposées pour une question, selon le sujet et la situation (issue du match, sorte de relance). */
export function answerTones(q: Pick<PressQuestion, 'id' | 'params'>): readonly [AnswerTone, AnswerTone, AnswerTone] {
  const o = q.params.outcome;
  switch (q.id) {
    case 'result':
      return o === 'W' ? ['praise', 'calm', 'ambitious'] : o === 'D' ? ['confident', 'calm', 'firm'] : ['protect', 'selfCritical', 'firm'];
    case 'cup':
      return o === 'L' ? ['protect', 'selfCritical', 'firm'] : ['ambitious', 'humble', 'humour'];
    case 'streak':
      return o === 'W' || o === 'unbeaten' ? ['ambitious', 'humble', 'humour'] : ['protect', 'selfCritical', 'firm'];
    case 'hero':
    case 'youthDebut':
      return ['praise', 'calm', 'firm'];
    case 'bigWin':
      return ['praise', 'humble', 'humour'];
    case 'runEnded':
      return ['protect', 'calm', 'humour'];
    case 'stakes':
    case 'titleRace':
      return ['ambitious', 'humble', 'humour'];
    case 'theirScorer':
      return ['confident', 'calm', 'deflect'];
    case 'pressure':
    case 'fans':
      return ['confident', 'selfCritical', 'firm'];
    case 'linked':
      return ['deny', 'deflect', 'tease'];
    case 'exClub':
      return ['humble', 'deflect', 'tease'];
    case 'contract':
      return ['confident', 'deflect', 'firm'];
    case 'unhappy':
      return ['protect', 'deny', 'firm'];
    case 'exit':
      return ['praise', 'deflect', 'firm'];
    case 'signing':
      return ['ambitious', 'calm', 'praise'];
    case 'followUp':
      return q.params.variant === 'denied' ? ['deny', 'humour', 'tease'] : q.params.variant === 'kept' ? ['praise', 'humble', 'firm'] : ['confident', 'selfCritical', 'humour'];
    default:
      return ['confident', 'calm', 'firm'];
  }
}

/** Poids d'une citation dans la gazette : sous les résultats, au-dessus des brèves courantes. */
const PRESS_WEIGHT = 45;

/**
 * Les gazettes avec, dans chaque semaine, les paroles du coach en conférence de presse (une brève par conférence
 * tenue cette semaine-là, la réponse la plus tranchée citée, sinon la plus longue, avec la rédaction qui l'a
 * recueillie et son ton, qui donne son titre à la brève). Une conférence refusée devient « pas de commentaire ».
 */
export function withPress<I extends { weekStart: string; weekEnd: string; stories: GazetteStory[] }>(issues: I[], held: PressHeld[]): I[] {
  if (!held.length) return issues;
  return issues.map((issue) => {
    const from = issue.weekStart.slice(0, 10);
    const to = issue.weekEnd.slice(0, 10);
    const mine = held.filter((h) => h.matchDate.slice(0, 10) >= from && h.matchDate.slice(0, 10) <= to);
    if (!mine.length) return issue;
    const stories: GazetteStory[] = mine.map((h) => {
      const strong = (a: PressAnswer) => Number(a.tone != null && STRONG.includes(a.tone));
      const best = [...h.answers].filter((a) => a.text.trim()).sort((a, b) => strong(b) - strong(a) || b.text.length - a.text.length)[0];
      const asked = best ? h.questions.find((q) => q.id === best.question) : undefined;
      return {
        kind: 'press',
        weight: PRESS_WEIGHT,
        params: {
          moment: h.kind,
          opponent: h.opponent,
          quote: best ? best.text.trim() : null,
          topic: best?.question ?? null,
          question: asked?.text ?? null,
          tone: best?.tone ?? null,
          outlet: asked?.outlet ?? null,
          reporter: asked?.reporter ?? null,
        },
      };
    });
    return { ...issue, stories: [...issue.stories, ...stories] };
  });
}
