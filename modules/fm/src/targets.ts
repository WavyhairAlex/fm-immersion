import { starsOf } from './lineup';
import { normalizePlayer, toNumber, type FmPlayer } from './player';
import { range, type Range } from './project';
import { fmPlayerSchema, type FmSnapshot } from './snapshot';

/**
 * Cibles du mercato : joueurs d'autres clubs que le joueur suit dans FM27 (liste de suivi, cibles du recrutement),
 * lus par le plugin 0.4.0 (réglage LireCibles, bloc `shortlist` de l'instantané). Simloom les garde dans sa base
 * (table fm_targets) : une cible retirée de la liste du jeu reste consultable, avec la date où elle a été vue.
 */

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Avis du recrutement sur une cible (champs absents si le jeu ne les donne pas). */
export interface ScoutView {
  /** Connaissance du joueur par le recrutement, en % (0-100). */
  knowledge: number | null;
  /** Étoiles de niveau et de potentiel (sur 5), vues par les recruteurs ou à défaut par le staff. */
  stars: { current: number | null; potential: number | null } | null;
  recommendation: string | null;
  bestPosition: string | null;
  bestRole: string | null;
  value: Range | null;
  wage: Range | null;
  interestedClubs: number | null;
  transferStatus: string | null;
}

export type Target = FmPlayer & {
  club: string | null;
  projectedEffectiveness: Range | null;
  scout: ScoutView | null;
  /** Listes du jeu où figure le joueur (`listeSuivi`, `cibles`…). */
  sources: string[];
};

/** Texte d'une valeur du jeu : texte, nombre, ou libellé d'un objet brut. */
function label(v: unknown): string | null {
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return str(v);
  if (v && typeof v === 'object') {
    const o = v as Raw;
    for (const k of ['Name', 'name', 'String', 'Text', 'DisplayValue', 'RoleName', 'ShortName']) if (str(o[k])) return str(o[k]);
  }
  return null;
}

function scoutOf(raw: unknown): ScoutView | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Raw;
  const knowledge = toNumber(s.knowledge);
  const cur = starsOf(s.scoutCurrentStars) ?? starsOf(s.currentStars);
  const pot = starsOf(s.scoutPotentialStars) ?? starsOf(s.potentialStars);
  const between = (lo: unknown, hi: unknown) => range({ min: toNumber(lo), max: toNumber(hi) });
  return {
    knowledge: knowledge == null ? null : Math.max(0, Math.min(100, knowledge)),
    stars: cur == null && pot == null ? null : { current: cur, potential: pot },
    recommendation: label(s.recommendationText) ?? label(s.recommendation),
    bestPosition: label(s.bestPosition),
    bestRole: label(s.bestRole),
    value: between(s.minValue, s.maxValue),
    wage: between(s.minWage, s.maxWage),
    interestedClubs: toNumber(s.interestedClubs),
    transferStatus: label(s.transferStatus),
  };
}

/** Une cible brute (élément du bloc `shortlist`) normalisée comme un joueur de l'effectif. */
export function targetOf(x: unknown): Target | null {
  const r = fmPlayerSchema.safeParse(x);
  if (!r.success) return null;
  const o = x as Raw;
  const scout = scoutOf(o.scout);
  const p = normalizePlayer(r.data);
  return {
    ...p,
    id: `t${r.data.id}`,
    club: str(o.club),
    projectedEffectiveness: range(o.projectedEffectiveness),
    scout,
    stars: p.stars ?? scout?.stars ?? null,
    personality: p.personality ?? (o.scout && typeof o.scout === 'object' ? str((o.scout as Raw).personality) : null),
    sources: Array.isArray(o.sources) ? o.sources.filter((s): s is string => typeof s === 'string') : [],
  };
}

/** Liste de cibles de l'instantané, ou null si le plugin ne l'a pas lue (réglage désactivé, plugin antérieur à 0.4.0). */
export function snapshotTargets(snap: FmSnapshot): unknown[] | null {
  return Array.isArray(snap.shortlist) ? (snap.shortlist as unknown[]) : null;
}

/** Cibles de l'instantané, normalisées (vide si le plugin ne les a pas lues). */
export function shortlist(snap: FmSnapshot): Target[] {
  return (snapshotTargets(snap) ?? []).flatMap((x) => targetOf(x) ?? []);
}

/* ---------- Base des cibles ---------- */

/** Ligne de la table fm_targets, sans la partie. */
export interface TargetRecord {
  playerId: string;
  name: string;
  club: string | null;
  /** Dates de jeu (ISO) de la première et de la dernière fois où le joueur figurait dans une liste du jeu. */
  firstSeen: string;
  lastSeen: string;
  /** Encore dans une liste du jeu au dernier instantané qui les a lues. */
  inList: boolean;
  /** Écartée à la main dans Simloom : masquée, sans toucher au jeu. */
  dismissed: boolean;
  data: unknown;
}

/**
 * Fusion des cibles d'un instantané dans la base : ajoute les nouvelles, met à jour celles déjà connues,
 * marque « hors liste » celles que le jeu ne liste plus. Un instantané plus ancien que la dernière vue
 * d'une cible ne la modifie pas (réimport d'un vieux fichier). Renvoie seulement les lignes qui changent ;
 * null si l'instantané ne contient pas de cibles (rien à faire).
 */
export function mergeTargets(known: TargetRecord[], snap: FmSnapshot): TargetRecord[] | null {
  const raw = snapshotTargets(snap);
  if (!raw) return null;
  const date = snap.gameDate;
  const byId = new Map(known.map((k) => [k.playerId, k]));
  const seen = new Set<string>();
  const out: TargetRecord[] = [];
  for (const x of raw) {
    const r = fmPlayerSchema.safeParse(x);
    if (!r.success) continue;
    const id = String(r.data.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const prev = byId.get(id);
    if (prev && prev.lastSeen > date) continue;
    out.push({
      playerId: id,
      name: r.data.name.replace(/<[^>]*>/g, '').trim(),
      club: str((x as Raw).club),
      firstSeen: prev && prev.firstSeen < date ? prev.firstSeen : date,
      lastSeen: date,
      inList: true,
      dismissed: prev?.dismissed ?? false,
      data: x,
    });
  }
  for (const k of known) if (!seen.has(k.playerId) && k.inList && k.lastSeen <= date) out.push({ ...k, inList: false });
  return out;
}

export type StoredTarget = Target & { firstSeen: string; lastSeen: string; inList: boolean; dismissed: boolean };

/** Cibles de la base, prêtes pour l'écran (les lignes illisibles sont ignorées). */
export function storedTargets(rows: TargetRecord[]): StoredTarget[] {
  return rows.flatMap((r) => {
    const t = targetOf(r.data);
    return t ? [{ ...t, firstSeen: r.firstSeen, lastSeen: r.lastSeen, inList: r.inList, dismissed: r.dismissed }] : [];
  });
}
