import { monthsBetween } from './alerts';
import type { FmPlayer } from './player';
import { normalizePlayer, toNumber } from './player';
import type { FmSnapshot } from './snapshot';

/**
 * Vues « club » et « vestiaire » portées de la page Archivix : salaires, contrats, finances,
 * prêts, moral et accueil. Tout est calculé ici ; l'interface ne fait qu'afficher et traduire.
 */

const median = (xs: number[]) => {
  const w = [...xs].sort((a, b) => a - b);
  return w.length % 2 ? w[(w.length - 1) / 2]! : (w[w.length / 2 - 1]! + w[w.length / 2]!) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Hiérarchie des statuts du jeu, du plus haut au plus bas (texte FR ou EN du jeu). */
const STATUS_RANK = [
  /vedette|star/i,
  /important/i,
  /titulaire|regular starter|first.team/i,
  /secondaire|rotation/i,
  /remplaçant|backup|substitute/i,
  /prometteur|espoir|hot prospect/i,
  /jeune|youngster|youth/i,
  /indésirable|transfert|liste|not needed|transfer list/i,
];
export const statusRank = (s: string | null) => {
  const i = STATUS_RANK.findIndex((r) => r.test(s ?? ''));
  return i < 0 ? STATUS_RANK.length : i;
};
/** Joueur que le club cherche à faire partir (statut « indésirable », liste des transferts…). */
export const isUnwanted = (s: string | null) => /indésirable|transfert|liste|not needed|transfer list/i.test(s ?? '');

export const monthsLeft = (p: FmPlayer, gameDate: string) => (p.contractEnd ? monthsBetween(gameDate, p.contractEnd) : null);

/* ---------- Masse salariale ---------- */

export interface WageGroup {
  status: string;
  rank: number;
  players: FmPlayer[];
  sum: number;
  avg: number;
  median: number;
  level: number | null;
}
export type WageFlag =
  | { kind: 'over'; player: FmPlayer; ref: WageGroup }
  | { kind: 'under'; player: FmPlayer; group: WageGroup; ref: WageGroup }
  | { kind: 'release'; player: FmPlayer };

export interface WageReport {
  total: number;
  count: number;
  avg: number;
  top3: number;
  /** Salaires des contrats qui finissent dans 6 mois ou moins. */
  ending: { players: FmPlayer[]; sum: number };
  groups: WageGroup[];
  flags: WageFlag[];
  /** Salaire mensuel par point de niveau, du plus cher au moins cher. */
  costPerPoint: { player: FmPlayer; cost: number }[];
}

export function wageReport(players: FmPlayer[], gameDate: string): WageReport | null {
  const list = players.filter((p) => p.wage != null);
  if (!list.length) return null;
  const total = list.reduce((a, p) => a + p.wage!, 0);
  const byStatus = new Map<string, FmPlayer[]>();
  for (const p of list) {
    const k = p.squadStatus ?? '–';
    byStatus.set(k, [...(byStatus.get(k) ?? []), p]);
  }
  const groups: WageGroup[] = [...byStatus]
    .map(([status, ps]) => {
      const sorted = [...ps].sort((a, b) => b.wage! - a.wage!);
      const sum = sorted.reduce((a, p) => a + p.wage!, 0);
      return {
        status,
        rank: statusRank(status),
        players: sorted,
        sum,
        avg: sum / sorted.length,
        median: median(sorted.map((p) => p.wage!)),
        level: mean(sorted.map((p) => p.level).filter((x): x is number => x != null)),
      };
    })
    .sort((a, b) => a.rank - b.rank || b.avg - a.avg);

  // On compare au statut voisin (au moins 2 joueurs) avec un écart net, pour éviter le bruit des petits salaires.
  const flags: WageFlag[] = [];
  for (const g of groups)
    for (const p of g.players) {
      const higher = groups.filter((x) => x.rank < g.rank && x.players.length >= 2).at(-1);
      const lower = groups.find((x) => x.rank > g.rank && x.players.length >= 2);
      if (higher && p.wage! > higher.median * 1.3 && p.wage! - higher.median >= 50) flags.push({ kind: 'over', player: p, ref: higher });
      else if (lower && g.rank <= 2 && p.wage! < lower.median * 0.7 && lower.median - p.wage! >= 50) flags.push({ kind: 'under', player: p, group: g, ref: lower });
      if (isUnwanted(p.squadStatus) && p.wage! > 0) flags.push({ kind: 'release', player: p });
    }

  const ending = list.filter((p) => {
    const m = monthsLeft(p, gameDate);
    return m != null && m <= 6;
  });
  return {
    total,
    count: list.length,
    avg: total / list.length,
    top3: [...list]
      .sort((a, b) => b.wage! - a.wage!)
      .slice(0, 3)
      .reduce((a, p) => a + p.wage!, 0),
    ending: { players: ending, sum: ending.reduce((a, p) => a + p.wage!, 0) },
    groups,
    flags,
    costPerPoint: list
      .filter((p) => p.level)
      .map((p) => ({ player: p, cost: p.wage! / p.level! }))
      .sort((a, b) => b.cost - a.cost),
  };
}

/* ---------- Contrats ---------- */

export function contractsByYear(players: FmPlayer[]): { year: string; sum: number; players: FmPlayer[] }[] {
  const by = new Map<string, FmPlayer[]>();
  for (const p of players) {
    const y = p.contractEnd?.slice(0, 4) ?? '?';
    by.set(y, [...(by.get(y) ?? []), p]);
  }
  return [...by]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, ps]) => ({ year, players: ps, sum: ps.reduce((a, p) => a + (p.wage ?? 0), 0) }));
}

