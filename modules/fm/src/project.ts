import { toNumber, unavailable, type FmPlayer } from './player';
import { POS_ORDER, type PosCode } from './positions';
import { projectLevel, type SquadAt } from './progress';
import type { FmSnapshot } from './snapshot';
import type { Target } from './targets';
import { FORMATIONS, STYLE_FORMS, attrKey, attrOf, avg, type FormationPlan, type Phase, type RoleRef, type Slot, type StyleRef, type TacticEngine } from './tactic';

/**
 * Projet du coach (portage de la page Archivix) : style visé → onze cible, postes à recruter,
 * plan d'entraînement, moment de bascule, cibles du mercato, et jauges d'efficacité tactique.
 */

/* ---------- Efficacité tactique : estimation ---------- */

/** Attributs mentaux de lecture du jeu, utilisés pour estimer la capacité tactique de l'effectif. */
export const TACT_ABILITY = ['Decisions', 'Anticipation', 'Teamwork', 'Concentration', 'Positioning', 'Vision', 'Composure'];
/** Complexité estimée de chaque style (1 à 5) : pressing intense et jeu de passes fluide sont les plus durs à assimiler. */
const STYLE_COMPLEXITY: Record<string, number> = { tikitaka: 5, 'tikitaka-v': 5, possession: 4, gegenpress: 4, 'counter-fluid': 3, wings: 3, 'counter-direct': 2, catenaccio: 2, 'ultra-def': 2, longball: 1 };
export const styleComplexity = (st: StyleRef) => STYLE_COMPLEXITY[st.id] ?? 3;
/** Capacité tactique souhaitable pour une complexité donnée (1 → 7 ; 5 → 13). */
export const abilityNeeded = (st: StyleRef) => 5.5 + styleComplexity(st) * 1.5;

/** Moyenne des attributs de lecture du jeu des 16 meilleurs joueurs. */
export function tactAbility(list: FmPlayer[]): number | null {
  const pool = list
    .filter((p) => Object.keys(p.attributes).length)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0))
    .slice(0, 16);
  return avg(pool.map((p) => avg(TACT_ABILITY.map((k) => attrOf(p, k)))));
}

/* ---------- Efficacité tactique : jauges du jeu ---------- */

/** Zones de compréhension tactique de FM27, chacune travaillée par la séance d'entraînement du même nom. */
export const EFF_AREAS = ['buildUpStrategy', 'chanceCreation', 'inPossessionShape', 'outOfPossessionShape', 'lineOfEngagement', 'passingStyle', 'pressingIntensity', 'pressingTrap'] as const;
export type EffArea = (typeof EFF_AREAS)[number];
export const EFF_COMPONENTS = ['tacticalUnderstanding', 'playerAbility', 'playerBuyIn', 'nextMatchInformation'] as const;
export const EFF_SUBSCORES = ['capability', 'roleSuitability', 'managerSupport', 'relationships'] as const;

export interface Range {
  min: number | null;
  max: number | null;
  mid: number | null;
}

/** Valeur du jeu (nombre ou fourchette {min, max}) ramenée à une fourchette et son milieu. */
export function range(v: unknown): Range | null {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'string') {
    const n = toNumber(v);
    return n == null ? null : { min: n, max: n, mid: n };
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const a = toNumber(o.min);
    const b = toNumber(o.max);
    const lo = a ?? b;
    const hi = b ?? a;
    return lo == null || hi == null ? null : { min: lo, max: hi, mid: (lo + hi) / 2 };
  }
  return null;
}

/** Texte lisible d'une valeur brute du jeu (texte, nombre ou objet avec un libellé). */
export function rawText(v: unknown): string {
  if (v == null) return '–';
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const t = o.Text ?? o.Name ?? o.label ?? o.text;
    return typeof t === 'string' ? t : JSON.stringify(v);
  }
  return String(v);
}

export interface Effectiveness {
  overall: Range | null;
  complexity: Range | null;
  comprehension: Range | null;
  components: Partial<Record<(typeof EFF_COMPONENTS)[number], Range>>;
  subScores: Partial<Record<(typeof EFF_SUBSCORES)[number], Range>>;
  areas: { id: EffArea; value: Range }[];
  /** Les trois zones les moins comprises : séances à programmer en priorité. */
  weakest: EffArea[];
  flags: string[];
  advice: { group: string; text: string; pro: boolean | null }[];
}

