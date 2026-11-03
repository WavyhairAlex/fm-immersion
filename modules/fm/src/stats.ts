import type { FmPlayer } from './player';
import { toNumber } from './player';
import type { Line } from './positions';
import type { EffArea } from './project';
import type { FmSnapshot } from './snapshot';

/**
 * Statistiques de la saison (écran Centre de données de FM27), lues par chemins.json dans la section `joueur`
 * (`custom.joueurs[i]`) : propriétés de PersonReference sans contexte (decouverte.json, 01/11/2026).
 * - Depuis le 03/11/2026 : toutes les stats de match, en clés `stat_<Propriété>` (totaux surtout) ; les valeurs
 *   « par 90 » et les pourcentages sont recalculés ici à partir des totaux et des minutes, pour lire deux fois moins.
 * - Avant : 29 clés nommées (`statPassPct`, `statXgPer90`…), encore lues pour les anciens instantanés.
 */
export const STAT_KEYS = [
  'minutes', 'starts', 'xg', 'xgPer90', 'xa', 'xaPer90', 'shots90', 'shotsOnTargetPct',
  'passPct', 'passAtt90', 'progPass90', 'keyPass90', 'chances90', 'crossPct', 'dribbles90',
  'pressAtt90', 'press90', 'tacklePct', 'tackles90', 'interc90', 'blocks90', 'clear90',
  'headerPct', 'headersLost90', 'distance90', 'sprints90', 'mistakes', 'xgPrevented90', 'savePct',
  'possLost90', 'possWon90', 'fouls90', 'yellow', 'red', 'motm', 'winPct', 'points90', 'xgOverperf',
  'openPlayKeyPass90', 'keyTackles90', 'keyHeaders90', 'shotsBlocked90', 'npxg90',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type PlayerStats = Partial<Record<StatKey, number>>;
/** Toutes les stats lues, par nom de propriété du jeu (`PassAttempts`, `PossessionLost`…). */
export type RawStats = Record<string, number>;

/** Minutes jouées en dessous desquelles les stats « par 90 » ne disent rien (3 matchs complets). */
export const MIN_STAT_MINUTES = 270;

const legacyKey = (k: StatKey) => `stat${k[0]!.toUpperCase()}${k.slice(1)}`;
export const RAW_PREFIX = 'stat_';
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

/** Stats nommées déduites des propriétés brutes du jeu (totaux → par 90 et pourcentages). */
export function deriveStats(raw: RawStats): PlayerStats {
  const s: PlayerStats = {};
  const min = raw.Minutes;
  const set = (k: StatKey, v: number | null | undefined) => {
    if (v != null && Number.isFinite(v)) s[k] = v;
  };
  const per90 = (k: StatKey, total: string) => set(k, min && raw[total] != null ? (raw[total]! * 90) / min : null);
  const pct = (k: StatKey, ok: string, all: string) => set(k, raw[all] ? (100 * (raw[ok] ?? 0)) / raw[all]! : null);
  set('minutes', min);
  set('starts', raw.StartingAppearances);
  set('xg', raw.ExpectedGoals);
  per90('xgPer90', 'ExpectedGoals');
  set('xa', raw.ExpectedAssists);
  per90('xaPer90', 'ExpectedAssists');
  per90('shots90', 'ShotAttempts');
  pct('shotsOnTargetPct', 'ShotsOnTarget', 'ShotAttempts');
  pct('passPct', 'PassCompleted', 'PassAttempts');
  per90('passAtt90', 'PassAttempts');
  per90('progPass90', 'ProgressivePasses');
  per90('keyPass90', 'KeyPasses');
  per90('openPlayKeyPass90', 'OpenPlayKeyPasses');
  per90('chances90', 'ChancesCreated');
  pct('crossPct', 'CrossesCompleted', 'CrossAttempts');
  per90('dribbles90', 'DribblesMade');
  per90('pressAtt90', 'PressuresAttempted');
  per90('press90', 'PressuresCompleted');
  pct('tacklePct', 'TackleCompleted', 'TackleAttempts');
  per90('tackles90', 'TackleCompleted');
  per90('keyTackles90', 'KeyTackles');
  per90('interc90', 'Interceptions');
  per90('blocks90', 'Blocks');
  per90('shotsBlocked90', 'ShotsBlockedDefending');
  per90('clear90', 'Clearances');
  pct('headerPct', 'HeaderCompleted', 'HeaderAttempts');
  set('headersLost90', min && raw.HeaderAttempts != null ? ((raw.HeaderAttempts - (raw.HeaderCompleted ?? 0)) * 90) / min : null);
  per90('keyHeaders90', 'KeyHeaders');
  per90('distance90', 'DistanceRan');
  set('sprints90', raw.SprintsPer90);
  set('mistakes', raw.GoalMistakes);
  per90('xgPrevented90', 'ExpectedGoalsPrevented');
  set('savePct', raw.TotalSavePercentage);
  per90('possLost90', 'PossessionLost');
  per90('possWon90', 'PossessionWon');
  per90('fouls90', 'FoulsMade');
  set('yellow', raw.YellowCards);
  set('red', raw.RedCards);
  set('motm', raw.ManOfMatch);
  set('winPct', raw.GamesWinPercentage);
  set('points90', raw.PointsWonPer90);
  set('xgOverperf', raw.ExpectedGoalsOverperformance);
  per90('npxg90', 'NonPenaltyExpectedGoals');
  return s;
}

export interface MatchStats {
  stats: PlayerStats;
  raw: RawStats;
}

/** Stats par id de joueur : nommées (comparables) et brutes (toutes) ; vide si chemins.json ne les lit pas encore. */
export function matchStatsFull(snap: FmSnapshot): Map<string, MatchStats> {
  const out = new Map<string, MatchStats>();
  const custom = (snap as Raw).custom as Raw | null | undefined;
  const rows = custom && typeof custom === 'object' ? Object.values((custom.joueurs ?? {}) as Record<string, Raw>) : [];
  for (const r of rows) {
    if (!r || r.id == null) continue;
    const raw: RawStats = {};
    for (const [k, v] of Object.entries(r)) {
      if (!k.startsWith(RAW_PREFIX)) continue;
      const n = statValue(v);
      if (n != null) raw[k.slice(RAW_PREFIX.length)] = n;
    }
    const stats = deriveStats(raw);
    // Anciens instantanés : clés nommées lues telles quelles.
    for (const k of STAT_KEYS) {
      if (stats[k] != null) continue;
      const n = statValue(r[legacyKey(k)]);
      if (n != null) stats[k] = n;
    }
    if (Object.keys(stats).length || Object.keys(raw).length) out.set(String(r.id), { stats, raw });
  }
  return out;
}

/** Stats nommées par id de joueur. */
export function matchStats(snap: FmSnapshot): Map<string, PlayerStats> {
  return new Map([...matchStatsFull(snap)].map(([id, m]) => [id, m.stats]));
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
  { key: 'possLost90', lines: ['MIL', 'ATT'], better: 'low', focus: 'ballRetention' },
  { key: 'possWon90', lines: ['DEF', 'MIL'], better: 'high', focus: 'defensivePositioning' },
  { key: 'fouls90', lines: ['DEF', 'MIL'], better: 'low', focus: 'tackling' },
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

export type StatAlertKind = 'possession' | 'creation' | 'finishing' | 'pressing' | 'duels' | 'aerial' | 'mistakes' | 'discipline';
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
    const cards = sum(used.map((r) => r.stats.yellow ?? 0)) + 2 * sum(used.map((r) => r.stats.red ?? 0));
    push(cards / matches >= 2.5, { kind: 'discipline', level: 'info', value: cards / matches, areas: [] }, 'fouls90', ['DEF', 'MIL']);
    const finishing = sum(used.map((r) => r.stats.xg ?? 0));
    const goals = sum(used.map((r) => r.player.goals ?? 0));
    push(finishing >= 5 && goals < finishing * 0.75, { kind: 'finishing', level: 'info', value: goals - finishing, areas: [] }, 'shotsOnTargetPct', ['ATT']);
  }
  alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'warning' ? -1 : 1));
  return { players: rows, team, alerts, areas: [...new Set(alerts.flatMap((a) => a.areas))] };
}

