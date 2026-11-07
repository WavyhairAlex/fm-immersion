import { statusRank } from './club';
import type { FmPlayer } from './player';
import { officialResults } from './results';
import type { FmSnapshot } from './snapshot';

/*
 * Temps de jeu promis : le statut donné au joueur dans FM27 (vedette, titulaire, rotation…) vaut une promesse de
 * temps de jeu, et le joueur se plaint quand elle n'est pas tenue. On compare ici ce statut à la part des minutes
 * qu'il a jouées sur les matchs suivis de la saison, sans compter ceux où il était blessé ou suspendu à la veille.
 * Les seuils sont des repères de FM Immersion (le jeu ne publie pas les siens) : à lire comme une alerte précoce.
 */

/** Part des minutes attendue selon le rang de statut (`statusRank` : vedette, important, titulaire, rotation,
 * remplaçant, espoir, jeune) ; au-delà (indésirable, inconnu), pas de promesse. */
export const PROMISED_SHARE = [0.7, 0.6, 0.5, 0.25, 0.1, 0.05, 0] as const;
/** En dessous de ce nombre de matchs disponibles, trop tôt pour juger. */
export const PLAYTIME_MIN_MATCHES = 5;
/** Marge avant d'alerter : 80 % de la part promise. */
export const PLAYTIME_TOLERANCE = 0.8;

export type PlaytimeVerdict = 'short' | 'ok' | 'over' | 'early' | 'none';

export interface PlaytimeRow {
  player: FmPlayer;
  /** Part des minutes promise par le statut (0 à 1), ou null sans promesse. */
  expected: number | null;
  /** Part des minutes jouées sur les matchs où il était disponible. */
  share: number | null;
  minutes: number;
  starts: number;
  /** Matchs de l'équipe où il était au club et disponible. */
  available: number;
  verdict: PlaytimeVerdict;
  /** Statut que son temps de jeu correspond le mieux (rang `statusRank`), pour les joueurs « over ». */
  earnedRank: number | null;
}

export interface PlaytimeReport {
  /** Matchs suivis de la saison (détail ou regroupés). */
  matches: number;
  rows: PlaytimeRow[];
}

type Entry = { gameDate: string; data: FmSnapshot };

/** 1er juillet de la saison de `gameDate`. */
const seasonFrom = (gameDate: string) => {
  const y = Number(gameDate.slice(0, 4));
  const m = Number(gameDate.slice(5, 7));
  return `${m >= 7 ? y : y - 1}-07-01`;
};

const out = (raw: { injury?: unknown; suspension?: unknown } | undefined) => !!raw && (!!raw.injury || !!raw.suspension);

/** Un match suivi vu pour le temps de jeu : joueurs au club avant le match, indisponibles, et qui a joué combien. */
export interface PlaytimeMatch {
  matches: number;
  squad: ReadonlySet<string>;
  out: ReadonlySet<string>;
  played: { id: string; minutes: number; started: boolean }[];
}

/** Matchs suivis de la saison en cours (depuis le 1er juillet), tirés de l'historique des instantanés. */
export function playtimeMatches(history: Entry[]): PlaytimeMatch[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const from = seasonFrom(sorted.at(-1)?.gameDate ?? '');
  const byDate = new Map(sorted.map((e) => [e.data.gameDate, e.data]));
  return officialResults(sorted)
    .filter((r) => r.since >= from)
    .map((r) => {
      const before = byDate.get(r.since)?.players ?? [];
      return {
        matches: r.matches,
        squad: new Set(before.map((p) => String(p.id))),
        out: new Set(before.filter((p) => out(p as { injury?: unknown; suspension?: unknown })).map((p) => String(p.id))),
        played: r.players.map((p) => ({ id: p.id, minutes: p.minutes, started: p.started })),
      };
    });
}

export function playingTime(players: FmPlayer[], history: Entry[]): PlaytimeReport {
  return playtimeReport(players, playtimeMatches(history));
}

export function playtimeReport(players: FmPlayer[], list: PlaytimeMatch[]): PlaytimeReport {
  const avail = new Map<string, number>();
  const mins = new Map<string, number>();
  const starts = new Map<string, number>();
  let matches = 0;
  for (const m of list) {
    matches += m.matches;
    const played = new Map(m.played.map((p) => [p.id, p]));
    for (const id of new Set([...m.squad, ...played.keys()])) {
      const mp = played.get(id);
      // Au club avant le match et ni blessé ni suspendu à la veille ; s'il a joué, il était disponible.
      if (!mp && m.out.has(id)) continue;
      avail.set(id, (avail.get(id) ?? 0) + m.matches);
      if (mp) {
        mins.set(id, (mins.get(id) ?? 0) + mp.minutes);
        if (mp.started) starts.set(id, (starts.get(id) ?? 0) + 1);
      }
    }
  }
  const rows: PlaytimeRow[] = players.map((player) => {
    const rank = statusRank(player.squadStatus);
    const expected = rank < PROMISED_SHARE.length ? PROMISED_SHARE[rank]! : null;
    const available = avail.get(player.id) ?? 0;
    const minutes = mins.get(player.id) ?? 0;
    const share = available ? Math.min(1, minutes / (90 * available)) : null;
    let verdict: PlaytimeVerdict = 'none';
    let earnedRank: number | null = null;
    if (expected != null) {
      if (available < PLAYTIME_MIN_MATCHES || share == null) verdict = 'early';
      else if (share < expected * PLAYTIME_TOLERANCE) verdict = 'short';
      else {
        // Joue comme un statut au-dessus du sien (deux crans au moins) : il réclamera un meilleur statut ou contrat.
        const earned = PROMISED_SHARE.findIndex((x) => share >= x);
        earnedRank = earned >= 0 ? earned : null;
        verdict = earnedRank != null && earnedRank <= rank - 2 ? 'over' : 'ok';
      }
    }
    return { player, expected, share, minutes, starts: starts.get(player.id) ?? 0, available, verdict, earnedRank };
  });
  const order: Record<PlaytimeVerdict, number> = { short: 0, over: 1, ok: 2, early: 3, none: 4 };
  rows.sort((a, b) => order[a.verdict] - order[b.verdict] || (a.share ?? 0) - (a.expected ?? 0) - ((b.share ?? 0) - (b.expected ?? 0)));
  return { matches, rows };
}
