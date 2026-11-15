import type { CareerSpell } from './career';
import { days, seasonEnd, type CoachLife } from './coach-life';
import { CONTACTS, GAUGES, lifeOutcomes, PER_CLUB, relationScenes, type Contact, type Gauge, type LifeOutcome, type LifeResult, type PromiseKind } from './coach-relations';

/**
 * Téléphone du coach (inspiré de FMLife) : des scènes tirées des vrais moments de la carrière (arrivée, départ,
 * titre, fin de saison, naissance), chacune avec des choix. Un choix coûte de l'argent, change le logement ou la
 * voiture, et fait bouger deux jauges : l'harmonie du foyer et le moral du coach. Tout reste dans l'appli : rien
 * n'est écrit dans FM27.
 */

export type HousingTier = 'studio' | 'flat' | 'house' | 'villa';
export type CarTier = 'city' | 'saloon' | 'sports';
export type BadgeLevel = 'nationalC' | 'nationalB' | 'nationalA' | 'continentalC' | 'continentalB' | 'continentalA' | 'continentalPro';

/** Loyer ou crédit par mois, dans la devise du joueur (ordres de grandeur, pas de vrais prix). */
export const HOUSING_COST: Record<HousingTier, number> = { studio: 600, flat: 1200, house: 2200, villa: 5000 };
export const CAR_COST: Record<CarTier, number> = { city: 250, saloon: 600, sports: 1500 };
/**
 * Diplômes d'entraîneur de FM27, du plus bas au plus haut, payés de sa poche : prix et durée en mois (ordres de
 * grandeur). Le diplôme déjà obtenu dans le jeu (lu par le plugin) est sauté.
 */
export const BADGES: { level: BadgeLevel; cost: number; months: number }[] = [
  { level: 'nationalC', cost: 1500, months: 3 },
  { level: 'nationalB', cost: 3000, months: 6 },
  { level: 'nationalA', cost: 6000, months: 9 },
  { level: 'continentalC', cost: 10000, months: 12 },
  { level: 'continentalB', cost: 15000, months: 12 },
  { level: 'continentalA', cost: 25000, months: 18 },
  { level: 'continentalPro', cost: 40000, months: 24 },
];

/**
 * Code de `CoachingQualificationDisplayValue` (FM27, un octet) → nombre de diplômes de `BADGES` déjà obtenus.
 * Relevé le 15/11/2026 sur des fiches du jeu : n de 1 à 7 = diplôme tenu (1 Pro, 2 continental A, 3 continental B,
 * 4 continental C, 5 national A, 6 national B, 7 national C ; tous vus sur des fiches) ;
 * un octet « négatif » (-n, soit 256 - n) = en formation pour le niveau n, donc tenant le niveau du dessous
 * (253 = continental C en vue du B, 254 = continental B en vue du A, 255 = continental A en vue du Pro). 0 = aucun.
 */
export const GAME_QUALIFICATION: Record<number, number> = { 0: 0, 7: 1, 6: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 7, 253: 4, 254: 5, 255: 6 };

/** Code FM27 du diplôme `level` tenu sans formation en cours (sert à l'inscrire dans le jeu). */
export function qualificationCode(level: BadgeLevel): number {
  return 8 - (BADGES.findIndex((b) => b.level === level) + 1);
}

export type SceneKind =
  | 'arrival'
  | 'move'
  | 'car'
  | 'sacked'
  | 'left'
  | 'trophy'
  | 'birth'
  | 'summer'
  // Proches (« Ma vie », coach-relations.ts)
  | 'promise'
  | 'objectives'
  | 'promiseDue'
  | 'reminder'
  | 'offer'
  | 'leak'
  | 'award'
  | 'streak'
  | 'ultimatum';

export interface SceneChoice {
  key: string;
  /** Dépense ponctuelle. */
  cost?: number;
  harmony?: number;
  morale?: number;
  housing?: HousingTier;
  car?: CarTier;
  /** Lance le diplôme suivant (payé à part, voir `BADGES`). */
  badge?: boolean;
  /** Effets sur les jauges des proches (confiance de l'adjoint, patience de l'agent, estime du président, presse). */
  effects?: Partial<Record<Gauge, number>>;
  /** Promesse gardée en mémoire, rappelée plus tard. */
  promise?: PromiseKind;
}