/** Contrats qui finissent dans `within` mois ou moins, les plus proches d'abord. */
export function upcomingContracts(players: FmPlayer[], gameDate: string, within: number): { player: FmPlayer; months: number }[] {
  return players
    .map((p) => ({ player: p, months: monthsLeft(p, gameDate) }))
    .filter((x): x is { player: FmPlayer; months: number } => x.months != null && x.months <= within)
    .sort((a, b) => a.months - b.months);
}

/* ---------- Finances ---------- */

export interface ClubFinances {
  wageBill: number;
  wageBudget: number | null;
  /** Marge mensuelle restante (négative = budget dépassé). */
  wageRoom: number | null;
  transferBudget: number | null;
  balance: number | null;
  boardConfidence: string | null;
  expectations: { label: string; status: string | null }[];
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function clubFinances(snap: FmSnapshot, players: FmPlayer[]): ClubFinances {
  const club = { ...((snap.finances ?? {}) as Record<string, unknown>), ...((snap.clubInfo ?? {}) as Record<string, unknown>) };
  const wageBill = players.reduce((a, p) => a + (p.wage ?? 0), 0);
  const wageBudget = toNumber(club.wageBudget);
  const remaining = toNumber(club.remainingWageBudget);
  const raw = Array.isArray(club.expectations) ? (club.expectations as unknown[]) : [];
  return {
    wageBill,
    wageBudget,
    wageRoom: remaining ?? (wageBudget != null ? wageBudget - wageBill : null),
    transferBudget: toNumber(club.transferBudget),
    balance: toNumber(club.balance),
    boardConfidence: str(club.boardConfidence),
    expectations: raw
      .map((e) => (typeof e === 'string' ? { label: e, status: null } : { label: str((e as Record<string, unknown>)?.label) ?? '', status: str((e as Record<string, unknown>)?.status) }))
      .filter((e) => e.label),
  };
}

/** Ton d'un statut du board : atteint, en danger, ou entre les deux. */
export const boardTone = (s: string | null): 'good' | 'bad' | 'warn' =>
  /dépass|atteint|excell|ravi|très bien|exceed|achiev|delight/i.test(s ?? '') ? 'good' : /échec|déçu|insuffis|danger|loin|fail|disappoint/i.test(s ?? '') ? 'bad' : 'warn';

/* ---------- Prêts ---------- */

export interface Loan {
  player: FmPlayer;
  club: string | null;
  apps: number | null;
  goals: number | null;
  rating: number | null;
  end: string | null;
  verdict: 'idle' | 'shines' | 'plays';
}

export function loans(snap: FmSnapshot): Loan[] {
  const raw = Array.isArray(snap.loans) ? (snap.loans as Record<string, unknown>[]) : [];
  return raw.map((x) => {
    const apps = toNumber(x.loanApps);
    const rating = toNumber(x.loanRating);
    return {
      player: normalizePlayer(x as never),
      club: str(x.loanClub),
      apps,
      goals: toNumber(x.loanGoals),
      rating,
      end: str(x.loanEnd),
      verdict: (apps ?? 0) < 3 ? 'idle' : (rating ?? 0) >= 6.9 ? 'shines' : 'plays',
    };
  });
}

/* ---------- Vestiaire ---------- */

const MORALE: [RegExp, number][] = [
  [/superbe|excellent|superb/i, 5],
  [/très bon|very good/i, 4],
  [/\bbon\b|\bgood\b/i, 3],
  [/correct|moyen|okay|normal|average/i, 2],
  [/médiocre|faible|bas|poor|low/i, 1],
  [/mauvais|catastroph|terrible|very poor|abysmal/i, 0],
];
/** Moral du jeu ramené à une échelle 0 (mauvais) → 5 (superbe). */
export const moraleLevel = (m: string | null): number | null => (m ? (MORALE.find(([r]) => r.test(m))?.[1] ?? null) : null);

export interface DressingRoom {
  hasMorale: boolean;
  avgMorale: number | null;
  unhappy: FmPlayer[];
  /** Nombre de joueurs par niveau de moral, du meilleur (5) au pire (0). */
  counts: { level: number; count: number }[];
  leaders: FmPlayer[];
  strongLeaders: number;
  hierarchy: { status: string; players: FmPlayer[] }[];
}

export function dressingRoom(players: FmPlayer[]): DressingRoom {
  const levels = players.map((p) => moraleLevel(p.morale));
  const known = levels.filter((x): x is number => x != null);
  const lead = (p: FmPlayer) => (p.attributes.Leadership ?? 0) + (p.attributes.Determination ?? 0) / 2;
  const leaders = players
    .filter((p) => p.attributes.Leadership != null)
    .sort((a, b) => lead(b) - lead(a))
    .slice(0, 5);
  const byStatus = new Map<string, FmPlayer[]>();
  for (const p of players) byStatus.set(p.squadStatus ?? '–', [...(byStatus.get(p.squadStatus ?? '–') ?? []), p]);
  return {
    hasMorale: known.length > 0,
    avgMorale: known.length ? Math.round(mean(known)!) : null,
    unhappy: players.filter((p) => {
      const l = moraleLevel(p.morale);
      return l != null && l <= 1;
    }),
    counts: [5, 4, 3, 2, 1, 0].map((level) => ({ level, count: levels.filter((l) => l === level).length })),
    leaders,
    strongLeaders: leaders.filter((p) => (p.attributes.Leadership ?? 0) >= 12).length,
    hierarchy: [...byStatus].map(([status, ps]) => ({ status, players: ps })).sort((a, b) => statusRank(a.status) - statusRank(b.status)),
  };
}

/* ---------- Accueil ---------- */

export type HomeAlert =
  | { kind: 'injured'; player: FmPlayer; detail: string }
  | { kind: 'contract'; player: FmPlayer; months: number }
  | { kind: 'condition'; player: FmPlayer; condition: number }
  | { kind: 'status'; player: FmPlayer; detail: string };

export interface HomeOverview {
  alerts: HomeAlert[];
  /** Fins de contrat regroupées quand il y en a au moins 3. */
  contracts: FmPlayer[] | null;
  top: FmPlayer[];
  young: FmPlayer[];
}

export function homeOverview(players: FmPlayer[], gameDate: string): HomeOverview {
  const alerts: HomeAlert[] = [];
  for (const p of players) if (p.injury) alerts.push({ kind: 'injured', player: p, detail: p.injury + (p.injuryDays ? ` (${p.injuryDays} j)` : '') });
  const contracts = upcomingContracts(players, gameDate, 6);
  const grouped = contracts.length >= 3;
  if (!grouped) for (const c of contracts) alerts.push({ kind: 'contract', player: c.player, months: c.months });
  for (const p of players) if (!p.injury && p.condition != null && p.condition < 80) alerts.push({ kind: 'condition', player: p, condition: p.condition });
  for (const p of players) if (isUnwanted(p.squadStatus)) alerts.push({ kind: 'status', player: p, detail: p.squadStatus! });
  const byLevel = [...players].filter((p) => p.level != null).sort((a, b) => b.level! - a.level!);
  return {
    alerts,
    contracts: grouped ? contracts.map((c) => c.player) : null,
    top: byLevel.slice(0, 5),
    young: byLevel.filter((p) => p.age != null && p.age <= 21).slice(0, 4),
  };
}
