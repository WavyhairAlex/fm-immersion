import { bigMatchNow, type BigMatch } from './bigmatch';
import { normalizePlayer } from './player';
import { matchResults, type MatchResult } from './results';
import { competitionKind } from './rules';
import type { GazetteStory } from './gazette';
import type { FmSnapshot } from './snapshot';

/**
 * Conférences de presse : avant un gros match (affiche du choc, `bigMatchNow`) et après chaque match officiel, la
 * presse pose au coach trois questions tirées des faits déjà calculés. Le joueur répond (ton proposé ou ses propres
 * mots) ; ses réponses sont gardées et reprises par la gazette de la semaine. Rien n'est écrit dans le jeu.
 */

export type PressKind = 'pre' | 'post';

export type QuestionTopic =
  // avant le match
  | 'stakes'
  | 'theirScorer'
  | 'form'
  | 'injuries'
  | 'ourScorer'
  // après le match
  | 'result'
  | 'cup'
  | 'hero'
  | 'streak'
  | 'pressure';

export interface PressQuestion {
  /** Identifiant stable dans la conférence (= sujet). */
  id: QuestionTopic;
  params: Record<string, string | number | null>;
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

/** Tons de réponse proposés au joueur (il peut aussi écrire la sienne). */
export const ANSWER_TONES = ['confident', 'calm', 'firm'] as const;
export type AnswerTone = (typeof ANSWER_TONES)[number];

/** Question telle qu'elle a été posée au joueur (texte gardé : l'IA a pu la reformuler). */
export interface PressAsked {
  id: QuestionTopic;
  text: string;
}

export interface PressAnswer {
  question: QuestionTopic;
  tone: AnswerTone | null;
  /** Ce que le coach a dit, tel que la gazette le citera. */
  text: string;
}

type Entry = { gameDate: string; data: FmSnapshot };

const MAX_QUESTIONS = 3;
/** Au-delà, la conférence d'après-match n'est plus d'actualité (le joueur a avancé). */
const POST_MAX_DAYS = 4;
const DAY_MS = 86_400_000;

const days = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / DAY_MS);

export const pressKey = (kind: PressKind, club: string, opponent: string, date: string) => `${kind}|${club}|${opponent}|${date.slice(0, 10)}`;

const official = (r: MatchResult) => !r.friendly && r.outcome != null;

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

const injuredCount = (s: FmSnapshot) => s.players.map(normalizePlayer).filter((p) => p.injury).length;

const jobStatus = (s: FmSnapshot) => {
  const v = (s as { custom?: { equipe?: Record<string, unknown> } }).custom?.equipe?.securiteEmploi;
  return typeof v === 'string' && /insécur|danger|insecure|precarious|menac/i.test(v) ? v : null;
};

/** Conférence d'avant-match : seulement pour une affiche (coupe, Europe, choc au sommet, duel direct). */
export function preMatchConference(history: Entry[], big: BigMatch | null = bigMatchNow(history)): PressConference | null {
  if (!big) return null;
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const last = sorted.at(-1)!;
  const results = matchResults(sorted);
  const q: PressQuestion[] = [];
  q.push({
    id: 'stakes',
    params: { kind: big.kind, opponent: big.opponent, competition: big.competition, position: big.position, opponentPosition: big.opponentPosition, home: big.home == null ? null : big.home ? 1 : 0 },
  });
  if (big.theirScorer) q.push({ id: 'theirScorer', params: { opponent: big.opponent, name: big.theirScorer.name, goals: big.theirScorer.goals } });
  const f = form(results, last.gameDate);
  const injured = injuredCount(last.data);
  if (injured >= 3) q.push({ id: 'injuries', params: { count: injured } });
  if (f.length >= 3) q.push({ id: 'form', params: { form: f, wins: [...f].filter((x) => x === 'W').length, games: f.length } });
  if (big.ourScorer && big.ourScorer.goals >= 3) q.push({ id: 'ourScorer', params: { name: big.ourScorer.name, goals: big.ourScorer.goals } });
  return {
    key: pressKey('pre', big.club, big.opponent, big.date),
    kind: 'pre',
    date: big.date,
    club: big.club,
    opponent: big.opponent,
    competition: big.competition,
    questions: q.slice(0, MAX_QUESTIONS),
  };
}

