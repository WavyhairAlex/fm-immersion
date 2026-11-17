import { nextWindows, stayDates } from './evolution';
import type { FmPlayer } from './player';
import type { PosCode } from './positions';
import { projectLevel } from './progress';
import { bestTactic, shiftPlayer, templatePlan, type CoachPrefs, type ProjectTemplate } from './project';
import type { SquadAt } from './progress';
import type { TacticEngine } from './tactic';
import { paValue, projectCa, valueModel } from './trading';
import { firstTeamBar } from './youth';

/*
 * Effectif saison par saison : le onze de la tactique choisie au début de chacune des prochaines saisons, jeunes du
 * centre (réserve, équipes de jeunes) compris. Chaque joueur est vieilli (progression mesurée sur les instantanés, sinon
 * courbe d'âge), les départs conseillés et les fins de contrat non prolongées sont faits (comme Tactique › Projet), puis
 * chaque poste revient au meilleur joueur présent, qu'il soit de l'équipe première ou du centre.
 * But : voir quel poste un jeune tiendra, et quand ne pas acheter. Aucune arrivée n'est inventée.
 */

/** Écart sous le niveau des titulaires (adéquation sur 20) à partir duquel un poste est « à recruter ». */
export const RECRUIT_GAP = 1.5;
/** Baisse de niveau d'une saison à l'autre qui fait dire « en baisse ». */
export const DECLINE_STEP = 0.3;
/** Âge auquel on estime la valeur de revente d'un espoir. */
export const RESALE_AGE = 23;
/** Âge du pic de carrière, où l'on juge si un jeune reste au niveau du onze sur le long terme. */
export const PEAK_AGE = 27;
/** Marge (adéquation sur 20) autour du niveau des titulaires : au-dessus = titulaire durable, en dessous = transition. */
export const LASTING_MARGIN = 0.5;

export type SeasonCellState = 'ok' | 'youth' | 'ending' | 'recruit';

export interface SeasonCell {
  pos: PosCode;
  /** Joueur vieilli à cette saison (âge et niveau projetés). */
  player: FmPlayer | null;
  fit: number | null;
  /** Joueur du centre (réserve ou équipe de jeunes aujourd'hui). */
  youth: boolean;
  /** Équipe de jeunes d'où il vient (« Malženice U19 »). */
  team: string | null;
  state: SeasonCellState;
  /** Pourquoi « ending » : fin de contrat (date) avant la saison suivante, ou baisse de niveau. */
  leaves: string | null;
  declining: boolean;
  /** Il prend la place d'un autre joueur par rapport à la saison précédente. */
  newcomer: boolean;
}

export interface SeasonStage {
  /** Début de la saison (ISO) ; date du jeu pour la saison en cours. */
  date: string;
  /** Saison « 2026/27 ». */
  label: string;
  years: number;
  cells: SeasonCell[];
}

export type SlotVerdict = 'youth' | 'buy' | 'ok';

export interface SlotOutlook {
  index: number;
  pos: PosCode;
  verdict: SlotVerdict;
  /** Jeune qui tiendra le poste et saison où il devient titulaire. */
  youth: FmPlayer | null;
  youthTeam: string | null;
  from: string | null;
  /** Première saison où le poste est à recruter (sans jeune ensuite). */
  buyFrom: string | null;
  /** Titulaire actuel qui part ou baisse avant que le jeune arrive. */
  current: FmPlayer | null;
  /** Le titulaire actuel part (fin de contrat ou départ conseillé) : date. */
  currentLeaves: string | null;
  /** Verdict long terme du jeune qui prend le poste. */
  viability: Viability | null;
}

export type YouthAdvice = 'promote' | 'loan' | 'keep' | 'extend' | 'sell';

/**
 * Le jeune tiendra-t-il le poste sur le long terme ? Son adéquation au poste à son pic (27 ans), comparée au niveau des
 * titulaires d'aujourd'hui : durable (au-dessus), juste (autour), transition (il prend la place un temps, puis sera dépassé).
 */
export type Viability = 'lasting' | 'fair' | 'stopgap';

export interface YouthPath {
  player: FmPlayer;
  team: string | null;
  /** Poste du onze qu'il tiendra, et saison où il devient titulaire (null : pas dans les saisons regardées). */
  pos: PosCode | null;
  from: string | null;
  /** Valeur estimée à 23 ans (null sans CA/PA lus) et valeur aujourd'hui. */
  valueAt: number | null;
  valueNow: number | null;
  advice: YouthAdvice;
  /** Adéquation au poste attendue à son pic et verdict long terme (null s'il ne tient aucun poste dans les saisons regardées). */
  peakFit: number | null;
  viability: Viability | null;
  /** Projection appuyée sur le CA/PA lus en mémoire ; sinon courbe d'âge seule (moins sûr). */
  reliable: boolean;
}

