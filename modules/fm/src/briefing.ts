import type { Decision } from './decisions';
import { moraleLevel } from './club';
import { isFriendly } from './rules';
import type { FmPlayer } from './player';
import type { PlaytimeRow } from './playtime';

/*
 * Briefing de l'adjoint : ce que FM Coach dirait au coach en arrivant au bureau. Quelques phrases triées par
 * urgence, chacune avec l'écran où agir, à partir des calculs déjà faits ailleurs (compo, décisions, temps de jeu,
 * moral, entraînement). Rien de nouveau n'est calculé ici : on choisit et on hiérarchise.
 */

export type BriefKind =
  | 'offseason'
  | 'absentStarters'
  | 'nextMatch'
  | 'friendly'
  | 'tiredStarters'
  | 'contracts'
  | 'trialists'
  | 'playtimeShort'
  | 'unhappy'
  | 'playtimeOver'
  | 'training'
  | 'mercato'
  | 'allGood';
export type BriefTone = 'bad' | 'warn' | 'info' | 'good';

export interface BriefItem {
  kind: BriefKind;
  tone: BriefTone;
  /** Écran où agir (identifiant de vue de FM Coach). */
  view: string;
  /** Valeurs du texte (clé i18n `fm.brief.<kind>`). `count` sert aux pluriels. */
  values: Record<string, string | number>;
  players: FmPlayer[];
}

export interface BriefingInput {
  players: FmPlayer[];
  nextMatch: { opponent: string; home: boolean | null; inDays: number | null; competition: string | null } | null;
  /** Titulaires prévus du prochain match (onze de Tactique), pour parler des absents et des fatigués qui comptent. */
  starters?: ReadonlySet<string>;
  decisions?: Decision[];
  playtime?: PlaytimeRow[];
  /** Joueurs dont l'entraînement individuel est à changer. */
  setupsToChange?: number;
  offseason?: boolean;
  /** Joueurs à l'essai au club : à juger avant la fin de l'essai (cibles du mercato). */
  trialists?: FmPlayer[];
  /** Joueur absent mais rétabli d'ici le match. */
  backForMatch?: (p: FmPlayer) => boolean;
}

/** Nombre de messages au plus : un briefing se lit en quelques secondes. */
export const BRIEF_MAX = 6;
/** Condition sous laquelle un titulaire est signalé fatigué. */
export const TIRED_CONDITION = 85;