/** Rangement des stats brutes du jeu pour l'affichage complet (libellés dans fm.stats.raw.<Propriété>). */
export const RAW_GROUPS: { id: string; props: string[] }[] = [
  { id: 'time', props: ['Minutes', 'StartingAppearances', 'SubAppearances', 'GamesWon', 'GamesLost', 'GamesWinPercentage', 'PointsWonPer90', 'TeamLeaguePointsPer90', 'TeamGoals', 'TeamConceded', 'ManOfMatch'] },
  { id: 'attack', props: ['GoalsPer90', 'ExpectedGoals', 'NonPenaltyExpectedGoals', 'ExpectedGoalsOverperformance', 'ExpectedGoalsPerShot', 'GoalsPerShotPercentage', 'ShotAttempts', 'ShotsOnTarget', 'ShotsOutsideBoxPer90', 'FreeKickShots', 'PenaltiesTaken', 'PenaltiesScored', 'Offsides', 'DribblesMade', 'FoulsAgainst'] },
  { id: 'passing', props: ['AssistsPer90', 'ExpectedAssists', 'PassAttempts', 'PassCompleted', 'ProgressivePasses', 'KeyPasses', 'OpenPlayKeyPasses', 'ChancesCreated', 'CrossAttempts', 'CrossesCompleted', 'OpenPlayCrossesAttempted', 'OpenPlayCrossesCompleted', 'Possession', 'PossessionLost'] },
  { id: 'defence', props: ['PressuresAttempted', 'PressuresCompleted', 'PossessionWon', 'TackleAttempts', 'TackleCompleted', 'KeyTackles', 'Interceptions', 'Blocks', 'ShotsBlockedDefending', 'Clearances', 'HeaderAttempts', 'HeaderCompleted', 'KeyHeaders', 'GoalMistakes'] },
  { id: 'physical', props: ['DistanceRan', 'SprintsPer90'] },
  { id: 'keeper', props: ['Conceded', 'CleanSheets', 'TotalSaves', 'SavesHeld', 'SavesParried', 'SavesTipped', 'TotalSavePercentage', 'TotalExpectedSavePercentage', 'ExpectedGoalsPrevented', 'PenaltiesFaced', 'PenaltiesSaved'] },
  { id: 'discipline', props: ['FoulsMade', 'YellowCards', 'RedCards'] },
];

