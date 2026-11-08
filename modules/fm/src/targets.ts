import { decodeGameDate } from './fixtures';
import { starsOf, withExtended } from './lineup';
import { normalizePlayer, toNumber, type FmPlayer } from './player';
import { range, type Range } from './project';
import { fmPlayerSchema, LOAN_SOURCE, loanShortlist, type FmSnapshot } from './snapshot';

/**
 * Cibles du mercato : joueurs d'autres clubs que le joueur suit dans FM27 (liste de suivi, cibles du recrutement),
 * lus par le plugin 0.4.0 (réglage LireCibles, bloc `shortlist` de l'instantané). FM Immersion les garde dans sa base
 * (table fm_targets) : une cible retirée de la liste du jeu reste consultable, avec la date où elle a été vue.
 */

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Avis du recrutement sur une cible (champs absents si le jeu ne les donne pas). */
export interface ScoutView {
  /** Connaissance du joueur par le recrutement, en % (0-100) : niveau du jeu sur 5 ramené en %. */
  knowledge: number | null;
  /** Libellé du niveau de connaissance (« Grandes connaissances »…). */
  knowledgeText: string | null;
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

/** Champ lu en profond (plugin 0.4.4) : fiche du jeu, sinon valeur simple ; le nom de type brut ne vaut rien. */
const unread = (v: unknown) => typeof v === 'string' && v.startsWith('SI.');

/** Connaissance : fiche {ActualValue, MaxValue, Text} (niveau sur 5), ou ancien nombre en %. */
function knowledgeOf(v: unknown): { pct: number | null; text: string | null } {
  if (unread(v)) return { pct: null, text: null };
  if (v && typeof v === 'object') {
    const o = v as Raw;
    const cur = toNumber(o.ActualValue);
    const max = toNumber(o.MaxValue);
    return { pct: cur != null && max ? (cur / max) * 100 : null, text: str(o.Text) };
  }
  return { pct: toNumber(v), text: null };
}

/** Montant affiché par le jeu (« 3,22K € p/m ») ; SortValue n'a pas d'unité connue, on ne s'en sert pas. */
function money(v: unknown): number | null {
  if (unread(v)) return null;
  // Inconnu : le jeu écrit « - » (SortValue 2147483647) ou « -1 € ».
  const n = v && typeof v === 'object' ? toNumber((v as Raw).DisplayValue) : toNumber(v);
  return n != null && n > 0 ? n : null;
}

const recommendationOf = (text: string | null) => (text && /observation nécessaire|scouting required/i.test(text) ? null : text);

function scoutOf(raw: unknown): ScoutView | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Raw;
  const knowledge = knowledgeOf(s.knowledge);
  const cur = starsOf(s.scoutCurrentStars) ?? starsOf(s.currentStars);
  const pot = starsOf(s.scoutPotentialStars) ?? starsOf(s.potentialStars);
  const between = (lo: unknown, hi: unknown) => range({ min: toNumber(lo), max: toNumber(hi) });
  return {
    knowledge: knowledge.pct == null ? null : Math.max(0, Math.min(100, knowledge.pct)),
    knowledgeText: knowledge.text,
    stars: cur == null && pot == null ? null : { current: cur, potential: pot },
    // Le jeu laisse « Observation nécessaire » même pour un joueur bien connu : on ne le garde que s'il est vrai.
    recommendation: knowledge.pct ? recommendationOf(label(s.recommendationText)) : label(s.recommendationText),
    bestPosition: label(s.bestPosition),
    bestRole: label(s.bestRole),
    value: between(money(s.minValue), money(s.maxValue)),
    wage: between(money(s.minWage), money(s.maxWage)),
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

/* ---------- Joueurs à l'essai ---------- */

// FM27 écrit « N/A » à la place du salaire d'un joueur à l'essai (wageText), et « - » comme statut.
const empty = (v: unknown) => v == null || (typeof v === 'string' && /^(|-|–|n\/a|n\.a\.)$/i.test(v.trim()));
const hasContract = (x: unknown) => {
  const o = x as Raw;
  return !empty(o.contractEnd) || !empty(o.wage) || !empty(o.wageText);
};

/**
 * Joueurs à l'essai : le jeu les range dans l'effectif, mais sans contrat (ni fin de contrat, ni salaire, ni statut).
 * FM Immersion les sort de l'effectif et les montre dans les cibles du mercato, pour les juger avant de leur proposer
 * un contrat. Seulement si l'instantané donne les contrats des autres joueurs (sinon un vieux plugin ferait
 * passer tout l'effectif pour des essais).
 */
export function trialistIds(snap: FmSnapshot): Set<string> {
  const players = (Array.isArray(snap.players) ? snap.players : []) as unknown[];
  if (!players.some(hasContract)) return new Set();
  return new Set(players.filter((x) => !hasContract(x) && empty((x as Raw).squadStatus)).map((x) => String((x as Raw).id)));
}

/**
 * Joueurs prêtés à un autre club : encore sous contrat (salaires, contrats, progression), mais pas au club,
 * donc hors des compos, de la tactique et du projet. Repérés par la liste des prêts du plugin ou par le statut
 * « Parti en prêt » du jeu.
 */
export function loanedOutIds(snap: FmSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const x of [...(Array.isArray(snap.loans) ? (snap.loans as unknown[]) : []), ...loanShortlist(snap)]) {
    const id = (x as Raw | null)?.id;
    if (id != null) ids.add(String(id));
  }
  for (const p of Array.isArray(snap.players) ? (snap.players as Raw[]) : []) {
    if (typeof p.squadStatus === 'string' && /prêt|loan/i.test(p.squadStatus)) ids.add(String(p.id));
  }
  return ids;
}

/** Instantané sans les joueurs à l'essai : l'effectif sous contrat. */
/**
 * Joueurs prêtés à notre club par un autre (chemins.json, joueur : `pretDe` = OnLoanFrom/Name, `pretStatut` =
 * LoanStatusDetails, 07/11/2026). Ils jouent pour nous jusqu'à la fin du prêt puis rentrent chez eux : le mercato
 * ne peut ni les vendre ni les prolonger, et planifie la saison suivante sans eux. Valeur : club prêteur (ou null).
 */
export function loanedInFrom(snap: FmSnapshot): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const custom = (snap as { custom?: { joueurs?: Record<string, Record<string, unknown>> } }).custom;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() && !v.startsWith('SI.') ? v.trim() : null);
  for (const [id, row] of Object.entries(custom?.joueurs ?? {})) {
    const from = text(row?.pretDe);
    if (from && from !== snap.club) out.set(String(row?.id ?? id), from);
  }
  return out;
}

