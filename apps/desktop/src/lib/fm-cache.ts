import type { FmSnapshot } from '@fm-immersion/module-fm';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { fmData } from './data';

/**
 * Historique complet d'une partie (tous les instantanés), partagé par tous les écrans sous une seule clé.
 *
 * Il pèse lourd sur une longue carrière (environ 600 Ko par jour de jeu) : il est lu une fois, puis tenu à jour
 * sur place à chaque nouvel instantané (`noteImported`) au lieu d'être relu en entier. Une relecture complète
 * n'a lieu qu'après une invalidation explicite (rattrapage de l'historique, import à la demande).
 */
export const allKey = (saveId: string) => ['fm', saveId, 'all'] as const;

export interface HistoryRow {
  gameDate: string;
  data: FmSnapshot;
}

const options = (saveId: string) => ({
  queryKey: allKey(saveId),
  queryFn: () => fmData.all(saveId) as Promise<HistoryRow[]>,
  staleTime: Infinity,
  gcTime: 30 * 60_000,
});

/** Historique de la partie pour un écran. */
export function useHistory(saveId: string) {
  return useQuery({ ...options(saveId), enabled: !!saveId });
}

/** Historique de la partie hors d'un écran (envoi automatique de la gazette) : lu dans le cache s'il y est. */
export function fetchHistory(qc: QueryClient, saveId: string) {
  return qc.fetchQuery(options(saveId));
}

/** Remplace (même date) ou ajoute un instantané dans une liste triée par date. */
export function upsertHistory(rows: HistoryRow[], row: HistoryRow): HistoryRow[] {
  const i = rows.findIndex((r) => r.gameDate === row.gameDate);
  if (i >= 0) return rows.map((r, j) => (j === i ? row : r));
  return [...rows, row].sort((a, b) => (a.gameDate < b.gameDate ? -1 : a.gameDate > b.gameDate ? 1 : 0));
}

/**
 * Après l'import d'un instantané : l'historique en cache est mis à jour sur place, les autres requêtes de la
 * partie (dernier instantané, réglages, cibles…) sont relues.
 */
export function noteImported(qc: QueryClient, saveId: string, snap: FmSnapshot) {
  qc.setQueryData<HistoryRow[]>(allKey(saveId), (old) => (old ? upsertHistory(old, { gameDate: snap.gameDate, data: snap }) : old));
  qc.invalidateQueries({ queryKey: ['fm', saveId], predicate: (q) => q.queryKey[2] !== 'all' });
}
