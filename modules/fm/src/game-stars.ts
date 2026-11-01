import type { PosCode } from './positions';
import type { FmSnapshot } from './snapshot';

/*
 * Étoiles des rôles lues dans le jeu (PositionalAbilitiesRoleTable, via chemins.json, 01/11/2026).
 * Clés de chemins.json : `etoiles_<POSTE>_<ip|oop>` dans la section joueur (et dans « profond ») ; chaque valeur
 * est une liste { CurrentAbilityStars: { MinValue, MaxValue }, TacticsRoleName, TacticsRoleID, ShortName }.
 * La valeur est sur 20 ; étoiles = (valeur − 10) / 2. Seuls les joueurs qui ont le poste répondent.
 *
 * Le plugin ne lit qu'un poste à la fois (lecture lourde) : Archivix garde, d'un instantané à l'autre,
 * la dernière table lue pour chaque joueur, poste et phase (`roleStars` de l'instantané).
 */

export type StarPhase = 'ip' | 'oop';
/** id du joueur → poste → phase → libellé FR du rôle normalisé → { valeur sur 20, date de jeu de la lecture }. */
export type RoleStars = Record<string, Partial<Record<PosCode, Partial<Record<StarPhase, Record<string, { v: number; at: string }>>>>>>;

type Raw = Record<string, unknown>;
const KEY = /^etoiles_(GB|DD|DC|DG|DLD|DLG|MDF|MD|MC|MG|MOD|MOC|MOG|BT)_(ip|oop)$/;

/** Libellé de rôle comparable (accents, apostrophes, casse). */
export const roleKey = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Caractères invisibles glissés dans certains libellés du jeu (« Défenseur central\u200b stoppeur »).
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();

/** Valeur sur 20 vers étoiles du jeu (0 à 5, par demi-étoile). */
export const starsFromValue = (v: number) => Math.max(0, Math.min(5, Math.round(v - 10) / 2));

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : null);

function rowsOf(v: unknown): Raw[] {
  let x = v;
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x);
    } catch {
      return [];
    }
  }
  return Array.isArray(x) ? (x as Raw[]) : [];
}

/** Tables lues dans cet instantané seulement. */
export function roleStarsIn(snap: FmSnapshot): RoleStars {
  const out: RoleStars = {};
  const custom = (snap as Raw).custom as Raw | null | undefined;
  const rows = custom && typeof custom === 'object' ? Object.values((custom.joueurs ?? {}) as Record<string, Raw>) : [];
  for (const r of rows) {
    if (!r || r.id == null) continue;
    for (const [k, v] of Object.entries(r)) {
      const m = k.match(KEY);
      if (!m) continue;
      const table: Record<string, { v: number; at: string }> = {};
      for (const e of rowsOf(v)) {
        const s = (e.CurrentAbilityStars ?? {}) as Raw;
        const val = num(s.MaxValue) ?? num(s.MinValue);
        const name = typeof e.TacticsRoleName === 'string' ? e.TacticsRoleName : null;
        if (val != null && name) table[roleKey(name)] = { v: val, at: snap.gameDate };
      }
      if (!Object.keys(table).length) continue;
      const pos = m[1] as PosCode;
      const ph = m[2] as StarPhase;
      ((out[String(r.id)] ??= {})[pos] ??= {})[ph] = table;
    }
  }
  return out;
}

/** Fusionne les tables : celles de `next` remplacent celles de `prev` pour le même joueur, poste et phase. */
export function mergeRoleStars(prev: RoleStars | null | undefined, next: RoleStars): RoleStars {
  const out: RoleStars = structuredClone(prev ?? {});
  for (const [id, byPos] of Object.entries(next))
    for (const [pos, byPh] of Object.entries(byPos ?? {}))
      for (const [ph, table] of Object.entries(byPh ?? {})) (((out[id] ??= {})[pos as PosCode] ??= {}) as Record<string, unknown>)[ph] = table;
  return out;
}

/** Instantané à enregistrer : ses tables fusionnées avec celles du précédent, rangées dans `roleStars`. */
export function carryRoleStars(snap: FmSnapshot, prev: FmSnapshot | null | undefined): FmSnapshot {
  const merged = mergeRoleStars(prev ? snapshotRoleStars(prev) : null, roleStarsIn(snap));
  return Object.keys(merged).length ? ({ ...snap, roleStars: merged } as FmSnapshot) : snap;
}

/** Tables de l'instantané : celles qu'il porte déjà (`roleStars`), complétées par celles lues dedans. */
export function snapshotRoleStars(snap: FmSnapshot): RoleStars {
  return mergeRoleStars((snap as Raw).roleStars as RoleStars | undefined, roleStarsIn(snap));
}