const pick = <K extends string>(keys: readonly K[], obj: unknown) => {
  const o = (obj ?? {}) as Record<string, unknown>;
  const out: Partial<Record<K, Range>> = {};
  for (const k of keys) {
    const r = range(o[k]);
    if (r) out[k] = r;
  }
  return out;
};

/** Bloc « effectiveness » de l'instantané (jauges réelles du jeu), s'il est présent. */
export function effectiveness(snap: FmSnapshot): Effectiveness | null {
  const e = snap.effectiveness as Record<string, unknown> | undefined;
  if (!e || typeof e !== 'object') return null;
  const areasObj = pick(EFF_AREAS, e.understandingAreas);
  const areas = EFF_AREAS.flatMap((id) => (areasObj[id] ? [{ id, value: areasObj[id]! }] : []));
  const flags = Object.entries((e.statusFlags ?? {}) as Record<string, unknown>)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const advice = Object.entries((e.advice ?? {}) as Record<string, unknown>).flatMap(([group, xs]) =>
    (Array.isArray(xs) ? xs : []).map((a) => ({ group, text: rawText(a), pro: typeof (a as { IsPro?: unknown })?.IsPro === 'boolean' ? (a as { IsPro: boolean }).IsPro : null })),
  );
  return {
    overall: range(e.overall),
    complexity: range(e.complexity),
    comprehension: range(e.comprehension),
    components: pick(EFF_COMPONENTS, e.components),
    subScores: pick(EFF_SUBSCORES, e.subScores),
    areas,
    weakest: [...areas].sort((a, b) => (a.value.mid ?? 0) - (b.value.mid ?? 0)).slice(0, 3).map((a) => a.id),
    flags,
    advice,
  };
}

/* ---------- Projet du coach ---------- */

/** Zones de compréhension à prioriser à l'entraînement collectif selon le style visé. */
export const STYLE_TRAINING: Record<string, EffArea[]> = {
  possession: ['buildUpStrategy', 'passingStyle', 'inPossessionShape', 'pressingIntensity'],
  tikitaka: ['passingStyle', 'buildUpStrategy', 'inPossessionShape', 'lineOfEngagement'],
  'tikitaka-v': ['passingStyle', 'chanceCreation', 'inPossessionShape', 'buildUpStrategy'],
  gegenpress: ['pressingIntensity', 'pressingTrap', 'lineOfEngagement', 'outOfPossessionShape'],
  wings: ['chanceCreation', 'inPossessionShape', 'passingStyle', 'outOfPossessionShape'],
  longball: ['passingStyle', 'chanceCreation', 'outOfPossessionShape', 'buildUpStrategy'],
  'counter-fluid': ['outOfPossessionShape', 'chanceCreation', 'passingStyle', 'pressingIntensity'],
  'counter-direct': ['outOfPossessionShape', 'chanceCreation', 'lineOfEngagement', 'passingStyle'],
  catenaccio: ['outOfPossessionShape', 'lineOfEngagement', 'buildUpStrategy', 'pressingTrap'],
  'ultra-def': ['outOfPossessionShape', 'lineOfEngagement', 'pressingTrap', 'buildUpStrategy'],
};
export const trainingFor = (st: StyleRef): EffArea[] => STYLE_TRAINING[st.id] ?? ['inPossessionShape', 'outOfPossessionShape', 'passingStyle', 'buildUpStrategy'];

export interface CoachPrefs {
  style?: string;
  form?: string | null;
  /** Niveau visé, en % d'adéquation au rôle. */
  target?: number;
  /** Mois de reprise du championnat (1 à 12), pour situer la phase d'entraînement. */
  seasonStart?: number;
  /** Statut du club (pro, semi, amateur) et jours d'entraînement d'un club à temps partiel. */
  clubStatus?: 'pro' | 'semi' | 'amateur';
  trainingDays?: number[];
}
export const TARGETS = [45, 50, 55, 60, 65, 70];

export type SlotStatus = 'ready' | 'develop' | 'recruit';
export interface ProjectSlot extends Slot {
  status: SlotStatus;
  /** Gravité pour un poste à recruter : proche du niveau visé (warn) ou loin (bad). */
  tone: 'good' | 'info' | 'warn' | 'bad';
}
export interface WorkPlan {
  player: FmPlayer;
  role: RoleRef | null;
  phase: Phase;
  fit: number | null;
  /** Les trois attributs clés les plus faibles pour ce rôle, à cibler en entraînement individuel. */
  weak: { key: string; value: number }[];
  slot: ProjectSlot | null;
}
export interface Project {
  style: StyleRef;
  form: string;
  forms: string[];
  score: number;
  slots: ProjectSlot[];
  plans: WorkPlan[];
  /** Seuil d'adéquation sur 20. */
  threshold: number;
  target: number;
}

