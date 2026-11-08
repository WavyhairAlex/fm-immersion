import { addDays } from './training';
import { daysUntil } from './fixtures';
import { normalizePlayer } from './player';
import { competitionKind } from './rules';
import type { FmSnapshot } from './snapshot';

/**
 * Affiche du choc : un match qui sort de l'ordinaire, annoncé quelques jours avant. Coupe ou Europe ; choc au sommet
 * (contre le leader, ou nous leaders contre un des trois premiers) ; duel direct (deux équipes à deux places ou moins
 * l'une de l'autre dans le haut du classement).
 */
export interface BigMatch {
  kind: 'cup' | 'europe' | 'top' | 'rival';
  /** Date du match (ISO), tirée de la date de jeu et du « Dans 3 jours » du jeu. */
  date: string;
  /** Jours avant le match, au relevé. */
  inDays: number;
  club: string;
  opponent: string;
  competition: string | null;
  home: boolean | null;
  position: number | null;
  opponentPosition: number | null;
  opponentManager: string | null;
  /** Notre meilleur buteur de la saison (identifiant pour sa photo) et le leur. */
  ourScorer: { id: string; name: string; goals: number } | null;
  theirScorer: { name: string; goals: number | null } | null;
  /** Avis du jeu sur le match (« Ce match s'annonce disputé… »). */
  threat: string | null;
}

/** On l'annonce au plus tôt cinq jours avant. */
const AHEAD_DAYS = 5;
/** Duel direct : deux places d'écart au plus, dans les six premiers. */
const RIVAL_GAP = 2;
const RIVAL_TOP = 6;

const text = (v: unknown) => (typeof v === 'string' && v.trim() && !/^(SI|FM)\./.test(v) ? v.replace(/<[^>]*>/g, '').trim() : null);
const rank = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(/(\d+)/.exec(String(v ?? ''))?.[1]);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Le prochain match du relevé, s'il mérite une affiche ; null sinon (match ordinaire, amical, trop loin). */
export function bigMatchOf(snap: FmSnapshot): BigMatch | null {
  const s = snap as FmSnapshot & { nextMatch?: Record<string, unknown> | null; custom?: { equipe?: Record<string, unknown> } };
  const next = s.nextMatch ?? null;
  const opponent = text(next?.opponent);
  const inDays = daysUntil(next?.inDays);
  if (!opponent || inDays == null || inDays > AHEAD_DAYS) return null;
  const competition = text(next?.competition);
  const ck = competitionKind(competition);
  if (ck === 'friendly') return null;
  const e = s.custom?.equipe ?? {};
  const position = rank(e.classementPosition);
  const opponentPosition = rank(e.advClassement);
  let kind: BigMatch['kind'] | null = null;
  if (ck === 'cup' || ck === 'europe') kind = ck;
  else if (position && opponentPosition) {
    if (opponentPosition === 1 || (position === 1 && opponentPosition <= 3)) kind = 'top';
    else if (Math.abs(position - opponentPosition) <= RIVAL_GAP && Math.max(position, opponentPosition) <= RIVAL_TOP) kind = 'rival';
  }
  if (!kind) return null;
  const loc = String(next?.location ?? '').toLowerCase();
  const home = /domicile|home/.test(loc) ? true : /ext[eé]rieur|away/.test(loc) ? false : null;
  let ourScorer: BigMatch['ourScorer'] = null;
  for (const p of s.players.map(normalizePlayer)) {
    const g = p.goals ?? 0;
    if (g > 0 && (!ourScorer || g > ourScorer.goals)) ourScorer = { id: p.id, name: p.name, goals: g };
  }
  const advGoals = Number(e.advButs);
  const theirName = text(e.advButeur);
  // Le rapport sur l'adversaire (adv*) n'est fiable que s'il porte sur ce match-là : le jeu le donne pour le prochain.
  return {
    kind,
    date: addDays(s.gameDate.slice(0, 10), inDays),
    inDays,
    club: s.club,
    opponent,
    competition,
    home,
    position: ck === 'league' || ck === 'other' ? position : null,
    opponentPosition: ck === 'league' || ck === 'other' ? opponentPosition : null,
    opponentManager: text(e.advEntraineur),
    ourScorer,
    theirScorer: theirName ? { name: theirName, goals: Number.isFinite(advGoals) && advGoals > 0 ? Math.round(advGoals) : null } : null,
    threat: text(next?.threatLevel),
  };
}

/** Affiche à annoncer dans l'historique : celle du dernier relevé (le prochain match), s'il y en a une. */
export function bigMatchNow(history: { gameDate: string; data: FmSnapshot }[]): BigMatch | null {
  const last = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate)).at(-1);
  return last ? bigMatchOf(last.data) : null;
}

/** Clé d'une affiche, pour ne l'envoyer qu'une fois. */
export const bigMatchKey = (m: BigMatch) => `${m.club}|${m.opponent}|${m.date}`;