export interface SeasonPlan {
  stages: SeasonStage[];
  slots: SlotOutlook[];
  youth: YouthPath[];
  /** Postes tenus par un jeune du centre à la dernière saison regardée. */
  youthHeld: number;
  /** Plus-value estimée des 5 meilleurs espoirs (valeur à 23 ans − valeur aujourd'hui), null sans CA/PA. */
  upside: number | null;
}

const DAY = 864e5;
const yearsBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / (365.25 * DAY);

/** « 2026/27 » pour une saison qui commence en `seasonStart` (mois 1-12) et contient la date. */
export function seasonLabel(date: string, seasonStart = 8): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  const y = d.getUTCMonth() + 1 >= seasonStart ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  // Saison sur une année civile (championnats d'été) : « 2027 ».
  if (seasonStart <= 2) return String(y);
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

/** Tactique de référence : celle choisie dans Tactique, sinon la meilleure pour l'effectif d'aujourd'hui. */
function templateOf(engine: TacticEngine, squad: FmPlayer[], coach: CoachPrefs): ProjectTemplate | null {
  if (coach.template) return coach.template;
  const pick = bestTactic(engine, squad, coach);
  if (!pick) return null;
  return { style: pick.style, form: pick.form, source: 'auto', slots: pick.plan.slots.map((s) => ({ pos: s.pos, ...(s.posOOP ? { posOOP: s.posOOP } : {}), ip: s.ip, oop: s.oop })) };
}