/** Tous les effets d'un choix sur les jauges (foyer et moral compris). */
export function choiceEffects(c: SceneChoice): Partial<Record<Gauge, number>> {
  const out: Partial<Record<Gauge, number>> = { ...(c.effects ?? {}) };
  if (c.harmony) out.harmony = (out.harmony ?? 0) + c.harmony;
  if (c.morale) out.morale = (out.morale ?? 0) + c.morale;
  return out;
}

export interface Scene {
  id: string;
  kind: SceneKind;
  date: string;
  /** Qui écrit : agent immobilier, conjoint, concessionnaire, ami, adjoint, agent du coach, président, journaliste. */
  from: 'agent' | 'partner' | 'dealer' | 'friend' | 'assistant' | 'representative' | 'chairman' | 'journalist';
  club?: string;
  name?: string;
  season?: string;
  competition?: string | null;
  /** Mois d'un prix d'entraîneur du mois (« 2027-05 »). */
  month?: string;
  /** Club qui fait une offre, ou dont on reparle (dernier adversaire battu), null s'il n'est pas connu. */
  rival?: string | null;
  /** Ce qui a amené une offre : un titre ou un prix. */
  cause?: SceneKind;
  /** Réponse d'avant que ce message rappelle (le proche s'en souvient). */
  recall?: { id: string; choice: string; date: string };
  /** Vrai dilemme : un choix qui coûte quelque chose à quelqu'un, montré à part. */
  dilemma?: boolean;
  choices: SceneChoice[];
}

/**
 * Une scène qui attend plus longtemps que ça (en jours de jeu) est passée : elle n'a plus d'effet. Sauf à la première
 * ouverture et pour le logement et la voiture du club actuel (voir `sceneState`).
 */
export const SCENE_EXPIRY_DAYS = 120;
const BASE_GAUGE = 60;

const d10 = (s: string) => s.slice(0, 10);
const norm = (d: string) => (/^\d{4}$/.test(d) ? `${d}-01-01` : d10(d));

const housing = (): SceneChoice[] => [
  { key: 'studio', housing: 'studio', morale: -5, harmony: -5 },
  { key: 'flat', housing: 'flat' },
  { key: 'house', housing: 'house', harmony: 5 },
  { key: 'villa', housing: 'villa', morale: 5, harmony: 5 },
];
const cars = (): SceneChoice[] => [
  { key: 'city', car: 'city' },
  { key: 'saloon', car: 'saloon', harmony: 3 },
  { key: 'sports', car: 'sports', morale: 5, harmony: -3 },
];