/**
 * Fin du prêt des joueurs prêtés à notre club (`pretFin` = LoanContract/EndDate, 08/11/2026), en ISO ; null quand le
 * plugin ne la lit pas encore. Jusqu'à cette date, le prêté compte dans l'effectif et les plans de la saison ; après,
 * il rentre chez lui.
 */
export function loanedInUntil(snap: FmSnapshot): Map<string, string | null> {
  const out = new Map<string, string | null>();
  const custom = (snap as { custom?: { joueurs?: Record<string, Record<string, unknown>> } }).custom;
  for (const [id] of loanedInFrom(snap)) {
    const row = Object.values(custom?.joueurs ?? {}).find((r) => String(r?.id) === id) ?? custom?.joueurs?.[id];
    out.set(id, decodeGameDate(row?.pretFin));
  }
  return out;
}

export function squadSnapshot(snap: FmSnapshot): FmSnapshot {
  const trial = trialistIds(snap);
  return trial.size ? { ...snap, players: snap.players.filter((p) => !trial.has(String(p.id))) } : snap;
}

/**
 * Cibles de l'instantané (listes lues par le plugin + joueurs à l'essai), ou null s'il n'y a ni l'un ni l'autre
 * (réglage désactivé, plugin antérieur à 0.4.0, aucun essai en cours).
 */
export function snapshotTargets(snap: FmSnapshot): unknown[] | null {
  // Les prêtés (source « pretes ») sont les joueurs du club, pas des cibles : retirés de la liste.
  const read = Array.isArray(snap.shortlist) ? (snap.shortlist as unknown[]).flatMap(withoutLoanSource) : null;
  const trial = trialistIds(snap);
  if (!trial.size) return read;
  const out = [...(read ?? [])];
  for (const p of withExtended(snap).players.filter((x) => trial.has(String(x.id)))) {
    const i = out.findIndex((x) => String((x as Raw).id) === String(p.id));
    if (i < 0) out.push({ ...p, club: null, sources: ['essai'] });
    else {
      const prev = out[i] as Raw;
      const sources = Array.isArray(prev.sources) ? prev.sources : [];
      out[i] = { ...prev, sources: [...new Set([...sources, 'essai'])] };
    }
  }
  return out;
}

function withoutLoanSource(x: unknown): unknown[] {
  const o = x as Raw | null;
  const s = o?.sources;
  if (!Array.isArray(s) || !s.includes(LOAN_SOURCE)) return [x];
  const rest = s.filter((v) => v !== LOAN_SOURCE);
  return rest.length ? [{ ...o, sources: rest }] : [];
}

