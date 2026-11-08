import { normalizePlayer, type FmPlayer } from './player';
import type { FmSnapshot } from './snapshot';

type Entry = { gameDate: string; data: FmSnapshot };

/** Dépêche : une nouvelle qui ne peut pas attendre la gazette de la semaine. */
export interface BreakingNews {
  kind: 'signing' | 'exit' | 'injury';
  /** Jour de jeu où le plugin l'a vue (ISO). */
  date: string;
  club: string;
  id: string;
  name: string;
  age: number | null;
  position: string | null;
  /** Rang du joueur dans l'effectif par niveau (1 = le meilleur). */
  rank: number;
  injury: string | null;
  days: number | null;
}

/** Joueurs qui comptent : les onze meilleurs de l'effectif (par niveau) pour un transfert, les quatorze pour une blessure. */
const SIGNING_RANK = 11;
const INJURY_RANK = 14;
/** Une blessure fait une dépêche à partir de quatre semaines d'absence. */
const INJURY_DAYS = 28;

const ranked = (s: FmSnapshot) => {
  const ps = s.players.map(normalizePlayer);
  const order = [...ps].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  return new Map<string, { p: FmPlayer; rank: number }>(order.map((p, i) => [p.id, { p, rank: i + 1 }]));
};

/**
 * Dépêches de l'historique, de la plus récente à la plus ancienne, d'un relevé au suivant du même club : arrivée ou
 * départ d'un joueur du onze (par niveau), blessure de quatre semaines ou plus d'un joueur important. Les jeunes du
 * centre de formation, arrivés en groupe, n'en font pas (ils ont leur brève dans la gazette).
 */
export function breakingNews(history: Entry[]): BreakingNews[] {
  const sorted = [...history].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  const days: BreakingNews[][] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!.data;
    const cur = sorted[i]!;
    if (prev.club !== cur.data.club) continue;
    const before = ranked(prev);
    const after = ranked(cur.data);
    const out: BreakingNews[] = [];
    const news = (kind: BreakingNews['kind'], p: FmPlayer, rank: number): BreakingNews => ({
      kind,
      date: cur.gameDate,
      club: cur.data.club,
      id: p.id,
      name: p.name,
      age: p.age ?? null,
      position: p.positionsLabel || null,
      rank,
      injury: p.injury ?? null,
      days: p.injuryDays ?? null,
    });
    const arrivals = [...after.values()].filter((x) => !before.has(x.p.id));
    const intake = arrivals.filter((x) => x.p.age != null && x.p.age <= 17).length >= 3;
    for (const x of arrivals) if (x.rank <= SIGNING_RANK && !(intake && (x.p.age ?? 99) <= 17)) out.push(news('signing', x.p, x.rank));
    for (const x of before.values()) if (!after.has(x.p.id) && x.rank <= SIGNING_RANK) out.push(news('exit', x.p, x.rank));
    for (const x of after.values()) {
      const old = before.get(x.p.id);
      if (old && x.p.injury && !old.p.injury && (x.p.injuryDays ?? 0) >= INJURY_DAYS && old.rank <= INJURY_RANK) out.push(news('injury', x.p, old.rank));
    }
    days.push(out);
  }
  // Jour le plus récent d'abord ; dans une journée, recrues, puis départs, puis blessures.
  return days.reverse().flat();
}