/** Attributs clés d'un rôle (clés du jeu), du plus au moins important. */
export function keyAttrs(engine: TacticEngine, code: string, phase: Phase, n: number): string[] {
  const r = engine.roles.get(code);
  if (!r) return [];
  const w = phase === 'oop' && r.weightsOOP ? r.weightsOOP : r.weights;
  return Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => attrKey(k));
}

/** Attributs prioritaires pour recruter sur un poste : clés du rôle avec ballon, puis sans ballon. */
export const recruitAttrs = (engine: TacticEngine, sl: Slot) => [...new Set([...keyAttrs(engine, sl.ip, 'ip', 4), ...keyAttrs(engine, sl.oop, 'oop', 2)])];

const canPlay = (engine: TacticEngine, p: FmPlayer, r: RoleRef) => engine.rolePositions(r).some((pos) => p.positions.includes(pos));

export function buildProject(engine: TacticEngine, list: FmPlayer[], prefs: CoachPrefs): Project | null {
  const style = engine.ref.styles.find((s) => s.id === prefs.style) ?? engine.ref.styles[0];
  if (!style) return null;
  const forms = (STYLE_FORMS[style.id] ?? []).filter((f) => FORMATIONS[f]);
  const form = prefs.form && FORMATIONS[prefs.form] ? prefs.form : (forms[0] ?? '4-3-3');
  const target = prefs.target ?? 55;
  const T = (target / 100) * 20;
  const plan = engine.formationPlan(form, style, list);
  const slots: ProjectSlot[] = plan.slots.map((sl) => {
    if (!sl.player || sl.fit == null) return { ...sl, status: 'recruit', tone: 'bad' };
    if (sl.fit >= T) return { ...sl, status: 'ready', tone: 'good' };
    if ((sl.player.age ?? 99) <= 23 && sl.fit >= T - 2) return { ...sl, status: 'develop', tone: 'info' };
    return { ...sl, status: 'recruit', tone: sl.fit >= T - 2 ? 'warn' : 'bad' };
  });
  // Rôles du projet : pour un titulaire, celui de son poste ; sinon le rôle du projet où il est le plus adapté.
  const roles = [...new Set(slots.flatMap((s) => [`${s.ip}|ip`, `${s.oop}|oop`]))].map((x) => x.split('|') as [string, Phase]);
  const plans: WorkPlan[] = list
    .filter((p) => Object.keys(p.attributes).length)
    .map((p) => {
      const slot = slots.find((s) => s.player?.id === p.id) ?? null;
      let best: { code: string; phase: Phase; fit: number | null } | null = slot ? { code: slot.ip, phase: 'ip', fit: engine.roleFit(p, slot.ip, 'ip', slot.pos) } : null;
      if (!best)
        for (const [code, phase] of roles) {
          const r = engine.roles.get(code);
          if (!r || !canPlay(engine, p, r)) continue;
          const fit = engine.roleFit(p, code, phase);
          if (fit != null && (!best || fit > (best.fit ?? 0))) best = { code, phase, fit };
        }
      const weak = best
        ? keyAttrs(engine, best.code, best.phase, 8)
            .map((key) => ({ key, value: attrOf(p, key) }))
            .filter((x): x is { key: string; value: number } => x.value != null)
            .sort((a, b) => a.value - b.value)
            .slice(0, 3)
        : [];
      return { player: p, role: best ? (engine.roles.get(best.code) ?? null) : null, phase: best?.phase ?? 'ip', fit: best?.fit ?? null, weak, slot };
    })
    .sort((a, b) => POS_ORDER.indexOf(a.player.positions[0] ?? 'BT') - POS_ORDER.indexOf(b.player.positions[0] ?? 'BT') || (b.player.level ?? 0) - (a.player.level ?? 0));
  return { style, form, forms, score: plan.score, slots, plans, threshold: T, target };
}

/* ---------- Tactique à jouer maintenant ---------- */