/** Conférence d'après-match : le dernier match officiel, s'il date de quelques jours au plus. */
export function postMatchConference(history: Entry[]): PressConference | null {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const last = sorted.at(-1);
  if (!last) return null;
  const results = matchResults(sorted);
  const r = [...results].reverse().find(official);
  if (!r || !r.opponent || r.matches !== 1 || r.goalsFor == null || r.goalsAgainst == null) return null;
  const date = r.played ?? r.date;
  if (days(date, last.gameDate) > POST_MAX_DAYS) return null;
  const ck = competitionKind(r.competition);
  const q: PressQuestion[] = [];
  q.push({
    id: 'result',
    params: { outcome: r.outcome, opponent: r.opponent, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, competition: r.competition, home: r.home == null ? null : r.home ? 1 : 0 },
  });
  if (ck === 'cup' || ck === 'europe') q.push({ id: 'cup', params: { outcome: r.outcome, competition: r.competition, opponent: r.opponent } });
  const hero = [...r.players].filter((p) => (p.goals ?? 0) >= 2).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0))[0];
  if (hero) q.push({ id: 'hero', params: { name: hero.name, goals: hero.goals ?? 0 } });
  const streak = streakOf(results);
  if (streak) q.push({ id: 'streak', params: { outcome: streak.outcome, count: streak.count } });
  const job = jobStatus(last.data);
  if (job && r.outcome !== 'W') q.push({ id: 'pressure', params: { status: job } });
  return {
    key: pressKey('post', last.data.club, r.opponent, date),
    kind: 'post',
    date: date.slice(0, 10),
    club: last.data.club,
    opponent: r.opponent,
    competition: r.competition,
    questions: q.slice(0, MAX_QUESTIONS),
  };
}

/**
 * Conférence à proposer maintenant (avant-match en priorité : le match approche), en sautant celles déjà tenues
 * ou refusées (`done` : leurs clés).
 */
export function pendingConference(history: Entry[], done: ReadonlySet<string>): PressConference | null {
  for (const c of [preMatchConference(history), postMatchConference(history)]) {
    if (c && c.questions.length && !done.has(c.key)) return c;
  }
  return null;
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

/** Poids d'une citation dans la gazette : sous les résultats, au-dessus des brèves courantes. */
const PRESS_WEIGHT = 45;

/**
 * Les gazettes avec, dans chaque semaine, les paroles du coach en conférence de presse (une brève par conférence
 * tenue cette semaine-là, la réponse la plus longue citée). Une conférence refusée devient « pas de commentaire ».
 */
export function withPress<I extends { weekStart: string; weekEnd: string; stories: GazetteStory[] }>(issues: I[], held: PressHeld[]): I[] {
  if (!held.length) return issues;
  return issues.map((issue) => {
    const from = issue.weekStart.slice(0, 10);
    const to = issue.weekEnd.slice(0, 10);
    const mine = held.filter((h) => h.matchDate.slice(0, 10) >= from && h.matchDate.slice(0, 10) <= to);
    if (!mine.length) return issue;
    const stories: GazetteStory[] = mine.map((h) => {
      const best = [...h.answers].filter((a) => a.text.trim()).sort((a, b) => b.text.length - a.text.length)[0];
      return {
        kind: 'press',
        weight: PRESS_WEIGHT,
        params: {
          moment: h.kind,
          opponent: h.opponent,
          quote: best ? best.text.trim() : null,
          topic: best?.question ?? null,
          question: best ? (h.questions.find((q) => q.id === best.question)?.text ?? null) : null,
        },
      };
    });
    return { ...issue, stories: [...issue.stories, ...stories] };
  });
}