/** Toutes les scènes de la carrière jusqu'à la date de jeu, de la plus ancienne à la plus récente. */
export function careerScenes(spells: CareerSpell[], life: CoachLife | undefined, gameDate: string | null): Scene[] {
  const out: Scene[] = [];
  const partnerAt = (date: string) => !!life?.partner?.name && (!life.partner.since || norm(life.partner.since) <= date);
  spells.forEach((s, i) => {
    const start = d10(s.start);
    out.push({ id: `arrival|${s.club}|${start}`, kind: 'arrival', date: start, from: 'agent', club: s.club, choices: housing() });
    if (i > 0 && partnerAt(start))
      out.push({
        id: `move|${s.club}|${start}`,
        kind: 'move',
        date: start,
        from: 'partner',
        club: s.club,
        name: life!.partner!.name,
        choices: [
          { key: 'together', cost: 3000, harmony: -5 },
          { key: 'distance', harmony: -15, morale: -5 },
          { key: 'weekends', cost: 1500, morale: -5 },
        ],
      });
    // Nouvelle voiture au premier club, puis à chaque changement de pays (on ne garde pas sa voiture à l'étranger).
    if (i === 0 || (s.country && s.country !== spells[i - 1]!.country))
      out.push({ id: `car|${s.club}|${start}`, kind: 'car', date: start, from: 'dealer', club: s.club, choices: cars() });
    for (const se of s.seasons)
      if (se.ended) {
        const end = seasonEnd(se.label, s.end);
        out.push({
          id: `summer|${s.club}|${se.label}`,
          kind: 'summer',
          date: end < d10(s.end) ? end : d10(s.end),
          from: 'partner',
          club: s.club,
          season: se.label,
          name: life?.partner?.name,
          choices: [
            { key: 'beach', cost: 5000, harmony: 10, morale: 10 },
            { key: 'roadtrip', cost: 2000, harmony: 5, morale: 5 },
            { key: 'work', harmony: -5, morale: 5 },
          ],
        });
      }
    for (const tr of s.trophies) {
      const end = seasonEnd(tr.season, s.end);
      out.push({
        id: `trophy|${s.club}|${tr.season}|${tr.competition ?? ''}`,
        kind: 'trophy',
        date: end < d10(s.end) ? end : d10(s.end),
        from: 'assistant',
        club: s.club,
        season: tr.season,
        competition: tr.competition,
        choices: [
          { key: 'party', cost: 2000, morale: 10 },
          { key: 'family', cost: 1500, harmony: 10 },
          { key: 'focus', morale: 5, harmony: -3 },
        ],
      });
    }
    if (!s.current) {
      const end = d10(s.end);
      out.push(
        s.reason === 'sacked'
          ? {
              id: `sacked|${s.club}|${end}`,
              kind: 'sacked',
              date: end,
              from: 'friend',
              club: s.club,
              choices: [
                { key: 'holiday', cost: 4000, harmony: 10, morale: 10 },
                { key: 'work', harmony: -5, morale: 5 },
                { key: 'badge', morale: 5, badge: true },
              ],
            }
          : {
              id: `left|${s.club}|${end}`,
              kind: 'left',
              date: end,
              from: 'assistant',
              club: s.club,
              choices: [
                { key: 'party', cost: 1000, morale: 5 },
                { key: 'quiet', harmony: 5 },
              ],
            },
      );
    }
  });
  const first = spells[0] ? d10(spells[0].start) : null;
  for (const c of life?.children ?? []) {
    const born = c.born ? norm(c.born) : null;
    if (!c.name || !born || (first && born < first)) continue;
    out.push({
      id: `birth|${c.name}|${born}`,
      kind: 'birth',
      date: born,
      from: 'partner',
      name: c.name,
      choices: [
        { key: 'leave', harmony: 15 },
        { key: 'stay', harmony: -10, morale: 5 },
      ],
    });
  }
  const until = gameDate ? d10(gameDate) : null;
  return out.filter((sc) => !until || sc.date <= until).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export interface SceneState {
  scenes: Scene[];
  /** Scènes en attente de réponse, de la plus récente à la plus ancienne. */
  pending: Scene[];
  /** Réponses retenues, dans l'ordre de la carrière. */
  answered: { scene: Scene; choice: SceneChoice; date: string }[];
  harmony: number;
  morale: number;
  /** Logement et voiture d'aujourd'hui (dernier choix), null tant que rien n'est choisi. */
  housing: HousingTier | null;
  car: CarTier | null;
  /** Dépenses tirées des choix : ponctuelles, logement et voiture (au prorata des jours), diplômes. */
  spending: { oneOff: number; housing: number; car: number; badges: number; total: number };
  /** Coût par mois aujourd'hui (logement + voiture). */
  monthly: number;
  badges: { level: BadgeLevel; start: string; end: string; done: boolean; progress: number }[];
  /** Prochain diplôme possible (le précédent doit être fini), null si tout est fait ou si une formation est en cours. */
  nextBadge: (typeof BADGES)[number] | null;
  /** Toutes les jauges aujourd'hui (foyer et moral valent `harmony` et `morale`). */
  gauges: Record<Gauge, number>;
  /** Valeur de chaque jauge après chaque changement, de la plus ancienne à la plus récente (point de départ compris). */
  history: Record<Gauge, { date: string; value: number }[]>;
  /** Faits du jeu qui ont fait bouger les jauges (titres, prix, objectifs vérifiés au classement). */
  outcomes: LifeOutcome[];
  /** Ce dont chaque proche se souvient : sa dernière réponse retenue (ou le dernier fait du jeu pour le président). */
  memories: Partial<Record<Contact, { scene: Scene; choice: SceneChoice; date: string }>>;
  /** Promesses faites et pas encore réglées. */
  promises: { kind: PromiseKind; scene: Scene; date: string }[];
}


const clamp = (n: number) => Math.min(100, Math.max(0, n));
const addMonths = (date: string, m: number) => {
  const d = new Date(`${d10(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
};

/** Où en est la vie du coach : réponses, jauges, logement, voiture, dépenses et diplômes. */
export function sceneState(
  spells: CareerSpell[],
  life: CoachLife | undefined,
  gameDate: string | null,
  opts: { held?: number; results?: LifeResult[] } = {},
): SceneState {
  const scenes = [...careerScenes(spells, life, gameDate), ...relationScenes(spells, life, gameDate, opts.results ?? [])].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const today = gameDate ? d10(gameDate) : (spells.at(-1)?.end.slice(0, 10) ?? '');
  const answers = life?.answers ?? {};
  const answered: SceneState['answered'] = [];
  const waiting: Scene[] = [];
  // Première ouverture (aucune réponse encore) : les derniers moments passés sont proposés quand même, sinon une
  // carrière déjà avancée n'aurait aucun message. Le logement et la voiture du club actuel attendent toujours.
  const firstUse = !Object.keys(answers).length;
  const cur = spells.at(-1);
  const lasting = (sc: Scene) => !!cur?.current && (sc.kind === 'arrival' || sc.kind === 'car') && sc.club === cur.club && sc.date === d10(cur.start);
  // Un message qui rappelle une réponse d'avant (promesse, offre) attend toujours : c'est la suite de l'histoire.
  const fresh = (sc: Scene) => !today || lasting(sc) || !!sc.recall || days(sc.date, today) - 1 <= SCENE_EXPIRY_DAYS;
  for (const sc of scenes) {
    const a = answers[sc.id];
    const choice = a && sc.choices.find((c) => c.key === a.choice);
    if (choice) answered.push({ scene: sc, choice, date: a.date });
    else waiting.push(sc);
  }
  // En attente : les messages récents ; à la première ouverture, les trois derniers moments ; et pour chaque proche
  // à qui le coach n'a encore jamais répondu, son dernier message, même ancien (premier contact).
  const keep = new Set(waiting.filter(fresh).map((sc) => sc.id));
  if (firstUse) for (const sc of waiting.slice(-3)) keep.add(sc.id);
  for (const c of CONTACTS) {
    if (answered.some((x) => x.scene.from === c)) continue;
    const last = waiting.filter((sc) => sc.from === c).at(-1);
    if (last) keep.add(last.id);
  }
  const pending = waiting.filter((sc) => keep.has(sc.id));
  // Jauges : réponses et faits du jeu dans l'ordre des dates. L'adjoint et le président ne comptent que le club actuel.
  const outcomes = lifeOutcomes(spells, life, gameDate);
  const clubNow = cur?.current ? cur.club : null;
  const gauges = Object.fromEntries(GAUGES.map((g) => [g, BASE_GAUGE])) as Record<Gauge, number>;
  const startOf = (g: Gauge) => (PER_CLUB.includes(g) ? (cur?.current ? d10(cur.start) : today) : (spells[0] ? d10(spells[0].start) : today));
  const history = Object.fromEntries(GAUGES.map((g) => [g, [{ date: startOf(g), value: BASE_GAUGE }]])) as SceneState['history'];
  const steps = [
    ...answered.map((x) => ({ date: x.scene.date, club: x.scene.club, fx: choiceEffects(x.choice) })),
    ...outcomes.map((o) => ({ date: o.date, club: o.club as string | undefined, fx: { [o.gauge]: o.delta } as Partial<Record<Gauge, number>> })),
  ].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const st of steps)
    for (const [g, n] of Object.entries(st.fx) as [Gauge, number][]) {
      if (!n || (PER_CLUB.includes(g) && st.club !== clubNow)) continue;
      gauges[g] = clamp(gauges[g] + n);
      history[g].push({ date: st.date, value: gauges[g] });
    }
  const harmony = gauges.harmony;
  const morale = gauges.morale;
  let oneOff = 0;
  for (const { choice } of answered) oneOff += choice.cost ?? 0;

  // Mémoire de chaque proche : sa dernière réponse ; promesses encore ouvertes (pas réglées par une réponse plus tard).
  const memories: SceneState['memories'] = {};
  for (const x of answered) if ((CONTACTS as string[]).includes(x.scene.from)) memories[x.scene.from as Contact] = x;
  const settled = new Set(answered.map((x) => x.scene.recall?.id).filter(Boolean));
  const promises: SceneState['promises'] = [];
  for (const x of answered) {
    if (!x.choice.promise || settled.has(x.scene.id)) continue;
    // Objectifs du président : seulement au club actuel, tant que le classement ne les a pas tranchés.
    if ((x.choice.promise === 'title' || x.choice.promise === 'top3') && (x.scene.club !== clubNow || outcomes.some((o) => o.club === x.scene.club && o.objective))) continue;
    promises.push({ kind: x.choice.promise, scene: x.scene, date: x.date });
  }

  // Logement : celui choisi à l'arrivée dans chaque club, payé pendant tout le passage.
  let housingCost = 0;
  let housingNow: HousingTier | null = null;
  for (const s of spells) {
    const a = answered.find((x) => x.scene.kind === 'arrival' && x.scene.club === s.club && x.scene.date === d10(s.start));
    if (!a?.choice.housing) continue;
    const end = s.current && today ? today : d10(s.end);
    housingCost += (HOUSING_COST[a.choice.housing] * days(s.start, end)) / 30.44;
    if (s === spells.at(-1)) housingNow = a.choice.housing;
  }
  // Voiture : la dernière choisie, payée jusqu'au choix suivant.
  const carChoices = answered.filter((x) => x.choice.car);
  let carCost = 0;
  carChoices.forEach((x, i) => {
    const end = carChoices[i + 1]?.scene.date ?? today;
    if (end) carCost += (CAR_COST[x.choice.car!] * Math.max(0, days(x.scene.date, end) - 1)) / 30.44;
  });
  const carNow = carChoices.at(-1)?.choice.car ?? null;

  // Diplômes : ceux lancés à la main, plus ceux lancés par un choix (« passer un diplôme »), dans l'ordre.
  const starts = [
    ...(life?.badges ?? []).map((b) => b.start),
    ...answered.filter((x) => x.choice.badge).map((x) => x.scene.date),
  ].sort();
  const held = Math.max(0, Math.min(BADGES.length, opts.held ?? 0));
  const badges: SceneState['badges'] = [];
  let free = '';
  for (const start of starts) {
    const def = BADGES[held + badges.length];
    if (!def) break;
    const begin = start > free ? start : free;
    const end = addMonths(begin, def.months);
    const total = Math.max(1, days(begin, end) - 1);
    const done = !!today && today >= end;
    badges.push({ level: def.level, start: begin, end, done, progress: done ? 1 : today ? Math.min(1, Math.max(0, (days(begin, today) - 1) / total)) : 0 });
    free = end;
  }
  const badgeCost = badges.reduce((a, b) => a + BADGES.find((x) => x.level === b.level)!.cost, 0);
  const nextBadge = badges.some((b) => !b.done) ? null : (BADGES[held + badges.length] ?? null);

  const spending = {
    oneOff,
    housing: Math.round(housingCost),
    car: Math.round(carCost),
    badges: badgeCost,
    total: Math.round(oneOff + housingCost + carCost + badgeCost),
  };
  const current = spells.at(-1)?.current;
  return {
    scenes,
    pending: pending.reverse(),
    answered,
    harmony,
    morale,
    housing: current ? housingNow : null,
    car: carNow,
    spending,
    monthly: (current && housingNow ? HOUSING_COST[housingNow] : 0) + (carNow ? CAR_COST[carNow] : 0),
    badges,
    nextBadge,
    gauges,
    history,
    outcomes,
    memories,
    promises,
  };
}
