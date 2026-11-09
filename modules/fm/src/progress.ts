import { unavailable, type FmPlayer } from './player';
import type { PosCode } from './positions';
import { snapshotFixtures } from './fixtures';
import type { FmSnapshot } from './snapshot';
import { FORMATIONS, type FormationPlan, formationKeys } from './tactic';

/**
 * Progression, projection et profondeur d'effectif (portées de la page Archivix).
 * Le jeu cache le potentiel : la projection suit la tendance réelle quand plusieurs instantanés
 * sont assez espacés, sinon une courbe moyenne selon l'âge.
 */

/** Progression annuelle moyenne selon l'âge, en points de niveau sur 20. */
export const growthAt = (age: number) => (age <= 18 ? 1 : age <= 20 ? 0.8 : age <= 22 ? 0.5 : age <= 24 ? 0.3 : age <= 28 ? 0 : age <= 30 ? -0.2 : age <= 32 ? -0.4 : -0.7);

/** Un instantané réduit à sa date et à ses joueurs normalisés, du plus ancien au plus récent. */
export interface SquadAt {
  gameDate: string;
  players: FmPlayer[];
}

export function levelSeries(history: SquadAt[], id: string): (number | null)[] {
  return history.map((h) => h.players.find((p) => p.id === id)?.level ?? null);
}

const YEAR_MS = 3.15e10;

/**
 * Niveau projeté dans `years` saisons. Avec le CA réel (lu en mémoire), la progression se mesure sur le CA, échelle
 * fixe, et le PA plafonne la projection ; le niveau suit le CA en proportion. Sans CA : progression des attributs
 * mesurée sur les instantanés, sinon courbe d'âge.
 */
export function projectLevel(p: FmPlayer, years: number, history: SquadAt[] = []): number | null {
  if (p.level == null) return null;
  if (p.ca != null) {
    const caPts = history
      .map((h) => ({ d: new Date(h.gameDate).getTime(), ca: h.players.find((x) => x.id === p.id)?.ca ?? null }))
      .filter((x): x is { d: number; ca: number } => x.ca != null);
    const caSpan = caPts.length >= 2 ? (caPts.at(-1)!.d - caPts[0]!.d) / YEAR_MS : 0;
    let ca = p.ca;
    if (caSpan >= 0.4) ca += ((caPts.at(-1)!.ca - caPts[0]!.ca) / caSpan) * years;
    else {
      // Courbe d'âge appliquée au CA (1 point de niveau sur 20 ≈ 1/level du CA).
      let lvl = p.level;
      for (let y = 0; y < years; y++) lvl += growthAt((p.age ?? 25) + y);
      ca = (p.ca * lvl) / p.level;
    }
    if (p.pa != null) ca = Math.min(ca, Math.max(p.pa, p.ca));
    return Math.max(1, Math.min(20, (p.level * Math.max(1, ca)) / p.ca));
  }
  const pts = history
    .map((h) => ({ d: new Date(h.gameDate).getTime(), l: h.players.find((x) => x.id === p.id)?.level ?? null }))
    .filter((x): x is { d: number; l: number } => x.l != null);
  const span = pts.length >= 2 ? (pts.at(-1)!.d - pts[0]!.d) / YEAR_MS : 0;
  let lvl = p.level;
  if (span >= 0.4) lvl += ((pts.at(-1)!.l - pts[0]!.l) / span) * years;
  else for (let y = 0; y < years; y++) lvl += growthAt((p.age ?? 25) + y);
  return Math.max(1, Math.min(20, lvl));
}

/** Première année de la saison en cours (une saison commence en juillet). */
export const seasonStart = (gameDate: string) => {
  const d = new Date(gameDate);
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
};

/* ---------- Titulaires et remplaçants ---------- */

export interface DepthEntry {
  player: FmPlayer;
  in1: number | null;
  in2: number | null;
}
export interface DepthRow {
  pos: PosCode;
  count: number;
  starters: DepthEntry[];
  /** `when` : 0 = déjà au niveau du titulaire le plus faible, 1 ou 2 = dans 1 ou 2 saisons, null = pas en vue. */
  subs: (DepthEntry & { when: 0 | 1 | 2 | null })[];
  weakest: FmPlayer | null;
}

/** Schéma connu le plus proche du nom donné par le jeu (« 4-4-2 Diamant » → « 4-4-2 »), sinon 4-2-3-1. */
export const formationKey = (form: string | null | undefined) => formationKeys().find((k) => (form ?? '').startsWith(k)) ?? '4-2-3-1';

