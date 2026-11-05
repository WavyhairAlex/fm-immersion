import { lineOf, type Line, type PosCode } from './positions';
import type { FmPlayer } from './player';
import type { FormationPlan, Slot } from './tactic';

/**
 * Numéros de maillot proposés pour la saison : les titulaires (équipe A) prennent les numéros classiques 1 à 11
 * selon leur poste, leurs doublures (équipe B, même schéma) le numéro du titulaire + 10 (12 à 21), le gardien
 * remplaçant le 30. Le reste de l'effectif suit à partir de 22, ligne par ligne (gardiens, défense, milieu,
 * attaque), le mieux noté d'abord ; les autres gardiens prennent 40, 50…
 */

export type ShirtTier = 'A' | 'B' | 'squad';

export interface ShirtNumber {
  number: number;
  player: FmPlayer;
  tier: ShirtTier;
  /** Poste du créneau (titulaires et doublures) ou poste principal du joueur. */
  pos: PosCode | null;
  /** Créneau du schéma (titulaires et doublures). */
  slot: number | null;
}

/** Numéros classiques par poste, du plus attendu au moins attendu. */
const PREFS: Record<PosCode, number[]> = {
  GB: [1],
  DD: [2],
  DLD: [2],
  DG: [3],
  DLG: [3],
  DC: [4, 5, 6],
  MDF: [6, 8, 4, 5],
  MC: [8, 6, 10, 4],
  MD: [7],
  MOD: [7],
  MG: [11],
  MOG: [11],
  MOC: [10, 8],
  BT: [9, 10, 11, 7],
};

/** Ordre de distribution : les postes au numéro le plus marqué servent d'abord, l'axe défensif en dernier. */
const ORDER: PosCode[] = ['GB', 'DD', 'DLD', 'DG', 'DLG', 'BT', 'MD', 'MOD', 'MG', 'MOG', 'MOC', 'MDF', 'MC', 'DC'];

/** Numéro 1 à 11 de chaque créneau du schéma (même ordre que `slots`). */
export function slotNumbers(slots: Pick<Slot, 'pos' | 'x' | 'y'>[]): number[] {
  const out: number[] = slots.map(() => 0);
  const free = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const idx = slots.map((_, i) => i);
  // À poste égal : le plus axial d'abord (l'avant-centre prend le 9), puis le plus haut, puis de droite à gauche.
  idx.sort((a, b) => {
    const sa = slots[a]!;
    const sb = slots[b]!;
    return ORDER.indexOf(sa.pos) - ORDER.indexOf(sb.pos) || Math.abs(sa.x - 50) - Math.abs(sb.x - 50) || sa.y - sb.y || sb.x - sa.x;
  });
  const rest: number[] = [];
  for (const i of idx) {
    const n = PREFS[slots[i]!.pos].find((k) => free.has(k));
    if (n == null) {
      rest.push(i);
      continue;
    }
    out[i] = n;
    free.delete(n);
  }
  // Schéma inhabituel : le plus petit numéro libre.
  for (const i of rest) {
    const n = Math.min(...free);
    out[i] = Number.isFinite(n) ? n : 0;
    free.delete(n);
  }
  return out;
}

const LINE_RANK: Record<Line, number> = { GB: 0, DEF: 1, MIL: 2, ATT: 3 };

/**
 * Numéros pour l'effectif présent au club (prêtés exclus par l'appelant) : `a` = onze titulaire, `b` = meilleur
 * onze sans les titulaires, même schéma. Chaque joueur a un numéro, aucun numéro n'est donné deux fois.
 */
export function shirtNumbers(a: FormationPlan, b: FormationPlan | null, players: FmPlayer[]): ShirtNumber[] {
  const out: ShirtNumber[] = [];
  const used = new Set<number>();
  const done = new Set<string>();
  const give = (number: number, player: FmPlayer, tier: ShirtTier, pos: PosCode | null, slot: number | null) => {
    out.push({ number, player, tier, pos, slot });
    used.add(number);
    done.add(player.id);
  };
  const nums = slotNumbers(a.slots);
  a.slots.forEach((sl, i) => {
    if (sl.player && nums[i]) give(nums[i]!, sl.player, 'A', sl.pos, i);
  });
  // Doublure du créneau i de B : même poste que le titulaire du créneau i de A.
  b?.slots.forEach((sl, i) => {
    const p = sl.player;
    const n = nums[i];
    if (!p || !n || done.has(p.id)) return;
    const k = sl.pos === 'GB' ? 30 : n + 10;
    if (!used.has(k)) give(k, p, 'B', sl.pos, i);
  });
  // Les gardiens suivants : 40, 50… ; les autres à partir de 22, en sautant les dizaines rondes gardées aux gardiens.
  const rest = players
    .filter((p) => !done.has(p.id))
    .map((p) => ({ p, pos: p.positions[0] ?? null }))
    .map((r) => ({ ...r, line: r.p.line ?? (r.pos ? lineOf(r.pos) : 'MIL') }))
    .sort((x, y) => LINE_RANK[x.line] - LINE_RANK[y.line] || (y.p.level ?? 0) - (x.p.level ?? 0) || x.p.name.localeCompare(y.p.name));
  let gk = 40;
  let next = 22;
  for (const r of rest) {
    if (r.line === 'GB') {
      while (used.has(gk)) gk += 10;
      give(gk, r.p, 'squad', r.pos, null);
      continue;
    }
    while (used.has(next) || next % 10 === 0) next++;
    give(next, r.p, 'squad', r.pos, null);
  }
  return out.sort((x, y) => x.number - y.number);
}