export interface TacticPick {
  style: StyleRef;
  form: string;
  plan: FormationPlan;
  /** Le projet du coach est devenu le meilleur choix. */
  project: boolean;
}

/**
 * Chaque style avec son meilleur schéma et la note d'équipe de son onze applicable, du meilleur au moins bon.
 * C'est le classement commun à tous les onglets (accueil, style de jeu, composition).
 */
export function rankTactics(engine: TacticEngine, list: FmPlayer[]): { style: StyleRef; form: string; plan: FormationPlan; fit: number; plans: FormationPlan[] }[] {
  return engine.ref.styles
    .map((style) => {
      const plans = Object.keys(FORMATIONS)
        .map((form) => engine.formationPlan(form, style, list))
        .sort((a, b) => b.score - a.score);
      const plan = plans[0]!;
      return { style, form: plan.form, plan, fit: plan.score, plans };
    })
    .sort((a, b) => b.fit - a.fit);
}

/**
 * Tactique à jouer maintenant : le style et le schéma dont le onze applicable donne la meilleure
 * note d'équipe. Le projet du coach sert à orienter l'entraînement et le mercato ; dès que son onze
 * vaut au moins le meilleur, il devient automatiquement la tactique conseillée.
 */
export function bestTactic(engine: TacticEngine, list: FmPlayer[], coach: CoachPrefs = {}, ranked = rankTactics(engine, list)): TacticPick | null {
  const top = ranked[0];
  if (!top) return null;
  const best: TacticPick = { style: top.style, form: top.form, plan: top.plan, project: false };
  const mine = ranked.find((r) => r.style.id === coach.style);
  const projPlan = mine && (coach.form ? mine.plans.find((p) => p.form === coach.form) : mine.plan);
  if (mine && projPlan && projPlan.score >= best.plan.score) return { style: mine.style, form: projPlan.form, plan: projPlan, project: true };
  return best;
}

/* ---------- Quand basculer vers le style du projet ---------- */

/** Joueur projeté dans `years` saisons : niveau et attributs décalés de la progression attendue. */
export function shiftPlayer(p: FmPlayer, years: number, history: SquadAt[] = []): FmPlayer {
  if (!years || p.level == null) return p;
  const lvl = projectLevel(p, years, history);
  if (lvl == null) return p;
  const d = lvl - p.level;
  const attributes = Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k, Math.max(1, Math.min(20, v + d))]));
  return { ...p, level: lvl, age: p.age != null ? p.age + Math.floor(years) : null, attributes };
}

export type Check = 'good' | 'warn' | 'bad';
export interface StyleState {
  fit: number | null;
  ready: number;
  ability: number | null;
  need: number;
}
export interface SwitchStep {
  years: number;
  target: StyleState;
  rec: StyleState;
  checks: { id: 'fit' | 'ready' | 'ability'; status: Check; gap: number | null }[];
  verdict: 'go' | 'step' | 'no';
}

function styleState(engine: TacticEngine, list: FmPlayer[], st: StyleRef, form: string | null, threshold: number): StyleState {
  const f = form && FORMATIONS[form] ? form : ((STYLE_FORMS[st.id] ?? []).find((x) => FORMATIONS[x]) ?? '4-3-3');
  const plan = engine.formationPlan(f, st, list);
  return {
    fit: engine.rankStyles(list).find((r) => r.style.id === st.id)?.fit ?? null,
    ready: plan.slots.filter((s) => s.fit != null && s.fit >= threshold).length,
    ability: tactAbility(list),
    need: abilityNeeded(st),
  };
}

const cosSim = (a: Record<string, number>, b: Record<string, number>) => {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    d += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
};

export const HORIZONS = [0, 0.5, 1, 1.5, 2, 3];

/**
 * Bascule vers le style du projet : comparé au style le plus adapté aujourd'hui, à effectif constant,
 * sur trois conditions (adéquation, onze prêt, capacité tactique) et à plusieurs horizons.
 */
