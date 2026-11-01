import { unavailable, type FmPlayer } from './player';
import { parsePositions, type PosCode } from './positions';
import type { FmSnapshot } from './snapshot';
import { FORMATIONS, slotContexts, type FormationPlan, type RoleRef, type Slot, type SlotCtx, type TacticEngine } from './tactic';

/*
 * Compo réelle lue dans FM27 (bloc « lineup » de l'instantané, plugin 0.3 et suivants) :
 * quel joueur à quel poste, ses rôles avec et sans ballon (rôle personnalisé compris)
 * et ses consignes individuelles. Lecture tolérante : le plugin peut livrer les rôles
 * en code du jeu (« OPScreeningDefensiveMidfielder ») ou en libellé (« Milieu écran »).
 *
 * Format attendu, au choix `lineup: [...]` ou `lineup: { slots: [...] }` :
 *   { position: "MD (C)", playerId: 123, playerName?: "…", roleIP?: "…", roleOOP?: "…",
 *     customRole?: true, instructions?: { ip?: string[], oop?: string[] } | string[] }
 */

export interface GameSlot {
  /** Rang dans la sélection du jeu (0-10), quand le plugin le donne. */
  index: number | null;
  /** Poste lu ; null si le jeu ne l'a pas donné sous une forme reconnue (déduit plus tard du schéma ou du joueur). */
  pos: PosCode | null;
  playerId: string | null;
  playerName: string | null;
  roleIP: string | null;
  roleOOP: string | null;
  custom: boolean;
  instructions: { ip: string[]; oop: string[] };
}

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);
const pick = (o: Raw, ...keys: string[]) => {
  for (const k of keys) if (o[k] != null) return o[k];
  return null;
};
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => !!x) : []);

/** Rôle lu : texte, ou premier texte d'un objet brut du jeu. */
function roleText(v: unknown, depth = 2): string | null {
  const s = str(v);
  if (s && !/^\d+$/.test(s)) return s;
  if (v && typeof v === 'object' && depth > 0) for (const x of Array.isArray(v) ? v : Object.values(v as Raw)) {
    const r = roleText(x, depth - 1);
    if (r) return r;
  }
  return null;
}

/** Premier poste reconnu dans une valeur du jeu : texte (« MD (C) ») ou objet brut dont un champ texte le contient. */
// Noms anglais des postes du jeu (masques PositionMask), du plus précis au plus général.
const EN_POS: [RegExp, PosCode][] = [
  [/goal ?keeper|^gk$/i, 'GB'],
  [/wing ?back.*left|left.*wing ?back/i, 'DLG'],
  [/wing ?back.*right|right.*wing ?back/i, 'DLD'],
  [/defensive ?midfield/i, 'MDF'],
  [/attacking ?midfield.*left|left.*(winger|attacking)/i, 'MOG'],
  [/attacking ?midfield.*right|right.*(winger|attacking)/i, 'MOD'],
  [/attacking ?midfield/i, 'MOC'],
  [/midfield.*left|left.*midfield/i, 'MG'],
  [/midfield.*right|right.*midfield/i, 'MD'],
  [/midfield/i, 'MC'],
  [/(defender|back).*left|left.*(defender|back)/i, 'DG'],
  [/(defender|back).*right|right.*(defender|back)/i, 'DD'],
  [/defender|centre ?back|center ?back/i, 'DC'],
  [/striker|forward/i, 'BT'],
];

function posOf(v: unknown, depth = 2): PosCode | null {
  const s = str(v);
  if (s) return parsePositions(s)[0] ?? EN_POS.find(([re]) => re.test(s))?.[1] ?? null;
  if (v && typeof v === 'object' && depth > 0)
    for (const x of Array.isArray(v) ? v : Object.values(v as Raw)) {
      const p = posOf(x, depth - 1);
      if (p) return p;
    }
  return null;
}