/** Une cible ne vient que des essais (pas des listes du jeu). */
const trialOnly = (data: unknown) => {
  const s = (data as Raw | null)?.sources;
  return Array.isArray(s) && s.length > 0 && s.every((x) => x === 'essai');
};

/** Une cible ajoutée à la main depuis la recherche dans la base : elle ne sort jamais seule de la liste. */
const fromBase = (data: unknown) => {
  const s = (data as Raw | null)?.sources;
  return Array.isArray(s) && s.includes('base');
};

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
  /** Écartée à la main dans FM Immersion : masquée, sans toucher au jeu. */
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
  for (let x of raw) {
    const r = fmPlayerSchema.safeParse(x);
    if (!r.success) continue;
    const id = String(r.data.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const prev = byId.get(id);
    if (prev && prev.lastSeen > date) continue;
    // Une cible ajoutée depuis la base le reste, même quand le jeu la liste aussi.
    if (prev && fromBase(prev.data)) {
      const sources = Array.isArray((x as Raw).sources) ? ((x as Raw).sources as unknown[]) : [];
      x = { ...(prev.data as Raw), ...(x as Raw), sources: [...new Set([...sources, 'base'])] };
    }
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
  // Sans listes lues (réglage coupé), seules les cibles venues des essais peuvent sortir ;
  // celles ajoutées depuis la base ne sortent jamais seules (Écarter les retire).
  const listsRead = Array.isArray(snap.shortlist);
  for (const k of known)
    if (!seen.has(k.playerId) && k.inList && k.lastSeen <= date && !fromBase(k.data) && (listsRead || trialOnly(k.data))) out.push({ ...k, inList: false });
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

/* ---------- Recherche dans la base du jeu ---------- */

/**
 * Joueur lu directement dans la base de FM27 par FM Immersion (lecture seule en mémoire, `fm_memory_search`).
 * Les attributs sont les vraies valeurs (pas l'avis des recruteurs) ; salaire par semaine et valeur dans la
 * monnaie de base du jeu.
 */
export interface DbPlayer {
  id: number;
  name: string;
  age: number | null;
  birthDate: string | null;
  club: string | null;
  clubShort: string | null;
  clubId?: number | null;
  loanClub: string | null;
  loanEnd: string | null;
  nation?: string | null;
  division?: string | null;
  divisionId?: number | null;
  divisionReputation?: number | null;
  ca: number;
  pa: number;
  positionsText: string;
  positionRatings: Record<string, number>;
  attributes: Record<string, number>;
  wageWeekly: number | null;
  contractEnd: string | null;
  valueRaw: number | null;
  transferListed?: boolean;
  injured?: boolean;
}

/** Données d'une cible venue de la base, au format des cibles de l'instantané. */
export function baseTargetData(p: DbPlayer): Raw {
  return {
    id: p.id,
    name: p.name,
    age: p.age,
    positionsText: p.positionsText,
    positionRatings: p.positionRatings,
    attributes: p.attributes,
    contractEnd: p.contractEnd,
    club: p.club ?? p.loanClub,
    loanClub: p.loanClub,
    ca: p.ca,
    pa: p.pa,
    wageWeekly: p.wageWeekly,
    valueRaw: p.valueRaw,
    sources: ['base'],
  };
}

/** Cible prête à classer (rankTargets) pour un joueur trouvé dans la base. */
export function baseTarget(p: DbPlayer): Target | null {
  return targetOf(baseTargetData(p));
}

/**
 * Ajoute à la base des cibles un joueur trouvé dans la base du jeu (ou le remet en liste s'il y est déjà).
 * Les infos du recrutement déjà connues sont gardées ; la cible ne sort plus seule de la liste.
 */
export function addBaseTarget(known: TargetRecord[], p: DbPlayer, date: string): TargetRecord {
  const id = String(p.id);
  const prev = known.find((k) => k.playerId === id);
  const data = baseTargetData(p);
  const prevData = (prev?.data ?? {}) as Raw;
  const sources = Array.isArray(prevData.sources) ? (prevData.sources as unknown[]) : [];
  return {
    playerId: id,
    name: p.name,
    club: p.club ?? p.loanClub,
    firstSeen: prev && prev.firstSeen < date ? prev.firstSeen : date,
    lastSeen: prev && prev.lastSeen > date ? prev.lastSeen : date,
    inList: true,
    dismissed: false,
    data: { ...prevData, ...data, sources: [...new Set([...sources, 'base'])] },
  };
}