export function depthChart(players: FmPlayer[], form: string | null | undefined, history: SquadAt[] = []): DepthRow[] {
  const slots = FORMATIONS[formationKey(form)]!;
  const used = new Set<string>();
  const entry = (p: FmPlayer): DepthEntry => ({ player: p, in1: projectLevel(p, 1, history), in2: projectLevel(p, 2, history) });
  const positions = [...new Set(slots.map(([pos]) => pos))];
  return positions.map((pos) => {
    const count = slots.filter(([x]) => x === pos).length;
    const cand = players.filter((p) => p.positions.includes(pos) && p.level != null).sort((a, b) => b.level! - a.level!);
    const starters: DepthEntry[] = [];
    for (let i = 0; i < count; i++) {
      const t = cand.find((p) => !used.has(p.id) && !unavailable(p)) ?? cand.find((p) => !used.has(p.id));
      if (!t) break;
      used.add(t.id);
      starters.push(entry(t));
    }
    const weakest = starters.length ? starters.reduce((m, x) => (x.player.level! < m.player.level! ? x : m)) : null;
    const subs = cand
      .filter((p) => !used.has(p.id))
      .slice(0, 3)
      .map((p) => {
        const e = entry(p);
        const when: 0 | 1 | 2 | null = !weakest
          ? null
          : p.level! >= weakest.player.level!
            ? 0
            : e.in1 != null && weakest.in1 != null && e.in1 >= weakest.in1
              ? 1
              : e.in2 != null && weakest.in2 != null && e.in2 >= weakest.in2
                ? 2
                : null;
        return { ...e, when };
      });
    return { pos, count, starters, subs, weakest: weakest?.player ?? null };
  });
}

/**
 * Titulaires et remplaçants du onze choisi en Tactique (même style, même schéma, mêmes joueurs),
 * regroupés par poste. Les doublures sont celles du plan, puis les joueurs naturels du poste
 * (blessés compris) jusqu'à trois.
 */
export function depthFromPlan(plan: FormationPlan, players: FmPlayer[], history: SquadAt[] = []): DepthRow[] {
  const entry = (p: FmPlayer): DepthEntry => ({ player: p, in1: projectLevel(p, 1, history), in2: projectLevel(p, 2, history) });
  const xi = new Set(plan.slots.flatMap((s) => (s.player ? [s.player.id] : [])));
  const positions = [...new Set(plan.slots.map((s) => s.pos))];
  const shown = new Set<string>();
  return positions.map((pos) => {
    const idx = plan.slots.flatMap((s, i) => (s.pos === pos ? [i] : []));
    const starters = idx.flatMap((i) => (plan.slots[i]!.player ? [entry(plan.slots[i]!.player!)] : []));
    const pool: FmPlayer[] = [];
    const push = (p: FmPlayer) => {
      if (!xi.has(p.id) && !pool.some((x) => x.id === p.id) && p.level != null) pool.push(p);
    };
    for (const i of idx) for (const p of plan.subs[i] ?? []) push(p);
    players
      .filter((p) => p.positions.includes(pos) && !shown.has(p.id))
      .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
      .forEach(push);
    const weakest = starters.length && starters.every((x) => x.player.level != null) ? starters.reduce((m, x) => (x.player.level! < m.player.level! ? x : m)) : null;
    const subs = pool.slice(0, 3).map((p) => {
      shown.add(p.id);
      const e = entry(p);
      const when: 0 | 1 | 2 | null = !weakest
        ? null
        : p.level! >= weakest.player.level!
          ? 0
          : e.in1 != null && weakest.in1 != null && e.in1 >= weakest.in1
            ? 1
            : e.in2 != null && weakest.in2 != null && e.in2 >= weakest.in2
              ? 2
              : null;
      return { ...e, when };
    });
    return { pos, count: idx.length, starters, subs, weakest: weakest?.player ?? null };
  });
}

/** Remplaçants qui peuvent passer devant, du plus tôt au plus tard, sans doublon. */
export function depthAlerts(rows: DepthRow[]) {
  const seen = new Set<string>();
  return rows
    .flatMap((r) => r.subs.filter((s) => s.when != null).map((s) => ({ pos: r.pos, sub: s, starter: r.weakest! })))
    .sort((a, b) => a.sub.when! - b.sub.when!)
    .filter((a) => !seen.has(a.sub.player.id) && seen.add(a.sub.player.id));
}

/* ---------- Calendrier et rotation ---------- */

export interface Fixture {
  date: string;
  opponent: string | null;
  competition: string | null;
  home: boolean | null;
  /** Jours depuis le match précédent de la liste. */
  gap: number | null;
}

export function upcomingFixtures(snap: FmSnapshot, max = 6): Fixture[] {
  const raw = snapshotFixtures(snap) as unknown as Record<string, unknown>[];
  const list = raw
    .filter((f) => typeof f.date === 'string' && f.date >= snap.gameDate)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, max);
  return list.map((f, i) => ({
    date: String(f.date),
    opponent: typeof f.opponent === 'string' ? f.opponent : null,
    competition: typeof f.competition === 'string' ? f.competition : null,
    home: typeof f.home === 'boolean' ? f.home : null,
    gap: i ? Math.round((new Date(String(f.date)).getTime() - new Date(String(list[i - 1]!.date)).getTime()) / 864e5) : null,
  }));
}