export function seasonPlan(
  engine: TacticEngine,
  first: FmPlayer[],
  reserve: FmPlayer[],
  gameDate: string,
  coach: CoachPrefs = {},
  history: SquadAt[] = [],
  seasons = 3,
  leavingIds: ReadonlySet<string> = new Set(),
  loanUntil: ReadonlyMap<string, string | null> = new Map(),
): SeasonPlan | null {
  const list = first.filter((p) => Object.keys(p.attributes).length);
  const ids = new Set(list.map((p) => p.id));
  const youthList = reserve.filter((p) => Object.keys(p.attributes).length && !ids.has(p.id));
  if (!list.length) return null;
  const tpl = templateOf(engine, list, coach);
  if (!tpl) return null;
  const start = coach.seasonStart ?? 8;
  const windows = nextWindows(gameDate, start, seasons * 2);
  const { until } = stayDates(engine, list, gameDate, coach, history, windows, leavingIds, loanUntil);
  const youthIds = new Set(youthList.map((p) => p.id));
  const teamOf = new Map(youthList.map((p) => [p.id, p.team]));
  const dates = [gameDate.slice(0, 10), ...windows.filter((w) => w.kind === 'summer').map((w) => w.date)].slice(0, seasons);

  const stages: SeasonStage[] = [];
  let bar: number | null = null;
  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const next = dates[i + 1] ?? new Date(Date.parse(date) + 365 * DAY).toISOString().slice(0, 10);
    const years = Math.max(0, yearsBetween(gameDate, date));
    // Blessures et suspensions sont passagères : sur une saison, tout le monde compte.
    const present = [...list.filter((p) => i === 0 || !until.get(p.id) || until.get(p.id)! > date), ...youthList];
    const squad = present.map((p) => ({ ...shiftPlayer(p, years, history), injury: null, injuryDays: null, suspension: null }));
    const plan = templatePlan(engine, tpl, squad);
    if (i === 0) bar = firstTeamBar(plan.slots.filter((s) => s.player && !youthIds.has(s.player.id)));
    const prev = stages[i - 1];
    const cells = plan.slots.map((s, k): SeasonCell => {
      const p = s.player;
      const youth = !!p && youthIds.has(p.id);
      const u = p ? (until.get(p.id) ?? null) : null;
      const leaves = p && !youth && u && u <= next ? u : null;
      const before = prev?.cells[k]?.player;
      const declining = !!p && !!before && before.id === p.id && p.level != null && before.level != null && p.level < before.level - DECLINE_STEP;
      const weak = s.fit == null || (bar != null && s.fit < bar - RECRUIT_GAP);
      const state: SeasonCellState = !p || weak ? 'recruit' : youth ? 'youth' : leaves || declining ? 'ending' : 'ok';
      return { pos: s.pos, player: p, fit: s.fit, youth, team: p ? (teamOf.get(p.id) ?? null) : null, state, leaves, declining, newcomer: !!prev && !!p && before?.id !== p.id };
    });
    stages.push({ date, label: seasonLabel(date, start), years, cells });
  }

  // Bilan par poste : un jeune prend-il la place, ou faut-il acheter ?
  const slots: SlotOutlook[] = (stages[0]?.cells ?? []).map((c0, k) => {
    const col = stages.map((st) => st.cells[k]!);
    const yi = col.findIndex((c) => c.state === 'youth');
    const lastBuy = col.findIndex((c, i) => c.state === 'recruit' && !col.slice(i + 1).some((x) => x.state === 'youth'));
    const verdict: SlotVerdict = yi >= 0 ? 'youth' : lastBuy >= 0 ? 'buy' : 'ok';
    const current = c0.youth ? null : c0.player;
    return {
      index: k,
      pos: c0.pos,
      verdict,
      youth: yi >= 0 ? col[yi]!.player : null,
      youthTeam: yi >= 0 ? col[yi]!.team : null,
      from: yi >= 0 ? stages[yi]!.label : null,
      buyFrom: lastBuy >= 0 ? stages[lastBuy]!.label : null,
      current,
      currentLeaves: current ? (until.get(current.id) ?? null) : null,
      viability: null,
    };
  });

  const last = stages.at(-1);
  // Chaque espoir : poste tenu, saison, valeur à 23 ans, conseil, tenue sur le long terme.
  const model = valueModel([...list, ...youthList].filter((p) => p.ca != null).map((p) => ({ ca: p.ca!, age: p.age, valueRaw: p.value })));
  const youth: YouthPath[] = youthList.map((p) => {
    const at = slots.find((s) => s.youth?.id === p.id) ?? null;
    const age = p.age ?? 18;
    let valueAt: number | null = null;
    if (p.ca != null && p.pa != null) {
      const yrs = Math.max(0, RESALE_AGE - age);
      valueAt = model.value(projectCa(p.ca, paValue(p.pa, p.ca), age, yrs), Math.max(age, RESALE_AGE));
    }
    const fromIdx = at ? stages.findIndex((st) => st.label === at.from) : -1;
    const pot = p.stars?.potential ?? null;
    const daysLeft = p.contractEnd ? (Date.parse(p.contractEnd) - Date.parse(gameDate)) / DAY : null;
    const advice: YouthAdvice =
      at && daysLeft != null && daysLeft <= 365
        ? 'extend'
        : fromIdx === 0 || fromIdx === 1
          ? 'promote'
          : fromIdx >= 2
            ? age >= 19
              ? 'loan'
              : 'keep'
            : pot != null && pot <= 2 && age >= 19
              ? 'sell'
              : age >= 19 && (pot ?? 0) >= 3
                ? 'loan'
                : 'keep';
    // Long terme : adéquation à la dernière saison regardée, prolongée jusqu'au pic par la même progression de niveau
    // (le vieillissement décale tous les attributs d'autant).
    let peakFit: number | null = null;
    let viability: Viability | null = null;
    // Dernière saison où il tient le poste (un jeune déjà repassé derrière à la saison suivante compte comme transition).
    const held = at ? stages.map((st) => st.cells[at.index]).map((c, j) => (c?.player?.id === p.id ? j : -1)).filter((j) => j >= 0).at(-1) : undefined;
    if (at && last && held != null) {
      const st = stages[held]!;
      const fitLast = st.cells[at.index]!.fit;
      const lvlLast = projectLevel(p, st.years, history);
      const lvlPeak = held < stages.length - 1 ? lvlLast : projectLevel(p, Math.max(st.years, PEAK_AGE - age), history);
      if (fitLast != null && lvlLast != null && lvlPeak != null) {
        peakFit = Math.max(1, Math.min(20, fitLast + lvlPeak - lvlLast));
        viability = held < stages.length - 1 ? 'stopgap' : bar == null ? null : peakFit >= bar + LASTING_MARGIN ? 'lasting' : peakFit >= bar - LASTING_MARGIN ? 'fair' : 'stopgap';
      }
      at.viability = viability;
    }
    return { player: p, team: p.team, pos: at?.pos ?? null, from: at?.from ?? null, valueAt, valueNow: p.value, advice, peakFit, viability, reliable: p.ca != null && p.pa != null };
  });
  const rank = (y: YouthPath) => (y.from ? 0 : 1);
  youth.sort((a, b) => rank(a) - rank(b) || (a.from ?? '').localeCompare(b.from ?? '') || (b.valueAt ?? -1) - (a.valueAt ?? -1) || (a.player.age ?? 99) - (b.player.age ?? 99));
  const valued = youth.filter((y) => y.valueAt != null).sort((a, b) => b.valueAt! - a.valueAt!).slice(0, 5);
  const upside = valued.length ? valued.reduce((s, y) => s + Math.max(0, y.valueAt! - (y.valueNow ?? 0)), 0) : null;
  return { stages, slots, youth, youthHeld: last ? last.cells.filter((c) => c.state === 'youth').length : 0, upside };
}

/** Bilan d'un poste du Mercato : le jeune du centre qui tiendra ce poste, s'il y en a un. */
export function youthCover(plan: SeasonPlan | null, pos: PosCode): SlotOutlook | null {
  if (!plan) return null;
  return plan.slots.find((s) => s.pos === pos && s.verdict === 'youth') ?? null;
}
