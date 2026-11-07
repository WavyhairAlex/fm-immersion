import { toNumber } from './player';
import type { MatchResult } from './results';

/**
 * Chiffres du dernier match joué, tels que le jeu les écrit dans `custom.equipe` (chemins.json : `dernierMatch*` =
 * LastFixture/…, lus par le plugin). Le jeu ne remplit possession, tirs et xG qu'une fois le match terminé, et sa date
 * est un objet opaque : on reconnaît le match par son score (domicile, extérieur). Un match sans aucun tir ni
 * possession (50/50, 0 tir) est tenu pour non renseigné.
 */
export interface GameLastMatch {
  homeScore: number;
  awayScore: number;
  /** Domicile, extérieur. */
  possession: [number, number] | null;
  shots: [number, number] | null;
  onTarget: [number, number] | null;
  xg: [number, number] | null;
  /** Homme du match élu par le jeu (des deux équipes). */
  motm: { name: string; rating: number | null } | null;
}

/** Mêmes chiffres vus de notre côté : nous, puis l'adversaire. */
export interface MatchFigures {
  possession: [number, number] | null;
  shots: [number, number] | null;
  onTarget: [number, number] | null;
  xg: [number, number] | null;
  motm: { name: string; rating: number | null } | null;
}

const num = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'string' && v.trim() !== '' ? toNumber(v) : null);
const pair = (a: unknown, b: unknown): [number, number] | null => {
  const x = num(a);
  const y = num(b);
  return x != null && y != null ? [x, y] : null;
};

export function gameLastMatch(snap: unknown): GameLastMatch | null {
  const e = (snap as { custom?: { equipe?: Record<string, unknown> } } | null)?.custom?.equipe;
  if (!e) return null;
  const homeScore = num(e.dernierMatchScoreDomicile);
  const awayScore = num(e.dernierMatchScoreExterieur);
  if (homeScore == null || awayScore == null) return null;
  const possession = pair(e.dernierMatchPossDom, e.dernierMatchPossExt);
  const shots = pair(e.dernierMatchTirsDom, e.dernierMatchTirsExt);
  const onTarget = pair(e.dernierMatchTirsCadresDom, e.dernierMatchTirsCadresExt);
  const xg = pair(e.dernierMatchXgDom, e.dernierMatchXgExt);
  const raw = e.dernierMatchHommeDuMatch;
  const name = typeof raw === 'string' && raw.trim() && !raw.startsWith('SI.') && !raw.startsWith('FM.') ? raw.replace(/<[^>]*>/g, '').trim() : null;
  const empty = (!shots || (shots[0] === 0 && shots[1] === 0)) && (!possession || (possession[0] === 50 && possession[1] === 50));
  if (empty) return null;
  return { homeScore, awayScore, possession, shots, onTarget, xg, motm: name ? { name, rating: num(e.dernierMatchNoteHommeDuMatch) } : null };
}

const DAY_MS = 86_400_000;

/**
 * Chiffres du jeu pour un match retrouvé entre deux instantanés, s'il s'agit bien du dernier match joué : score
 * identique (dans le bon sens selon le lieu), instantané écrit au plus tard sept jours de jeu après le match.
 */
export function figuresForResult(snap: unknown, r: MatchResult | null | undefined): MatchFigures | null {
  if (!r || r.matches !== 1 || r.goalsFor == null || r.goalsAgainst == null) return null;
  const date = (snap as { gameDate?: unknown } | null)?.gameDate;
  if (typeof date !== 'string') return null;
  const days = (Date.parse(date.slice(0, 10)) - Date.parse(r.date.slice(0, 10))) / DAY_MS;
  if (!Number.isFinite(days) || days < 0 || days > 7) return null;
  const g = gameLastMatch(snap);
  if (!g) return null;
  const asHome = g.homeScore === r.goalsFor && g.awayScore === r.goalsAgainst;
  const asAway = g.homeScore === r.goalsAgainst && g.awayScore === r.goalsFor;
  // Lieu connu : le score doit coller dans ce sens ; lieu inconnu : le sens du score dit où l'on jouait.
  const us = r.home === true ? (asHome ? true : null) : r.home === false ? (asAway ? false : null) : asHome ? true : asAway ? false : null;
  if (us == null) return null;
  const flip = <T,>(p: [T, T] | null): [T, T] | null => (p ? (us ? p : [p[1], p[0]]) : null);
  return { possession: flip(g.possession), shots: flip(g.shots), onTarget: flip(g.onTarget), xg: flip(g.xg), motm: g.motm };
}
