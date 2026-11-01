import type { FmPlayer } from './player';
import { toNumber } from './player';
import type { Line } from './positions';
import type { EffArea } from './project';
import type { FmSnapshot } from './snapshot';

/**
 * Statistiques de la saison (écran Centre de données de FM27), lues par chemins.json : clés `stat*` de la
 * section `joueur` (`custom.joueurs[i]`), propriétés de PersonReference sans contexte (decouverte.json, 01/11/2026).
 * Valeurs du jeu en nombre ou en texte (« 84 % », « 10,4 km ») ; null si le jeu ne répond pas.
 */
export const STAT_KEYS = [
  'minutes', 'starts', 'xg', 'xgPer90', 'xa', 'xaPer90', 'shots90', 'shotsOnTargetPct',
  'passPct', 'passAtt90', 'progPass90', 'keyPass90', 'chances90', 'crossPct', 'dribbles90',
  'pressAtt90', 'press90', 'tacklePct', 'tackles90', 'interc90', 'blocks90', 'clear90',
  'headerPct', 'headersLost90', 'distance90', 'sprints90', 'mistakes', 'xgPrevented90', 'savePct',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type PlayerStats = Partial<Record<StatKey, number>>;

/** Minutes jouées en dessous desquelles les stats « par 90 » ne disent rien (3 matchs complets). */
export const MIN_STAT_MINUTES = 270;

const rawKey = (k: StatKey) => `stat${k[0]!.toUpperCase()}${k.slice(1)}`;
type Raw = Record<string, unknown>;

/**
 * Valeur d'une stat : nombre, texte du jeu, ou fiche (le jeu renvoie une DynamicReference, lue en profond par
 * chemins.json) dont on prend la valeur numérique, sinon le texte affiché.
 */
export function statValue(v: unknown): number | null {
  if (v == null || typeof v !== 'object') return toNumber(v);
  const o = v as Raw;
  // Forme lue en jeu (01/11/2026) : { PropertyValue, Count } ; Count = 0 → pas de donnée (ex. aucun tacle tenté).
  if ('PropertyValue' in o) return o.Count === 0 ? null : toNumber(o.PropertyValue);
  for (const k of ['ActualValue', 'Value', 'SortValue', 'RawValue']) if (typeof o[k] === 'number') return o[k] as number;
  for (const k of ['DisplayValue', 'Text', 'DisplayString', 'String']) {
    const n = toNumber(o[k]);
    if (n != null) return n;
  }
  return null;
}

/** Stats par id de joueur ; vide si chemins.json ne les lit pas encore. */
export function matchStats(snap: FmSnapshot): Map<string, PlayerStats> {
  const out = new Map<string, PlayerStats>();
  const custom = (snap as Raw).custom as Raw | null | undefined;
  const rows = custom && typeof custom === 'object' ? Object.values((custom.joueurs ?? {}) as Record<string, Raw>) : [];
  for (const r of rows) {
    if (!r || r.id == null) continue;
    const s: PlayerStats = {};
    for (const k of STAT_KEYS) {
      const n = statValue(r[rawKey(k)]);
      if (n != null) s[k] = n;
    }
    if (Object.keys(s).length) out.set(String(r.id), s);
  }
  return out;
}

/**
 * Mesures comparées entre joueurs d'une même ligne. `better` : sens du bon côté.
 * `focus` : priorité de l'entraînement individuel qui travaille ce point (training.ts, INDIVIDUAL_FOCUS).
 */
export interface StatMetric {
  key: StatKey;
  lines: Line[];
  better: 'high' | 'low';
  focus: string | null;
}
export const STAT_METRICS: StatMetric[] = [
  { key: 'passPct', lines: ['DEF', 'MIL', 'ATT', 'GB'], better: 'high', focus: 'ballRetention' },
  { key: 'progPass90', lines: ['DEF', 'MIL'], better: 'high', focus: 'ballProgression' },
  { key: 'keyPass90', lines: ['MIL', 'ATT'], better: 'high', focus: 'chanceCreation' },
  { key: 'chances90', lines: ['MIL', 'ATT'], better: 'high', focus: 'chanceCreation' },
  { key: 'dribbles90', lines: ['MIL', 'ATT'], better: 'high', focus: 'ballProgression' },
  { key: 'xgPer90', lines: ['ATT'], better: 'high', focus: 'finalThird' },
  { key: 'shotsOnTargetPct', lines: ['ATT'], better: 'high', focus: 'chanceConversion' },
  { key: 'press90', lines: ['MIL', 'ATT'], better: 'high', focus: 'pressing' },
  { key: 'tacklePct', lines: ['DEF', 'MIL'], better: 'high', focus: 'tackling' },
  { key: 'interc90', lines: ['DEF', 'MIL'], better: 'high', focus: 'defensivePositioning' },
  { key: 'headerPct', lines: ['DEF', 'ATT'], better: 'high', focus: 'marking' },
  { key: 'distance90', lines: ['DEF', 'MIL', 'ATT'], better: 'high', focus: 'endurance' },
  { key: 'mistakes', lines: ['GB', 'DEF', 'MIL'], better: 'low', focus: 'containment' },
  { key: 'xgPrevented90', lines: ['GB'], better: 'high', focus: 'gkShotStopping' },
  { key: 'savePct', lines: ['GB'], better: 'high', focus: 'gkShotStopping' },
];

export interface StatMark {
  key: StatKey;
  value: number;
  /** Rang dans la ligne, de 0 (le moins bon) à 1 (le meilleur), sens `better` déjà appliqué. */
  rank: number;
}

export interface PlayerStatReport {
  player: FmPlayer;
  stats: PlayerStats;
  minutes: number;
  /** Assez de minutes pour comparer (MIN_STAT_MINUTES). */
  enough: boolean;
  marks: Partial<Record<StatKey, StatMark>>;
  strengths: StatMark[];
  weaknesses: StatMark[];
  /** Priorité individuelle suggérée par le point le plus faible en match, ou null. */
  focus: string | null;
}

export interface TeamStats {
  /** Minutes cumulées / 990 : nombre de matchs complets couverts par les stats. */
  matches: number;
  xgPerMatch: number | null;
  xaPerMatch: number | null;
  passPct: number | null;
  /** Pressings réussis / tentés (%). */
  pressSuccess: number | null;
  tacklePct: number | null;
  headerPct: number | null;
  mistakes: number;
}

export type StatAlertKind = 'possession' | 'creation' | 'finishing' | 'pressing' | 'duels' | 'aerial' | 'mistakes';
export interface StatAlert {
  kind: StatAlertKind;
  level: 'warning' | 'info';
  value: number;
  /** Zones d'entraînement collectif à prioriser. */
  areas: EffArea[];
  /** Joueurs les moins bons sur ce point (les plus utilisés en premier). */
  names: string[];
}

export interface StatsBoard {
  players: PlayerStatReport[];
  team: TeamStats | null;
  alerts: StatAlert[];
  /** Zones d'entraînement à prioriser d'après les matchs, de la plus urgente à la moins urgente. */
  areas: EffArea[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Moyenne pondérée par les minutes d'une stat « par 90 » ou en %. */
function weighted(rows: PlayerStatReport[], k: StatKey): number | null {
  const v = rows.filter((r) => r.stats[k] != null && r.minutes > 0);
  const m = sum(v.map((r) => r.minutes));
  return m ? sum(v.map((r) => r.stats[k]! * r.minutes)) / m : null;
}

/**
 * Lecture du centre de données : chaque joueur comparé aux autres joueurs de sa ligne (rang de 0 à 1),
 * forces et faiblesses en match, priorité individuelle suggérée, puis les tendances de l'équipe qui
 * appellent une action (entraînement collectif, consignes).
 */
export function statsBoard(players: FmPlayer[], stats: Map<string, PlayerStats>): StatsBoard {
  const rows: PlayerStatReport[] = players
    .filter((p) => stats.has(p.id))
    .map((p) => {
      const s = stats.get(p.id)!;
      const minutes = s.minutes ?? 0;
      return { player: p, stats: s, minutes, enough: minutes >= MIN_STAT_MINUTES, marks: {}, strengths: [], weaknesses: [], focus: null };
    });
  if (!rows.length) return { players: [], team: null, alerts: [], areas: [] };

  const isGk = (r: PlayerStatReport) => r.player.positions[0] === 'GB';
  for (const m of STAT_METRICS) {
    for (const line of m.lines) {
      const peers = rows.filter((r) => r.enough && r.player.line === line && r.stats[m.key] != null);
      if (peers.length < 2) continue;
      // Rang : part des pairs moins bons (les ex æquo comptent pour moitié), 0 = le moins bon, 1 = le meilleur.
      const score = (r: PlayerStatReport) => (m.better === 'high' ? r.stats[m.key]! : -r.stats[m.key]!);
      for (const r of peers) {
        const worse = peers.filter((x) => score(x) < score(r)).length;
        const same = peers.filter((x) => x !== r && score(x) === score(r)).length;
        r.marks[m.key] = { key: m.key, value: r.stats[m.key]!, rank: (worse + same / 2) / (peers.length - 1) };
      }
    }
  }
  for (const r of rows) {
    const marks = Object.values(r.marks) as StatMark[];
    r.strengths = marks.filter((x) => x.rank >= 0.75).sort((a, b) => b.rank - a.rank).slice(0, 3);
    r.weaknesses = marks.filter((x) => x.rank <= 0.25).sort((a, b) => a.rank - b.rank).slice(0, 3);
    const gk = isGk(r);
    const weak = r.weaknesses.map((w) => STAT_METRICS.find((m) => m.key === w.key)?.focus).find((f) => f && f.startsWith('gk') === gk);
    r.focus = weak ?? null;
  }

  const used = rows.filter((r) => r.minutes > 0);
  const totalMin = sum(used.map((r) => r.minutes));
  const matches = totalMin / 990;
  const press = sum(used.map((r) => ((r.stats.press90 ?? 0) * r.minutes) / 90));
  const pressAtt = sum(used.map((r) => ((r.stats.pressAtt90 ?? 0) * r.minutes) / 90));
  const team: TeamStats = {
    matches,
    xgPerMatch: matches >= 1 ? sum(used.map((r) => r.stats.xg ?? 0)) / matches : null,
    xaPerMatch: matches >= 1 ? sum(used.map((r) => r.stats.xa ?? 0)) / matches : null,
    passPct: weighted(used.filter((r) => !isGk(r)), 'passPct'),
    pressSuccess: pressAtt > 0 ? (100 * press) / pressAtt : null,
    tacklePct: weighted(used, 'tacklePct'),
    headerPct: weighted(used.filter((r) => !isGk(r)), 'headerPct'),
    mistakes: sum(used.map((r) => r.stats.mistakes ?? 0)),
  };

  // Seuils de repère d'un championnat professionnel (données publiques des grands championnats) : en dessous,
  // l'équipe perd le ballon, crée peu ou presse dans le vide. Volontairement prudents pour ne signaler que l'évident.
  const alerts: StatAlert[] = [];
  const worst = (k: StatKey, lines: Line[] | null, n = 3) =>
    rows
      .filter((r) => r.enough && r.marks[k] && (!lines || (r.player.line && lines.includes(r.player.line))))
      .sort((a, b) => a.marks[k]!.rank - b.marks[k]!.rank || b.minutes - a.minutes)
      .slice(0, n)
      .map((r) => r.player.name);
  const push = (cond: boolean, a: Omit<StatAlert, 'names'>, k: StatKey, lines: Line[] | null) => {
    if (cond) alerts.push({ ...a, names: worst(k, lines) });
  };
  if (matches >= 3) {
    const t = team;
    push(t.passPct != null && t.passPct < 78, { kind: 'possession', level: t.passPct! < 72 ? 'warning' : 'info', value: t.passPct!, areas: ['passingStyle', 'buildUpStrategy'] }, 'passPct', null);
    push(t.xgPerMatch != null && t.xgPerMatch < 1.1, { kind: 'creation', level: t.xgPerMatch! < 0.8 ? 'warning' : 'info', value: t.xgPerMatch!, areas: ['chanceCreation', 'inPossessionShape'] }, 'chances90', ['MIL', 'ATT']);
    push(t.pressSuccess != null && t.pressSuccess < 28, { kind: 'pressing', level: t.pressSuccess! < 22 ? 'warning' : 'info', value: t.pressSuccess!, areas: ['pressingIntensity', 'pressingTrap'] }, 'press90', ['MIL', 'ATT']);
    push(t.tacklePct != null && t.tacklePct < 65, { kind: 'duels', level: 'info', value: t.tacklePct!, areas: ['outOfPossessionShape'] }, 'tacklePct', ['DEF', 'MIL']);
    push(t.headerPct != null && t.headerPct < 45, { kind: 'aerial', level: 'info', value: t.headerPct!, areas: ['outOfPossessionShape'] }, 'headerPct', ['DEF', 'ATT']);
    push(t.mistakes / matches >= 0.3, { kind: 'mistakes', level: 'warning', value: t.mistakes, areas: ['outOfPossessionShape', 'lineOfEngagement'] }, 'mistakes', ['GB', 'DEF', 'MIL']);
    const finishing = sum(used.map((r) => r.stats.xg ?? 0));
    const goals = sum(used.map((r) => r.player.goals ?? 0));
    push(finishing >= 5 && goals < finishing * 0.75, { kind: 'finishing', level: 'info', value: goals - finishing, areas: [] }, 'shotsOnTargetPct', ['ATT']);
  }
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1));
  return { players: rows, team, alerts, areas: [...new Set(alerts.flatMap((a) => a.areas))] };
}