/** Compo du jeu, ou null si le plugin ne l'a pas lue. */
export function gameLineup(snap: FmSnapshot | null | undefined): GameSlot[] | null {
  const raw = (snap as Raw | null | undefined)?.lineup;
  const rows = Array.isArray(raw) ? raw : Array.isArray((raw as Raw | null)?.slots) ? ((raw as Raw).slots as unknown[]) : null;
  if (!rows?.length) return null;
  const out: GameSlot[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Raw;
    const pos = posOf(pick(o, 'position', 'positionIP', 'pos', 'positionText'));
    const playerId = str(pick(o, 'playerId', 'player_id', 'id'));
    const playerName = str(pick(o, 'playerName', 'name'));
    if (!pos && !playerId && !playerName) continue;
    const index = typeof o.index === 'number' ? o.index : null;
    const ins = pick(o, 'instructions', 'playerInstructions');
    const insObj = ins && typeof ins === 'object' && !Array.isArray(ins) ? (ins as Raw) : null;
    out.push({
      index,
      pos,
      playerId,
      playerName,
      roleIP: roleText(pick(o, 'roleIP', 'ipRole', 'roleInPossession', 'role')),
      roleOOP: roleText(pick(o, 'roleOOP', 'oopRole', 'roleOutOfPossession')),
      custom: pick(o, 'customRole', 'custom') === true || (o.roleOverride != null && o.roleOverride !== '' && o.roleOverride !== false),
      instructions: { ip: insObj ? list(insObj.ip ?? insObj.inPossession) : list(ins), oop: insObj ? list(insObj.oop ?? insObj.outOfPossession) : [] },
    });
  }
  return out.length >= 7 ? out : null;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Rôle du repère correspondant à un rôle lu dans le jeu (code, libellé français ou anglais). */
export function matchRole(engine: TacticEngine, raw: string | null, pos: PosCode, phase: 'ip' | 'oop'): RoleRef | null {
  if (!raw) return null;
  const direct = engine.roles.get(raw);
  if (direct) return direct;
  const roles = [...engine.roles.values()];
  // Code d'énumération du jeu (« OPScreeningDefensiveMidfielder », « BoxToBoxMidfielder »).
  const game = roles.find((r) => r.game?.[phase] === raw) ?? roles.find((r) => r.game?.ip === raw || r.game?.oop === raw);
  if (game) return game;
  // « OPScreeningDefensiveMidfielder » → « screeningdefensivemidfielder »
  const key = norm(raw.replace(/^(IP|OP)(?=[A-Z])/, ''));
  const fits = (r: RoleRef) => engine.availableAt(r, pos, phase);
  const exact = roles.filter((r) => [r.code, r.fr, r.en].some((x) => x && norm(x) === key));
  if (exact.length) return exact.find(fits) ?? exact[0]!;
  // Code du jeu plus long que notre libellé (« ScreeningDefensiveMidfielder » ↔ « Screening Midfielder ») :
  // rôle du poste dont tous les mots figurent dans le code, en privilégiant le même premier mot.
  const words = raw
    .replace(/^(IP|OP)(?=[A-Z])/, '')
    .split(/(?=[A-Z])|[\s_-]+/)
    .map(norm)
    .filter(Boolean);
  let best: { r: RoleRef; s: number } | null = null;
  for (const r of roles.filter(fits)) {
    const rw = (r.en ?? '').split(/[\s-]+/).map(norm).filter(Boolean);
    if (!rw.length || !rw.every((w) => words.includes(w))) continue;
    const s = rw.length + (rw[0] === words[0] ? 0.5 : 0);
    if (!best || s > best.s) best = { r, s };
  }
  return best?.r ?? null;
}

// Coordonnées par défaut d'un poste sur le terrain (en %), quand le schéma du jeu n'est pas connu de Simloom.
const XY: Record<PosCode, [number, number]> = {
  GB: [50, 92], DD: [85, 72], DC: [50, 76], DG: [15, 72], DLD: [90, 56], DLG: [10, 56], MDF: [50, 58],
  MD: [85, 44], MC: [50, 46], MG: [15, 44], MOD: [85, 24], MOC: [50, 30], MOG: [15, 24], BT: [50, 12],
};

/**
 * Plan « onze du jeu » : les joueurs et rôles réels, au format du plan calculé, pour que
 * Composition, Titulaires et remplaçants et les consignes s'appuient sur la vraie compo.
 */
export function planFromLineup(engine: TacticEngine, lineup: GameSlot[], players: FmPlayer[], form: string | null): FormationPlan {
  const byId = new Map(players.map((p) => [p.id, p]));
  const byName = new Map(players.map((p) => [norm(p.name), p]));
  const ref = form && FORMATIONS[form] ? [...FORMATIONS[form]!] : null;
  const count: Partial<Record<PosCode, number>> = {};
  const total: Partial<Record<PosCode, number>> = {};
  const forms = form && FORMATIONS[form] ? FORMATIONS[form]! : null;
  // Poste : celui lu, sinon celui du schéma au même rang, sinon le premier poste du joueur.
  const resolved = lineup
    .map((s, k) => {
      const p = (s.playerId && byId.get(s.playerId)) || (s.playerName && byName.get(norm(s.playerName))) || null;
      const pos = s.pos ?? forms?.[s.index ?? k]?.[0] ?? p?.positions[0] ?? null;
      return pos ? { s: { ...s, pos }, p } : null;
    })
    .filter((x): x is { s: GameSlot & { pos: PosCode }; p: FmPlayer | null } => !!x);
  for (const { s } of resolved) total[s.pos] = (total[s.pos] ?? 0) + 1;
  // Rôle : celui lu ; à défaut le meilleur rôle du joueur à ce poste (le plugin ne lit pas encore les rôles).
  const roleFor = (raw: string | null, p: FmPlayer | null, pos: PosCode, ph: 'ip' | 'oop', ctx: SlotCtx) =>
    matchRole(engine, raw, pos, ph)?.code ??
    (p && engine.bestAtPos(p, pos, ph, ctx)?.role.code) ??
    [...engine.roles.values()].find((r) => engine.availableAt(r, pos, ph, ctx))?.code ??
    '';
  const placed = resolved.map(({ s, p }) => {
    // Position : celle du schéma connu si le poste y figure, sinon la position par défaut, écartée pour les doublons.
    const i = ref?.findIndex(([pos]) => pos === s.pos) ?? -1;
    let x: number, y: number;
    if (ref && i >= 0) {
      [, x, y] = ref[i]!;
      ref.splice(i, 1);
    } else {
      const n = (count[s.pos] = (count[s.pos] ?? 0) + 1) - 1;
      const k = total[s.pos] ?? 1;
      [x, y] = XY[s.pos];
      if (k > 1) x = Math.max(8, Math.min(92, x + (n - (k - 1) / 2) * 24));
    }
    return { s, p, x, y };
  });
  // Créneaux excentrés (deux milieux défensifs, centraux gauche et droit…) : le jeu y propose d'autres rôles.
  const ctxs = slotContexts(placed.map(({ s, x }) => ({ pos: s.pos, x })));
  const slots: Slot[] = placed.map(({ s, p, x, y }, i) => {
    const ip = roleFor(s.roleIP, p, s.pos, 'ip', ctxs[i]!);
    const oop = roleFor(s.roleOOP, p, s.pos, 'oop', ctxs[i]!);
    const a = p ? engine.roleFit(p, ip, 'ip', s.pos) : null;
    const b = p ? engine.roleFit(p, oop, 'oop', s.pos) : null;
    return { pos: s.pos, x, y, ip, oop, player: p, fit: a != null && b != null ? (a + b) / 2 : (a ?? b), game: { custom: s.custom, instructions: s.instructions } };
  });
  const xi = new Set(slots.flatMap((s) => (s.player ? [s.player.id] : [])));
  const subs = slots.map((sl) =>
    players
      .filter((p) => !xi.has(p.id) && !unavailable(p) && p.positions.includes(sl.pos))
      .map((p) => ({ p, f: ((engine.roleFit(p, sl.ip, 'ip', sl.pos) ?? 0) + (engine.roleFit(p, sl.oop, 'oop', sl.pos) ?? 0)) / 2 }))
      .sort((a, b) => b.f - a.f)
      .slice(0, 2)
      .map((x) => x.p),
  );
  const fits = slots.map((s) => s.fit ?? 0);
  return { form: form ?? '', slots, subs, score: fits.reduce((a, b) => a + b, 0) / (fits.length || 1), holes: slots.filter((s) => !s.player).length };
}

/**
 * Étoiles du staff : le jeu les donne sur 20 ({MinValue, MaxValue}, quarts d'étoile), affichées sur 5.
 * Une fourchette (avis de recruteur) donne son milieu.
 */
export function starsOf(v: unknown): number | null {
  const n = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x)) ? Number(x) : null);
  let raw = n(v);
  if (raw == null && v && typeof v === 'object') {
    const o = v as Raw;
    const lo = n(o.MinValue ?? o.min);
    const hi = n(o.MaxValue ?? o.max);
    raw = lo != null && hi != null ? (lo + hi) / 2 : (lo ?? hi);
  }
  if (raw == null) return null;
  const five = raw > 5 ? raw / 4 : raw;
  return Math.round(five * 2) / 2;
}

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(+v) ? +v : null);