/**
 * Suivi des progrès : les stats du jeu sont des cumuls de saison. En retranchant les totaux d'un instantané plus
 * ancien, on obtient les stats de la période récente seule, comparées à celles d'avant. Seules les mesures
 * calculées à partir de totaux (par 90 et %) s'y prêtent ; les valeurs déjà moyennées par le jeu sont ignorées.
 */
export const TREND_KEYS: StatKey[] = STAT_METRICS.map((m) => m.key).filter((k) => k !== 'mistakes' && k !== 'savePct');
const TREND_PCT = new Set<StatKey>(['passPct', 'tacklePct', 'headerPct', 'shotsOnTargetPct', 'crossPct']);
/** Écart d'une période à l'autre jugé significatif : 3 points pour un %, 15 % de la valeur pour un « par 90 ». */
function significant(k: StatKey, before: number, recent: number): boolean {
  const d = Math.abs(recent - before);
  if (TREND_PCT.has(k)) return d >= 3;
  if (k === 'distance90') return d >= Math.max(0.3, 0.04 * Math.abs(before));
  return d >= Math.max(0.1, 0.15 * Math.abs(before));
}
/** Écart à partir duquel on parle d'une période : une semaine de jeu, et au moins 2 matchs joués entre les deux. */
export const TREND_MIN_DAYS = 7;
export const TREND_MIN_MINUTES = 180;
/** Fenêtre visée pour la période récente (jours de jeu). */
export const TREND_WINDOW_DAYS = 28;

export interface StatTrend {
  key: StatKey;
  before: number;
  recent: number;
  /** 'up' = mieux, 'down' = moins bien (sens `better` appliqué), 'flat' = écart non significatif. */
  dir: 'up' | 'down' | 'flat';
}
export interface PlayerTrend {
  /** Minutes jouées pendant la période récente. */
  minutes: number;
  trends: Partial<Record<StatKey, StatTrend>>;
  improved: StatTrend[];
  declined: StatTrend[];
}
export type TeamTrendKey = 'passPct' | 'pressSuccess' | 'tacklePct' | 'headerPct' | 'xgPerMatch';
export interface TeamTrend {
  key: TeamTrendKey;
  before: number;
  recent: number;
  dir: 'up' | 'down' | 'flat';
}
export interface StatsTrends {
  /** Date de jeu de l'instantané de référence (début de la période récente), ou null si l'historique est trop court. */
  since: string | null;
  /** Date du plus ancien instantané qui contient des stats (pour dire quand la tendance sera disponible). */
  firstDate: string | null;
  players: Map<string, PlayerTrend>;
  team: TeamTrend[];
}

const DAY_MS = 86_400_000;
const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;

/** Totaux d'une période : différence des cumuls, ou null si la saison a changé entre les deux (cumuls remis à zéro). */
function rawDelta(now: RawStats, ref: RawStats): RawStats | null {
  if ((now.Minutes ?? 0) < (ref.Minutes ?? 0)) return null;
  const out: RawStats = {};
  for (const [k, v] of Object.entries(now)) out[k] = v - (ref[k] ?? 0);
  return out;
}