export function rotation(players: FmPlayer[]) {
  return {
    tired: players.filter((p) => !p.injury && p.condition != null && p.condition < 90).sort((a, b) => a.condition! - b.condition!),
    rusty: players.filter((p) => !p.injury && p.sharpness != null && p.sharpness < 70 && (p.level ?? 0) >= 8).sort((a, b) => a.sharpness! - b.sharpness!),
  };
}

/* ---------- Progression ---------- */

/** Fenêtre de la colonne « récent » de la progression, en jours de jeu. */
export const RECENT_DAYS = 90;

export interface AttrMove {
  key: string;
  diff: number;
}

export interface ProgressRow {
  player: FmPlayer;
  series: (number | null)[];
  /** Niveau gagné ou perdu depuis sa première apparition, sur 20 (arrondi au dixième). */
  delta: number;
  /** Points d'attributs gagnés ou perdus depuis sa première apparition (somme des écarts). */
  points: number;
  /** Idem sur les {@link RECENT_DAYS} derniers jours (null : pas d'instantané assez ancien). */
  recent: number | null;
  /** Date de sa première apparition. */
  since: string;
  /** Attributs qui ont le plus monté puis le plus baissé (deux au plus chacun). */
  ups: AttrMove[];
  downs: AttrMove[];
}

/** Somme des écarts d'attributs entre deux versions d'un joueur (attributs connus des deux côtés). */
function attrMoves(from: FmPlayer, to: FmPlayer): AttrMove[] {
  const out: AttrMove[] = [];
  for (const [k, v] of Object.entries(to.attributes)) {
    const a = from.attributes[k];
    if (a == null) continue;
    const diff = Math.round(v - a);
    if (diff) out.push({ key: k, diff });
  }
  return out;
}

const DAY_MS = 864e5;

/**
 * Progression de chaque joueur de l'effectif actuel depuis sa première apparition dans les instantanés : niveau
 * (moyenne des attributs, sur 20) et surtout points d'attributs gagnés ou perdus, plus parlants qu'un dixième de niveau.
 */
export function progression(history: SquadAt[]): ProgressRow[] {
  const last = history.at(-1);
  if (!last) return [];
  const now = new Date(last.gameDate).getTime();
  return last.players
    .map((p) => {
      const firstAt = history.find((h) => h.players.some((x) => x.id === p.id))!;
      const first = firstAt.players.find((x) => x.id === p.id)!;
      const moves = attrMoves(first, p);
      const recentAt = [...history].reverse().find((h) => now - new Date(h.gameDate).getTime() >= RECENT_DAYS * DAY_MS);
      const old = recentAt?.players.find((x) => x.id === p.id);
      const sum = (xs: AttrMove[]) => xs.reduce((a, x) => a + x.diff, 0);
      return {
        player: p,
        series: levelSeries(history, p.id),
        delta: p.level != null && first.level != null ? Math.round((p.level - first.level) * 10) / 10 : 0,
        points: sum(moves),
        recent: old ? sum(attrMoves(old, p)) : null,
        since: firstAt.gameDate,
        ups: moves.filter((x) => x.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 2),
        downs: moves.filter((x) => x.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 2),
      };
    })
    .sort((a, b) => b.points - a.points || b.delta - a.delta);
}

/* ---------- Comparateur ---------- */

/** Familles d'attributs affichées dans le comparateur, comme sur la fiche du jeu. */
export const ATTR_GROUPS: [string, string[]][] = [
  ['technical', ['Corners', 'Crossing', 'Dribbling', 'Finishing', 'FirstTouch', 'FreeKicks', 'Heading', 'LongShots', 'LongThrows', 'Marking', 'Passing', 'PenaltyTaking', 'Tackling', 'Technique']],
  ['mental', ['Aggression', 'Anticipation', 'Bravery', 'Composure', 'Concentration', 'Decisions', 'Determination', 'Flair', 'Leadership', 'Movement', 'Positioning', 'Teamwork', 'Vision', 'WorkRate']],
  ['physical', ['Acceleration', 'Agility', 'Balance', 'JumpingReach', 'NaturalFitness', 'Pace', 'Stamina', 'Strength']],
  ['goalkeeping', ['AerialReach', 'CommandOfArea', 'Communication', 'Eccentricity', 'Handling', 'Kicking', 'OneOnOnes', 'Reflexes', 'RushingOut', 'TendencyToPunch', 'Throwing']],
];

/** Valeur la plus haute d'une ligne (null s'il y a moins de deux valeurs ou si elles sont toutes égales). */
export function bestOf(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null);
  const max = Math.max(...v);
  return v.length > 1 && max > Math.min(...v) ? max : null;
}