const lastName = (p: FmPlayer) => p.name.trim().split(/\s+/).at(-1) ?? p.name;
/** « Novák », « Novák et Kováč », « Novák, Kováč et 2 autres » : la langue joint avec `and` (« et », « and »). */
export function nameList(ps: FmPlayer[], and: string, others: (n: number) => string, max = 2): string {
  const names = ps.slice(0, max).map(lastName);
  const rest = ps.length - names.length;
  if (rest > 0) return `${names.join(', ')} ${and} ${others(rest)}`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${and} ${names.at(-1)}` : (names[0] ?? '');
}

export function briefing(input: BriefingInput): BriefItem[] {
  const { players, nextMatch, starters = new Set<string>(), decisions = [], playtime = [] } = input;
  const back = input.backForMatch ?? (() => false);
  const out: BriefItem[] = [];
  const item = (kind: BriefKind, tone: BriefTone, view: string, ps: FmPlayer[] = [], values: Record<string, string | number> = {}) =>
    out.push({ kind, tone, view, players: ps, values: { count: ps.length, ...values } });

  if (input.offseason) item('offseason', 'info', 'home');

  // Match amical : rien en jeu. Pas d'alerte sur les titulaires absents ou fatigués ; l'adjoint conseille plutôt
  // de donner du temps de jeu à ceux qui en manquent.
  const friendly = !!nextMatch && isFriendly(nextMatch.competition);
  const official = friendly ? null : nextMatch;
  const xi = players.filter((p) => starters.has(p.id));
  const absent = xi.filter((p) => (p.injury || p.suspension) && !back(p));
  if (official && absent.length) item('absentStarters', 'bad', 'tactic', absent);
  if (nextMatch)
    out.push({
      kind: friendly ? 'friendly' : 'nextMatch',
      tone: 'info',
      view: friendly ? 'playtime' : 'opponent',
      players: [],
      values: { opponent: nextMatch.opponent, days: nextMatch.inDays ?? -1, where: nextMatch.home == null ? '' : nextMatch.home ? 'home' : 'away', competition: nextMatch.competition ?? '', count: nextMatch.inDays ?? 0 },
    });
  const tired = xi.filter((p) => !p.injury && p.condition != null && p.condition < TIRED_CONDITION);
  if (official && tired.length) item('tiredStarters', 'warn', 'depth', tired);

  if (input.trialists?.length) item('trialists', 'warn', 'targets', input.trialists);

  const contracts = decisions.filter((d) => d.kind === 'contract');
  if (contracts.length) {
    const first = contracts[0]!;
    item('contracts', 'warn', 'contracts', contracts.flatMap((d) => d.players.slice(0, 1)), { date: first.deadline ?? '' });
  }

  const short = playtime.filter((r) => r.verdict === 'short').map((r) => r.player);
  if (short.length) item('playtimeShort', 'warn', 'playtime', short);
  const unhappy = players.filter((p) => {
    const l = moraleLevel(p.morale);
    return l != null && l <= 1;
  });
  if (unhappy.length) item('unhappy', 'warn', 'dressing', unhappy);
  const over = playtime.filter((r) => r.verdict === 'over').map((r) => r.player);
  if (over.length) item('playtimeOver', 'info', 'playtime', over);
  if (input.setupsToChange) out.push({ kind: 'training', tone: 'info', view: 'training', players: [], values: { count: input.setupsToChange } });
  const moves = decisions.filter((d) => d.kind === 'recruit' || d.kind === 'departure');
  if (moves.length && !input.offseason) out.push({ kind: 'mercato', tone: 'info', view: 'mercato', players: [], values: { count: moves.length } });

  if (!out.length || out.every((x) => x.kind === 'nextMatch' || x.kind === 'friendly')) item('allGood', 'good', 'home');
  return out.slice(0, BRIEF_MAX);
}

/*
 * « À faire » : chaque message du briefing se coche une fois traité. La coche tient tant que le message reste le
 * même (même sujet, mêmes joueurs, même adversaire) et au plus une semaine de jeu : un problème qui revient la
 * semaine suivante réapparaît.
 */

/** Messages qui ne se cochent pas (simple information). */
const NOT_A_TASK: ReadonlySet<BriefKind> = new Set(['allGood']);
export const isBriefTask = (x: BriefItem) => !NOT_A_TASK.has(x.kind);

/** Durée de validité d'une coche, en jours de jeu. */
export const BRIEF_DONE_DAYS = 7;

/** Clé stable d'un message : son sujet, ses joueurs, et l'adversaire pour le prochain match. */
export function briefKey(x: BriefItem): string {
  const ids = x.players.map((p) => p.id).sort().join(',');
  const extra = x.kind === 'nextMatch' || x.kind === 'friendly' ? String(x.values.opponent ?? '') : x.kind === 'training' || x.kind === 'mercato' ? String(x.values.count ?? '') : '';
  return `${x.kind}:${ids}:${extra}`;
}

/** Coches enregistrées : clé du message → date de jeu où il a été coché. */
export type BriefDone = Record<string, string>;

const dayOf = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86_400_000);

export function briefIsDone(done: BriefDone, x: BriefItem, gameDate: string): boolean {
  const at = done[briefKey(x)];
  if (!at) return false;
  const gap = dayOf(gameDate) - dayOf(at);
  return Number.isFinite(gap) && gap >= 0 && gap <= BRIEF_DONE_DAYS;
}

/** Garde seulement les coches encore valides (le stockage ne grossit pas indéfiniment). */
export function pruneBriefDone(done: BriefDone, gameDate: string): BriefDone {
  const out: BriefDone = {};
  for (const [k, at] of Object.entries(done)) {
    const gap = dayOf(gameDate) - dayOf(at);
    if (Number.isFinite(gap) && gap >= 0 && gap <= BRIEF_DONE_DAYS) out[k] = at;
  }
  return out;
}