function teamRates(rows: RawStats[]): Record<TeamTrendKey, number | null> {
  const tot = (k: string) => sum(rows.map((r) => r[k] ?? 0));
  const pct = (ok: string, all: string) => (tot(all) > 0 ? (100 * tot(ok)) / tot(all) : null);
  // Gardiens exclus : 10 joueurs de champ × 90 minutes = un match.
  const matches = tot('Minutes') / 900;
  return {
    passPct: pct('PassCompleted', 'PassAttempts'),
    pressSuccess: pct('PressuresCompleted', 'PressuresAttempted'),
    tacklePct: pct('TackleCompleted', 'TackleAttempts'),
    headerPct: pct('HeaderCompleted', 'HeaderAttempts'),
    xgPerMatch: matches >= 1 ? tot('ExpectedGoals') / matches : null,
  };
}

/**
 * Progrès en match : période récente (depuis l'instantané le plus proche de TREND_WINDOW_DAYS jours avant le
 * dernier) comparée à la saison jusque-là, pour chaque joueur et pour l'équipe. `history` : instantanés du plus
 * ancien au plus récent, le dernier étant l'instantané courant.
 */
export function statsTrends(history: { gameDate: string; data: FmSnapshot }[], players: FmPlayer[]): StatsTrends {
  const withStats = history.map((h) => ({ gameDate: h.gameDate, stats: matchStatsFull(h.data) })).filter((h) => [...h.stats.values()].some((m) => m.raw.Minutes != null));
  const empty: StatsTrends = { since: null, firstDate: withStats[0]?.gameDate ?? null, players: new Map(), team: [] };
  const now = withStats.at(-1);
  if (!now) return empty;
  // Référence : le plus récent instantané au moins TREND_WINDOW_DAYS jours avant, sinon le plus ancien s'il est à plus d'une semaine.
  const older = withStats.filter((h) => daysBetween(h.gameDate, now.gameDate) >= TREND_MIN_DAYS);
  const ref = older.filter((h) => daysBetween(h.gameDate, now.gameDate) >= TREND_WINDOW_DAYS).at(-1) ?? older[0];
  if (!ref) return empty;

  const out = new Map<string, PlayerTrend>();
  const recentRows: RawStats[] = [];
  const beforeRows: RawStats[] = [];
  const byId = new Map(players.map((p) => [p.id, p]));
  for (const [id, m] of now.stats) {
    const r = ref.stats.get(id);
    if (!r || r.raw.Minutes == null) continue;
    const delta = rawDelta(m.raw, r.raw);
    if (!delta) continue;
    const p = byId.get(id);
    if (p?.line !== 'GB') {
      recentRows.push(delta);
      beforeRows.push(r.raw);
    }
    if ((delta.Minutes ?? 0) < TREND_MIN_MINUTES || (r.raw.Minutes ?? 0) < TREND_MIN_MINUTES) continue;
    const recent = deriveStats(delta);
    const before = deriveStats(r.raw);
    const line = p?.line ?? null;
    const trends: Partial<Record<StatKey, StatTrend>> = {};
    for (const metric of STAT_METRICS) {
      const k = metric.key;
      if (!TREND_KEYS.includes(k) || (line && !metric.lines.includes(line))) continue;
      const b = before[k];
      const n = recent[k];
      if (b == null || n == null) continue;
      const better = metric.better === 'high' ? n > b : n < b;
      trends[k] = { key: k, before: b, recent: n, dir: significant(k, b, n) ? (better ? 'up' : 'down') : 'flat' };
    }
    const list = Object.values(trends) as StatTrend[];
    // Plus grand écart relatif d'abord.
    const gap = (t: StatTrend) => Math.abs(t.recent - t.before) / Math.max(Math.abs(t.before), TREND_PCT.has(t.key) ? 1 : 0.1);
    out.set(id, {
      minutes: delta.Minutes ?? 0,
      trends,
      improved: list.filter((t) => t.dir === 'up').sort((a, b) => gap(b) - gap(a)),
      declined: list.filter((t) => t.dir === 'down').sort((a, b) => gap(b) - gap(a)),
    });
  }

  const team: TeamTrend[] = [];
  const rb = teamRates(beforeRows);
  const rn = teamRates(recentRows);
  for (const k of ['passPct', 'pressSuccess', 'tacklePct', 'headerPct', 'xgPerMatch'] as TeamTrendKey[]) {
    const b = rb[k];
    const n = rn[k];
    if (b == null || n == null) continue;
    const sig = k === 'xgPerMatch' ? Math.abs(n - b) >= Math.max(0.15, 0.15 * b) : Math.abs(n - b) >= 3;
    team.push({ key: k, before: b, recent: n, dir: sig ? (n > b ? 'up' : 'down') : 'flat' });
  }
  return { since: ref.gameDate, firstDate: withStats[0]!.gameDate, players: out, team };
}
