import type { Decision } from './decisions';
import type { FmPlayer } from './player';
import { leagueFixturesLeft } from './season';
import type { FmSnapshot } from './snapshot';
import { addDays } from './training';

/*
 * Plan d'intersaison : l'été remis dans l'ordre, de la fin du championnat à la reprise. Il range les décisions
 * déjà calculées (contrats, départs, recrutement) par étape et fait les comptes du mercato : salaires libérés par
 * les départs, marge salariale qui en résulte, valeur des ventes conseillées. Rien de nouveau n'est décidé ici.
 */

export interface OffseasonPlan {
  /** Fin de saison constatée (plus aucun match de championnat d'après le plugin). */
  seasonOver: boolean;
  /** Début de la présaison (4 semaines avant la reprise) et reprise du championnat (ISO). Les départs et le
   * recrutement sont à boucler avant la reprise, comme dans les décisions (fenêtre d'été). */
  preseason: string;
  restart: string;
  /** Première fin de contrat à trancher (ISO), ou null. */
  contractsBy: string | null;
  contracts: Decision[];
  departures: Decision[];
  recruits: Decision[];
  /** Joueurs qui partent si l'on suit le plan (contrats non prolongés, ventes, prêts, départs signalés). */
  leaving: FmPlayer[];
  /** Somme des salaires des partants (même unité que le jeu), null si aucun salaire connu. */
  wagesFreed: number | null;
  /** Marge salariale après leurs départs, si le jeu donne la marge actuelle. */
  wageRoomAfter: number | null;
  /** Valeur des joueurs à vendre (ventes conseillées), null si inconnue. */
  saleValue: number | null;
  transferBudget: number | null;
}

/** Actions qui font partir le joueur (premier joueur de la décision). */
const LEAVES = new Set(['letGo', 'sellNow', 'sell', 'release', 'loan', 'replaceLeaving', 'leavingCovered']);
const SELLS = new Set(['sellNow', 'sell']);

const sum = (xs: (number | null)[]) => {
  const known = xs.filter((x): x is number => x != null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
};

/** Prochaine reprise du championnat : le 1er du mois de reprise qui suit la date de jeu. */
export function nextRestart(gameDate: string, seasonStart = 8): string {
  const y = Number(gameDate.slice(0, 4));
  const at = (year: number) => `${year}-${String(seasonStart).padStart(2, '0')}-01`;
  return at(y) > gameDate.slice(0, 10) ? at(y) : at(y + 1);
}

/** Jours avant la reprise pendant lesquels le plan est proposé, même si le plugin ne lit pas le calendrier. */
export const OFFSEASON_DAYS = 100;

/**
 * Le plan d'intersaison a-t-il lieu d'être ? Oui quand le championnat est fini (plus aucun match restant), ou à
 * défaut de calendrier quand la reprise est à moins de `OFFSEASON_DAYS` jours.
 */
export function offseasonDue(snap: FmSnapshot, seasonStart = 8): boolean {
  const left = leagueFixturesLeft(snap);
  if (left != null) return left === 0;
  const days = (Date.parse(nextRestart(snap.gameDate, seasonStart)) - Date.parse(snap.gameDate.slice(0, 10))) / 864e5;
  return days <= OFFSEASON_DAYS;
}

export function offseasonPlan(
  snap: FmSnapshot,
  decisions: Decision[],
  players: FmPlayer[],
  budget: { wageRoom: number | null; transferBudget: number | null },
  seasonStart = 8,
  leavingIds: ReadonlySet<string> = new Set(),
): OffseasonPlan {
  const restart = nextRestart(snap.gameDate, seasonStart);
  const contracts = decisions.filter((d) => d.kind === 'contract');
  const departures = decisions.filter((d) => d.kind === 'departure');
  const recruits = decisions.filter((d) => d.kind === 'recruit');
  const byId = new Map<string, FmPlayer>();
  for (const d of [...contracts, ...departures]) {
    const p = d.players[0];
    if (p && LEAVES.has(d.action)) byId.set(p.id, p);
  }
  for (const p of players) if (leavingIds.has(p.id)) byId.set(p.id, p);
  const leaving = [...byId.values()];
  const wagesFreed = sum(leaving.map((p) => p.wage));
  const sold = new Set<string>();
  for (const d of [...contracts, ...departures]) if (SELLS.has(d.action) && d.players[0]) sold.add(d.players[0].id);
  const saleValue = sum(leaving.filter((p) => sold.has(p.id)).map((p) => p.value));
  const contractsBy = contracts.map((d) => d.deadline).filter((x): x is string => !!x).sort()[0] ?? null;
  return {
    seasonOver: leagueFixturesLeft(snap) === 0,
    preseason: addDays(restart, -28),
    restart,
    contractsBy,
    contracts,
    departures,
    recruits,
    leaving,
    wagesFreed,
    wageRoomAfter: budget.wageRoom != null ? budget.wageRoom + (wagesFreed ?? 0) : null,
    saleValue,
    transferBudget: budget.transferBudget,
  };
}