/**
 * Suspensions lues par chemins.json : `custom.joueurs[rang] = { id, suspensions: SuspensionsCount }` et
 * `custom.equipe = { nbSuspensionsEnCours: AllCompsActiveBansCount, suspensionsEnCours: AllCompsActiveBans }`.
 * SuspensionsCount n'est peut-être qu'un cumul : un joueur n'est compté suspendu que si l'équipe a aussi
 * une suspension en cours. La liste du jeu désigne le joueur par « Person#… », qui ne se relie pas à son id :
 * le détail (compétition, matchs restants, motif) n'est repris que s'il y a un seul suspendu.
 * Renvoie id du joueur → texte de la suspension.
 */
export function suspensionsOf(snap: FmSnapshot): Map<string, string> {
  const out = new Map<string, string>();
  const custom = (snap as Raw).custom as Raw | null | undefined;
  if (!custom || typeof custom !== 'object') return out;
  const team = (custom.equipe ?? {}) as Raw;
  const teamCount = num(team.nbSuspensionsEnCours);
  let list: unknown = team.suspensionsEnCours;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch {
      list = null;
    }
  }
  const bans = (Array.isArray(list) ? list : list && typeof list === 'object' ? [list] : []) as Raw[];
  const active = teamCount ?? (Array.isArray(list) || (list && typeof list === 'object') ? bans.length : null);
  if (active === 0) return out;
  const rows = Object.values((custom.joueurs ?? {}) as Record<string, Raw>);
  const ids = rows.filter((r) => r && r.id != null && (num(r.suspensions) ?? 0) > 0).map((r) => String(r.id));
  const detail = (b: Raw | undefined) => {
    if (!b) return 'Suspendu';
    const scope = str((b.BanScope as Raw | undefined)?.BanScopeString) ?? str(b.BanScope);
    const left = num(b.ActiveBanMatchesRemaining);
    const why = str(b.ActiveBanReason);
    const parts = [scope, left != null ? `${left} match${left > 1 ? 's' : ''}` : null, why].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Suspendu';
  };
  for (const id of ids) out.set(id, detail(ids.length === 1 && bans.length === 1 ? bans[0] : undefined));
  return out;
}

/**
 * Données joueurs étendues du plugin 0.3.1 (`playersExtended[playerId]`) : moral, satisfaction,
 * hiérarchie, étoiles de niveau et de potentiel vues par le staff. Fusionnées dans chaque joueur brut.
 */
export function withExtended(snap: FmSnapshot): FmSnapshot {
  const ext = (snap as Raw).playersExtended;
  const byId = (ext && typeof ext === 'object' ? ext : {}) as Record<string, Raw | undefined>;
  const bans = suspensionsOf(snap);
  if (!Object.keys(byId).length && !bans.size) return snap;
  return {
    ...snap,
    players: snap.players.map((p) => {
      const ban = bans.get(String(p.id));
      const q = ban && !(p as Raw).suspension ? { ...p, suspension: ban } : p;
      const x = byId[String(p.id)];
      if (!x) return q;
      return {
        ...q,
        morale: p.morale ?? str(x.moraleText) ?? str(x.morale),
        personality: (p as Raw).personality ?? str(x.personality),
        hierarchy: (p as Raw).hierarchy ?? str(x.hierarchy),
        stars: { current: starsOf(x.currentStars), potential: starsOf(x.potentialStars) },
        extended: x,
      };
    }),
  };
}