export function switchAnalysis(engine: TacticEngine, list: FmPlayer[], prefs: CoachPrefs, history: SquadAt[] = []) {
  const target = engine.ref.styles.find((s) => s.id === prefs.style) ?? engine.ref.styles[0];
  if (!target) return null;
  const T = ((prefs.target ?? 55) / 100) * 20;
  const avail = list.filter((p) => !unavailable(p));
  const ranked = engine.rankStyles(avail);
  const best = ranked[0]!;
  const isBest = best.style.id === target.id;
  const rec = isBest ? (ranked[1] ?? best).style : best.style;
  const timeline: SwitchStep[] = HORIZONS.map((years) => {
    // Le projet est à long terme : les blessés comptent pour le onze, pas pour le profil du groupe.
    const L = list.map((p) => shiftPlayer(p, years, history));
    const t = styleState(engine, L, target, prefs.form ?? null, T);
    const r = styleState(engine, L, rec, null, T);
    const fitGap = t.fit != null && r.fit != null ? t.fit - r.fit : null;
    const abGap = t.ability != null ? t.ability - t.need : null;
    const checks: SwitchStep['checks'] = [
      { id: 'fit', gap: fitGap, status: fitGap == null ? 'warn' : fitGap >= -0.6 ? 'good' : fitGap >= -1.4 ? 'warn' : 'bad' },
      { id: 'ready', gap: t.ready, status: t.ready >= 7 ? 'good' : t.ready >= 4 ? 'warn' : 'bad' },
      { id: 'ability', gap: abGap, status: abGap == null ? 'warn' : abGap >= -1.5 ? 'good' : abGap >= -3 ? 'warn' : 'bad' },
    ];
    const verdict = checks.every((c) => c.status === 'good') ? 'go' : checks.some((c) => c.status === 'bad') ? 'no' : 'step';
    return { years, target: t, rec: r, checks, verdict };
  });
  // Style passerelle : presque aussi adapté que le meilleur et le plus proche du projet.
  const bridge =
    ranked
      .filter((x) => x.style.id !== target.id && x.fit != null && best.fit != null && x.fit >= best.fit - 0.6)
      .map((x) => ({ ...x, sim: cosSim(x.style.weights, target.weights) }))
      .sort((a, b) => b.sim - a.sim)[0] ?? null;
  return {
    target,
    rec,
    isBest,
    timeline,
    now: timeline[0]!,
    firstGo: timeline.find((x) => x.verdict === 'go') ?? null,
    firstStep: timeline.find((x) => x.verdict !== 'no') ?? null,
    bridge,
  };
}

/* ---------- Postes et rôles ---------- */

export interface MatrixCell {
  pos: PosCode;
  role: RoleRef;
  fit: number;
  natural: boolean;
  /** Hors poste mais nettement meilleur qu'à son meilleur poste naturel : à essayer. */
  tryIt: boolean;
}

/** Adéquation de chaque joueur au meilleur rôle de chaque poste, dans une phase. */
export function roleMatrix(engine: TacticEngine, list: FmPlayer[], phase: Phase) {
  const rows = list.map((p) => {
    const cells = POS_ORDER.map((pos) => {
      const b = engine.bestAtPos(p, pos, phase);
      return b ? { pos, role: b.role, fit: b.fit, natural: p.positions.includes(pos), tryIt: false } : null;
    });
    const natBest = Math.max(...cells.filter((c) => c?.natural).map((c) => c!.fit));
    for (const c of cells) if (c && !c.natural && c.fit >= natBest + 0.6) c.tryIt = true;
    return { player: p, cells };
  });
  const colBest = POS_ORDER.map((_, i) => {
    let m: { player: FmPlayer; fit: number } | null = null;
    for (const r of rows) {
      const c = r.cells[i];
      if (c?.natural && (!m || c.fit > m.fit)) m = { player: r.player, fit: c.fit };
    }
    return m;
  });
  return { rows, colBest };
}

/* ---------- Cibles du mercato ---------- */

/** Cibles classées par ce qu'elles apporteraient au onze cible : adéquation au rôle du poste et gain sur le titulaire. */
export function rankTargets(engine: TacticEngine, targets: Target[], project: Project) {
  return targets
    .map((t) => {
      let best: { slot: ProjectSlot; fit: number; gain: number } | null = null;
      for (const sl of project.slots) {
        if (!t.positions.includes(sl.pos)) continue;
        const a = engine.roleFit(t, sl.ip, 'ip', sl.pos);
        const b = engine.roleFit(t, sl.oop, 'oop', sl.pos);
        if (a == null || b == null) continue;
        const fit = (a + b) / 2;
        const gain = fit - (sl.fit ?? 0);
        if (!best || gain > best.gain) best = { slot: sl, fit, gain };
      }
      return { target: t, best };
    })
    .sort((a, b) => (b.best?.gain ?? -99) - (a.best?.gain ?? -99));
}
