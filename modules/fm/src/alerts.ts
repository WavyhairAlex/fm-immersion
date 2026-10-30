import type { DashboardAlert, DashboardCard } from '@simloom/shared';
import type { FmPlayer } from './player';

/** Mois entiers entre deux dates ISO (date du jeu → fin de contrat). */
export function monthsBetween(from: string, to: string): number {
  const a = new Date(from);
  const b = new Date(to);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) - (b.getDate() < a.getDate() ? 1 : 0);
}

export interface FmAlertCounts {
  /** Contrats qui finissent dans 6 mois ou moins : à prolonger ou à vendre. */
  expiring: FmPlayer[];
  injured: FmPlayer[];
  /** Condition physique sous 80 % : à ménager au prochain match. */
  tired: FmPlayer[];
}

export function alertGroups(players: FmPlayer[], gameDate: string): FmAlertCounts {
  return {
    expiring: players.filter((p) => p.contractEnd && monthsBetween(gameDate, p.contractEnd) <= 6),
    injured: players.filter((p) => p.injury),
    tired: players.filter((p) => !p.injury && p.condition != null && p.condition < 80),
  };
}

/**
 * Carte du tableau de bord : seulement ce qui demande une action, trié par urgence.
 * Les titres sont des clés i18n ; l'interface les traduit avec `count` et `names`.
 */
export function fmDashboardCard(players: FmPlayer[], gameDate: string, club: string): DashboardCard {
  const g = alertGroups(players, gameDate);
  const names = (list: FmPlayer[]) => list.slice(0, 3).map((p) => p.name).join(', ');
  const alerts: DashboardAlert[] = [];
  if (g.injured.length) alerts.push({ level: 'urgent', title: 'fm.alert.injured', detail: names(g.injured) });
  if (g.expiring.length) alerts.push({ level: 'warning', title: 'fm.alert.expiring', detail: names(g.expiring) });
  if (g.tired.length) alerts.push({ level: 'warning', title: 'fm.alert.tired', detail: names(g.tired) });
  return { alerts: alerts.slice(0, 4), meta: club };
}
