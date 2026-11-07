import type { FmSnapshot } from './snapshot';

type Raw = Record<string, unknown>;

const text = (v: unknown) => (typeof v === 'string' && v.trim() && !v.startsWith('SI.') ? v.trim() : null);

/** Libellé d'équipe première tel que le jeu l'écrit (« Équipe prem. », « First Team », « Senior », « Équipe A »). */
const FIRST_TEAM = /prem|first|senior|^(équipe |equipe |team )?a$/i;

/**
 * Équipe du club de chaque joueur, lue par chemins.json (joueur : `equipe` = PrimaryClubTeam/Name, `equipeType` =
 * PrimaryClubTeam/TeamTypeStringDefault, 07/11/2026 ; le jeu écrit « Équipe prem. », « Équipe U19 », « Équipe réserve »…).
 * FM27 range tous les joueurs sous contrat dans un seul effectif : sans cette lecture, les jeunes et la réserve
 * se mêlaient à l'équipe première (compos, mercato, temps de jeu).
 *
 * Renvoie id → nom de l'équipe pour les joueurs qui ne sont PAS dans l'équipe première ; les autres sont absents.
 * Sans ces chemins, repli prudent : un « Jeune joueur » de 18 ans ou moins sans numéro de maillot est compté
 * dans les jeunes (« Jeunes »).
 */
export function otherTeamOf(snap: FmSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  const custom = (snap as Raw).custom as { joueurs?: Record<string, Raw> } | null | undefined;
  let read = false;
  for (const [key, row] of Object.entries(custom?.joueurs ?? {})) {
    if (!row || typeof row !== 'object') continue;
    const name = text(row.equipe);
    const type = text(row.equipeType);
    if (!name && !type) continue;
    read = true;
    const first = type ? FIRST_TEAM.test(type) : name === snap.club;
    if (!first) out.set(String(row.id ?? key), name ?? type!);
  }
  if (read) return out;
  for (const p of (Array.isArray(snap.players) ? snap.players : []) as Raw[]) {
    const status = typeof p.squadStatus === 'string' ? p.squadStatus : '';
    const num = typeof p.squadNumber === 'number' ? p.squadNumber : null;
    const age = typeof p.age === 'number' ? p.age : null;
    if (/jeune|youth/i.test(status) && (num == null || num < 0) && age != null && age <= 18) out.set(String(p.id), 'Jeunes');
  }
  return out;
}

/** Instantané réduit à l'équipe première : sans la réserve ni les jeunes (voir `otherTeamOf`). */
export function firstTeamSnapshot(snap: FmSnapshot): FmSnapshot {
  const others = otherTeamOf(snap);
  return others.size ? { ...snap, players: snap.players.filter((p) => !others.has(String(p.id))) } : snap;
}
