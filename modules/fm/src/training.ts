import type { EffArea } from './project';

/**
 * Planning d'entraînement hebdomadaire de FM27, d'après la méthode « Freedom » publiée sur FM Scout
 * (« FM27 training schedules ») :
 * - présaison P1 à P4, bloc tactique T1 à T4, puis trois phases de saison A (4 premiers mois),
 *   B (3 mois suivants) et C (jusqu'à la fin) ;
 * - chaque phase tourne sur 4 semaines à thème (construction et possession, pressing et cohésion
 *   défensive, création et attaque, équilibre et coups de pied arrêtés) ; après la 4e on revient à la 1re,
 *   et une nouvelle phase repart à la semaine 1 ;
 * - chaque semaine de saison existe en 3 variantes selon les matchs : -0 (aucun), -1 (samedi),
 *   -2 (mercredi et samedi) ;
 * - veille de match = préparation de match ; lendemain de match = Repos, Récupération, Esprit d'équipe.
 * Corrigé d'après le banc d'essai d'AlexJeuVideal (« La vérité sur l'efficacité tactique », 10 saisons par
 * réglage, mesure en points attendus) :
 * - le repos est l'un des blocs qui rapportent le plus en match : une séance de Repos chaque lendemain de match ;
 * - semaine à 3 matchs ou plus : semaine entière de repos, les résultats priment sur la progression ;
 * - les zones qui rapportent le plus : piège de pressing, stratégie de construction, création d'occasions, puis
 *   ligne d'engagement (hauteur) et organisation sans ballon ; la jauge du jeu ne le montre pas ;
 * - piège de pressing : 2 séances par semaine, c'est le seuil (4 n'apportent rien, 1 coûte ~2 points attendus) ;
 * - aucune double intensité individuelle.
 * L'article ne fournit pas les fichiers .fmf : Archivix reconstruit chaque journée en appliquant ces
 * règles avec les séances de FM27 (noms relevés dans les textes du jeu), orientées par le style visé.
 */

/** Les séances de FM27 (libellés FR/EN dans fm.train.session.<id>). */
export const SESSIONS = {
  // Physique et récupération
  rest: 'physical',
  recovery: 'physical',
  lightConditioning: 'physical',
  conditioning: 'physical',
  heavyConditioning: 'physical',
  // Compréhension tactique (une séance par zone d'efficacité)
  passingStyle: 'tactical',
  buildUpStrategy: 'tactical',
  chanceCreation: 'tactical',
  inPossessionShape: 'tactical',
  lineOfEngagement: 'tactical',
  pressingIntensity: 'tactical',
  pressingTrap: 'tactical',
  outOfPossessionShape: 'tactical',
  // Préparation de match
  pressAvoidance: 'matchPrep',
  ballProgression: 'matchPrep',
  finalThird: 'matchPrep',
  defensiveBlock: 'matchPrep',
  defensivePositioning: 'matchPrep',
  defensiveEngagement: 'matchPrep',
  corners: 'matchPrep',
  freeKicks: 'matchPrep',
  // Développement footballistique (travail avec ballon)
  possessionBallWork: 'ballWork',
  attackingBalanced: 'ballWork',
  attackingPatient: 'ballWork',
  attackingDirect: 'ballWork',
  attackingWings: 'ballWork',
  defendingBalanced: 'ballWork',
  defendingEngaged: 'ballWork',
  defendingDisengaged: 'ballWork',
  defendingWide: 'ballWork',
  theoryAttacking: 'ballWork',
  theoryDefensive: 'ballWork',
  techChanceCreation: 'ballWork',
  techChanceConversion: 'ballWork',
  techBallRetention: 'ballWork',
  techGroundDefense: 'ballWork',
  techAerialDefense: 'ballWork',
  transitionRestrict: 'ballWork',
  transitionPress: 'ballWork',
  transitionProgress: 'ballWork',
  setPiecesDelivery: 'ballWork',
  setPiecesPenalties: 'ballWork',
  individualDevelopment: 'individual',
  // Autres activités (créneau « extra »)
  teamBonding: 'extra',
  communityOutreach: 'extra',
  travel: 'extra',
  // Le match lui-même
  match: 'match',
} as const;
export type SessionId = keyof typeof SESSIONS;
export type SessionCategory = (typeof SESSIONS)[SessionId];
export const sessionCategory = (s: SessionId): SessionCategory => SESSIONS[s];

/** R : semaine complète de repos (trêve), comme le programme « Semaine complète de repos » du jeu. */
export const TRAINING_PHASES = ['P', 'T', 'A', 'B', 'C', 'R'] as const;
export type TrainingPhase = (typeof TRAINING_PHASES)[number];
export type CycleWeek = 1 | 2 | 3 | 4;
/** Thème de chaque semaine du cycle (1 à 4). */
export const WEEK_THEMES = ['buildUp', 'pressing', 'attack', 'balance'] as const;
export type WeekTheme = (typeof WEEK_THEMES)[number];
/** « rest » : jour de repos complet (aucun contrôle de blessure à l'entraînement ce jour-là). */
export type DayKind = 'match' | 'recovery' | 'prep' | 'dev' | 'off' | 'rest';
/** Statut du club : un club semi-professionnel ou amateur ne s'entraîne que certains jours. */
export const CLUB_STATUSES = ['pro', 'semi', 'amateur'] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];
/** Jours d'entraînement par défaut d'un club non professionnel (mardi et jeudi soir), réglables. */
export const PART_TIME_DAYS = [1, 3];

export interface TrainingDay {
  /** Date ISO (AAAA-MM-JJ). */
  date: string;
  /** 0 = lundi … 6 = dimanche. */
  weekday: number;
  kind: DayKind;
  /** Séance 1, séance 2, créneau « extra ». */
  sessions: [SessionId | null, SessionId | null, SessionId | null];
  /** Pourquoi chaque séance est là (programme FM Immersion), libellés dans fm.train.why.<id>. */
  why?: [WhyId | null, WhyId | null, WhyId | null];
}

/** Raisons d'une séance du programme FM Immersion. */
export type WhyId = 'press' | 'weak' | 'top' | 'rotate' | 'grow' | 'devBlock' | 'noCondition' | 'indiv' | 'prep' | 'recover' | 'fullRest' | 'congested' | 'restDay';

export interface TrainingWeek {
  /** Code de la méthode : P1, T3, A2-1… */
  code: string;
  phase: TrainingPhase;
  week: CycleWeek;
  /** Variante de saison (0, 1 ou 2 matchs) ; null en présaison et en bloc tactique. */
  variant: 0 | 1 | 2 | null;
  theme: WeekTheme | null;
  /** Semaine à 3 matchs ou plus : repos complet entre les matchs. */
  congested: boolean;
  days: TrainingDay[];
  /** Méthode Méta adaptée : séances du fichier d'AlexJeuVideal à remplacer (avant, après) après chargement. */
  swaps?: [SessionId, SessionId][];
  /** Programme FM Immersion : régime tactique de la semaine (d'après l'efficacité tactique). */
  mode?: TacticalMode;
  /** Programme FM Immersion : pourquoi la semaine est construite ainsi, dans l'ordre de lecture. */
  lessons?: WeekLesson[];
}

export interface TrainingInput {
  /** Lundi de la semaine (ISO). */
  monday: string;
  phase: TrainingPhase;
  week: CycleWeek;
  /** Jours de match de la semaine (0 = lundi … 6 = dimanche), amicaux compris. */
  matchDays: number[];
  /** Match la veille du lundi (dimanche précédent) : le lundi devient une journée de récupération. */
  matchBeforeMonday?: boolean;
  /**
   * Jours où le club s'entraîne (0 = lundi … 6 = dimanche). Absent : tous les jours (club professionnel).
   * Les autres jours sans match sont libres : pas de séance.
   */
  trainingDays?: number[];
  /** Zones tactiques à prioriser, de la plus importante à la moins importante (style visé, efficacité). */
  priorities?: EffArea[];
  /** Identifiant du style visé, pour choisir la variante des séances offensives et défensives. */
  style?: string;
  /**
   * Méthode des semaines de saison : « metaAdapt » (par défaut : Méta d'AlexJeuVideal dont les séances hors piège du
   * pressing suivent les priorités), « meta » (fichiers d'AlexJeuVideal tels quels) ou « freedom » (FM Scout).
   */
  method?: TrainingMethod;
  /** Zones les moins comprises d'après les jauges d'efficacité du jeu (programme FM Immersion). */
  weakAreas?: EffArea[];
  /** Les jauges du jeu sont lues (conservé pour les autres méthodes). */
  gaugesKnown?: boolean;
  /** Efficacité tactique globale lue dans le jeu (0-100) : règle le nombre de séances tactiques (`tacticalMode`). */
  teOverall?: number | null;
  /** Équipe de jeunes : le but est la progression, deux séances tactiques par semaine au plus. */
  youth?: boolean;
}

/** Méthodes de planning de saison. La présaison, le bloc tactique et la trêve restent ceux de la méthode Freedom. */
export const TRAINING_METHODS = ['coach', 'metaAdapt', 'meta', 'freedom', 'harvestgreen'] as const;
/** Méthode par défaut : le programme FM Immersion, qui combine les trois sources (voir `buildCoachWeek`). */
export const DEFAULT_METHOD: TrainingMethod = 'coach';
export const isMeta = (m: TrainingMethod | undefined) => m === 'metaAdapt' || m === 'meta';
export type TrainingMethod = (typeof TRAINING_METHODS)[number];

/* ---------- Dates ---------- */

const DAY = 864e5;
const utc = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (isoDate: string, n: number) => iso(new Date(utc(isoDate).getTime() + n * DAY));
/** Lundi de la semaine qui contient la date. */
export function mondayOf(isoDate: string): string {
  const d = utc(isoDate);
  return addDays(isoDate, -((d.getUTCDay() + 6) % 7));
}

/**
 * Phase et semaine du cycle pour une date, à partir du mois de reprise du championnat (1 à 12).
 * Présaison : les 4 semaines qui précèdent le 1er du mois de reprise. A : 4 premiers mois,
 * B : 3 mois suivants, C : le reste. La semaine du cycle compte les lundis depuis le début de la phase.
 */
export interface WinterBreak {
  /** Début de la trêve (MM-JJ). */
  from: string;
  /** Reprise du championnat après la trêve (MM-JJ). */
  to: string;
}

/**
 * Semaine de trêve hivernale : repos complet d'abord (au moins une semaine, comme le jeu qui met
 * des « Semaines complètes de repos »), puis une mini-présaison qui se termine par P4 la semaine
 * qui précède la reprise. Null hors trêve.
 */
export function breakPhase(isoDate: string, wb: WinterBreak): { phase: TrainingPhase; week: CycleWeek } | null {
  const monday = mondayOf(isoDate);
  const y = utc(monday).getUTCFullYear();
  for (const year of [y - 1, y]) {
    const from = mondayOf(`${year}-${wb.from}`);
    const toYear = wb.to < wb.from ? year + 1 : year;
    const to = mondayOf(`${toYear}-${wb.to}`);
    if (monday < from || monday >= to) continue;
    const total = Math.round((utc(to).getTime() - utc(from).getTime()) / (7 * DAY));
    const left = Math.round((utc(to).getTime() - utc(monday).getTime()) / (7 * DAY));
    const rest = Math.max(1, total - 4);
    const index = total - left;
    if (index < rest) return { phase: 'R', week: ((index % 4) + 1) as CycleWeek };
    return { phase: 'P', week: (5 - left) as CycleWeek };
  }
  return null;
}

export function autoPhase(isoDate: string, seasonStart: number, winterBreak?: WinterBreak | null): { phase: TrainingPhase; week: CycleWeek } {
  const monday = mondayOf(isoDate);
  const pause = winterBreak ? breakPhase(monday, winterBreak) : null;
  if (pause) return pause;
  const y = utc(monday).getUTCFullYear();
  const startOf = (year: number) => `${year}-${String(seasonStart).padStart(2, '0')}-01`;
  // Reprise retenue : la plus récente dont la présaison (4 semaines avant) a commencé.
  const start = [y + 1, y, y - 1].map(startOf).find((s) => mondayOf(addDays(s, -28)) <= monday)!;
  const weekFrom = (from: string) => (Math.floor((utc(monday).getTime() - utc(mondayOf(from)).getTime()) / (7 * DAY)) % 4) + 1;
  if (monday < mondayOf(start)) return { phase: 'P', week: weekFrom(addDays(start, -28)) as CycleWeek };
  const monthAdd = (m: number) => {
    const s = utc(start);
    s.setUTCMonth(s.getUTCMonth() + m);
    return iso(s);
  };
  const b = monthAdd(4);
  const c = monthAdd(7);
  if (monday < mondayOf(b)) return { phase: 'A', week: weekFrom(start) as CycleWeek };
  if (monday < mondayOf(c)) return { phase: 'B', week: weekFrom(b) as CycleWeek };
  return { phase: 'C', week: weekFrom(c) as CycleWeek };
}

/** Jours de match de la semaine d'après le calendrier de l'instantané (amicaux compris). */
export function weekMatches(fixtures: unknown, monday: string): { days: number[]; before: boolean; opponents: Record<number, string | null> } {
  const list = Array.isArray(fixtures) ? (fixtures as Record<string, unknown>[]) : [];
  const days = new Set<number>();
  const opponents: Record<number, string | null> = {};
  let before = false;
  const sunday = addDays(monday, 6);
  const eve = addDays(monday, -1);
  for (const f of list) {
    if (typeof f.date !== 'string') continue;
    const d = f.date.slice(0, 10);
    if (d === eve) before = true;
    if (d < monday || d > sunday) continue;
    const wd = Math.round((utc(d).getTime() - utc(monday).getTime()) / DAY);
    days.add(wd);
    opponents[wd] = typeof f.opponent === 'string' ? f.opponent : null;
  }
  return { days: [...days].sort((a, b) => a - b), before, opponents };
}

/** Jours de match par défaut de la méthode quand le calendrier n'est pas connu. */
export function defaultMatchDays(phase: TrainingPhase, week: CycleWeek, variant: 0 | 1 | 2): number[] {
  if (phase === 'P') return week === 3 ? [2, 5] : week === 4 ? [2] : [];
  if (phase === 'T') return [2];
  return variant === 2 ? [2, 5] : variant === 1 ? [5] : [];
}

/* ---------- Contenu des semaines ---------- */

type Pick = SessionId | 'ATT' | 'DEF';
interface ThemeContent {
  tactical: EffArea[];
  ball: Pick[];
  prep: SessionId[];
}
/** Séances de chaque thème : compréhension tactique, travail avec ballon, préparation de match. */
const THEMES: Record<WeekTheme, ThemeContent> = {
  buildUp: {
    tactical: ['buildUpStrategy', 'passingStyle', 'inPossessionShape'],
    ball: ['possessionBallWork', 'techBallRetention', 'transitionProgress', 'ATT'],
    prep: ['pressAvoidance', 'ballProgression'],
  },
  pressing: {
    tactical: ['pressingIntensity', 'pressingTrap', 'lineOfEngagement', 'outOfPossessionShape'],
    ball: ['DEF', 'transitionPress', 'techGroundDefense', 'theoryDefensive'],
    prep: ['defensiveEngagement', 'defensiveBlock'],
  },
  attack: {
    tactical: ['chanceCreation', 'inPossessionShape', 'passingStyle'],
    ball: ['ATT', 'techChanceCreation', 'techChanceConversion', 'theoryAttacking'],
    prep: ['finalThird', 'ballProgression'],
  },
  balance: {
    tactical: ['outOfPossessionShape', 'inPossessionShape', 'lineOfEngagement'],
    ball: ['defendingBalanced', 'attackingBalanced', 'techAerialDefense', 'transitionRestrict', 'setPiecesDelivery'],
    prep: ['defensivePositioning', 'corners', 'freeKicks'],
  },
};

/**
 * Zones de compréhension qui rapportent le plus en match (banc d'essai d'AlexJeuVideal), dans l'ordre. Elles passent
 * devant les autres zones du thème ; les priorités du style visé gardent la première place.
 */
export const KEY_AREAS: EffArea[] = ['pressingTrap', 'buildUpStrategy', 'chanceCreation', 'lineOfEngagement', 'outOfPossessionShape'];
/** Séances de piège de pressing par semaine : 2 est le seuil, au-delà rien ne s'ajoute. */
export const PRESSING_TRAP_SESSIONS = 2;
/** À partir de ce nombre de matchs dans la semaine, semaine entière de repos. */
export const CONGESTED_MATCHES = 3;

/** Variante offensive et défensive des séances avec ballon selon le style visé. */
const ATTACK_BY_STYLE: Record<string, SessionId> = {
  possession: 'attackingPatient',
  tikitaka: 'attackingPatient',
  'tikitaka-v': 'attackingPatient',
  catenaccio: 'attackingPatient',
  longball: 'attackingDirect',
  'counter-direct': 'attackingDirect',
  'counter-fluid': 'attackingDirect',
  gegenpress: 'attackingDirect',
  wings: 'attackingWings',
};
const DEFENCE_BY_STYLE: Record<string, SessionId> = {
  gegenpress: 'defendingEngaged',
  tikitaka: 'defendingEngaged',
  'tikitaka-v': 'defendingEngaged',
  possession: 'defendingEngaged',
  catenaccio: 'defendingDisengaged',
  'ultra-def': 'defendingDisengaged',
  'counter-direct': 'defendingDisengaged',
  'counter-fluid': 'defendingDisengaged',
  wings: 'defendingWide',
};

/** Ordonne les séances tactiques : celles des zones prioritaires d'abord, dans l'ordre des priorités. */
function byPriority(list: EffArea[], priorities: EffArea[]): EffArea[] {
  const rank = (a: EffArea) => {
    const i = priorities.indexOf(a);
    if (i >= 0) return i;
    const k = KEY_AREAS.indexOf(a);
    return k < 0 ? 99 : 50 + k;
  };
  return [...list].sort((a, b) => rank(a) - rank(b));
}

/** Tirage circulaire dans une liste. */
function cycler<T>(list: T[]) {
  let i = 0;
  return () => list[i++ % list.length]!;
}

export function buildTrainingWeek(input: TrainingInput): TrainingWeek {
  const { phase, week, monday } = input;
  const method = input.method ?? DEFAULT_METHOD;
  if (method === 'coach' && (phase === 'A' || phase === 'B' || phase === 'C')) return buildCoachWeek(input);
  if (isMeta(method) && (phase === 'A' || phase === 'B' || phase === 'C')) return buildMetaWeek(input);
  if (method === 'harvestgreen' && (phase === 'A' || phase === 'B' || phase === 'C')) return buildHarvestWeek(input);
  const priorities = input.priorities ?? [];
  const matchDays = new Set(input.matchDays.filter((d) => d >= 0 && d <= 6));
  const seasonal = phase === 'A' || phase === 'B' || phase === 'C';
  const variant = seasonal ? (Math.min(2, matchDays.size) as 0 | 1 | 2) : null;
  // Semaine à 3 matchs ou plus : repos tous les jours sans match (préparation et entraînement sacrifiés).
  const congested = phase !== 'R' && matchDays.size >= CONGESTED_MATCHES;
  const theme: WeekTheme | null = phase === 'P' || phase === 'R' ? null : WEEK_THEMES[week - 1]!;
  const code = seasonal ? `${phase}${week}-${variant}` : `${phase}${week}`;

  const training = input.trainingDays ? new Set(input.trainingDays) : null;
  const kindOf = (d: number): DayKind => {
    if (matchDays.has(d)) return 'match';
    if (phase === 'R') return 'off';
    if (training && !training.has(d)) return 'off';
    if (congested) return 'recovery';
    if (d === 0 ? input.matchBeforeMonday : matchDays.has(d - 1)) return 'recovery';
    if (matchDays.has(d + 1)) return 'prep';
    return 'dev';
  };
  const kinds = Array.from({ length: 7 }, (_, d) => kindOf(d));
  if (training) {
    // Club à temps partiel : la dernière séance avant un match (jusqu'à 2 jours avant) sert de préparation.
    for (const m of matchDays) {
      for (const d of [m - 1, m - 2]) {
        if (d < 0) break;
        if (kinds[d] === 'match' || kinds[d] === 'recovery') break;
        if (kinds[d] === 'dev' || kinds[d] === 'prep') {
          kinds[d] = 'prep';
          break;
        }
      }
    }
  }

  const resolve = (p: Pick): SessionId => (p === 'ATT' ? ATTACK_BY_STYLE[input.style ?? ''] ?? 'attackingBalanced' : p === 'DEF' ? DEFENCE_BY_STYLE[input.style ?? ''] ?? 'defendingBalanced' : p);
  const content = theme ? THEMES[theme] : null;
  const tactical = cycler<SessionId>(
    phase === 'T'
      ? byPriority([...new Set<EffArea>([...priorities, ...(content?.tactical ?? []), 'inPossessionShape', 'outOfPossessionShape'])], priorities)
      : byPriority(content?.tactical ?? ['inPossessionShape'], priorities),
  );
  const ball = cycler<SessionId>((content?.ball ?? ['possessionBallWork']).map(resolve));
  const prep = cycler<SessionId>(content?.prep ?? ['pressAvoidance']);
  const setPieces = cycler<SessionId>(['corners', 'freeKicks']);

  const devDays = kinds.flatMap((k, d) => (k === 'dev' ? [d] : []));
  const lastDev = devDays.at(-1);
  // Jour de condition physique de la semaine : premier jour de travail qui n'est pas l'avant-veille d'un match.
  const fitnessDay = devDays.find((d) => !matchDays.has(d + 2)) ?? null;
  const bondingDay = devDays.length >= 2 ? devDays[Math.floor(devDays.length / 2)] : null;

  const devSessions = (d: number): TrainingDay['sessions'] => {
    const weekend = d >= 5;
    switch (phase) {
      case 'P': {
        if (week === 1) return weekend ? ['lightConditioning', 'recovery', null] : [d % 2 ? 'heavyConditioning' : 'conditioning', 'lightConditioning', null];
        if (week === 2) return weekend ? ['lightConditioning', 'recovery', 'lightConditioning'] : ['conditioning', d % 2 ? 'heavyConditioning' : 'lightConditioning', 'lightConditioning'];
        if (week === 3) return [(['possessionBallWork', 'techBallRetention', 'attackingBalanced', 'defendingBalanced'] as SessionId[])[d % 4]!, 'conditioning', null];
        return [(['passingStyle', 'buildUpStrategy', resolve('ATT'), resolve('DEF')] as SessionId[])[d % 4]!, d % 2 ? 'conditioning' : 'lightConditioning', null];
      }
      case 'T':
        return [tactical(), d === lastDev ? 'individualDevelopment' : tactical(), null];
      default: {
        let s2: SessionId = ball();
        if (d === fitnessDay && variant !== 2) s2 = phase === 'C' ? 'lightConditioning' : 'conditioning';
        else if (phase === 'C' && d % 2 === 0) s2 = 'setPiecesDelivery';
        else if (variant === 0 && d === lastDev) s2 = 'individualDevelopment';
        const extra: SessionId | null = phase === 'B' && d === bondingDay ? 'teamBonding' : null;
        return [tactical(), s2, extra];
      }
    }
  };

  const prepSessions = (): TrainingDay['sessions'] => {
    if (phase === 'P') return ['lightConditioning', 'possessionBallWork', null];
    if (phase === 'A') return [prep(), 'lightConditioning', null];
    if (phase === 'B') return [prep(), prep(), null];
    return [prep(), setPieces(), null];
  };

  const days: TrainingDay[] = kinds.map((kind, d) => ({
    date: addDays(monday, d),
    weekday: d,
    kind,
    sessions:
      kind === 'off' ? [null, null, null] : kind === 'match' ? ['match', null, null] : kind === 'recovery' ? (congested ? ['rest', 'rest', null] : ['rest', 'recovery', 'teamBonding']) : kind === 'prep' ? prepSessions() : devSessions(d),
  }));

  // Le projet oriente l'entraînement : la zone n° 1 du style visé est travaillée au moins une fois par semaine.
  const top = priorities[0];
  if (top && seasonal && !days.some((x) => x.sessions.includes(top))) {
    const first = days.find((x) => x.kind === 'dev');
    const prepDay = days.find((x) => x.kind === 'prep');
    if (first) first.sessions[0] = top;
    else if (prepDay) prepDay.sessions[1] = top;
  }
  // Piège de pressing : 2 séances par semaine dès qu'il y a des journées de travail tactique (saison et bloc tactique).
  if (seasonal || phase === 'T') {
    let missing = PRESSING_TRAP_SESSIONS - days.reduce((n, x) => n + x.sessions.filter((s) => s === 'pressingTrap').length, 0);
    // On remplace d'abord les séances tactiques des zones qui rapportent le moins, en gardant la zone n° 1 du style.
    const slots = days
      .filter((x) => x.kind === 'dev')
      .flatMap((x) => [0, 1].map((i) => ({ x, i, s: x.sessions[i] })))
      .filter(({ s }) => s && SESSIONS[s] === 'tactical' && s !== 'pressingTrap' && s !== top)
      .sort((a, b) => KEY_AREAS.indexOf(a.s as EffArea) - KEY_AREAS.indexOf(b.s as EffArea));
    for (const { x, i } of slots) {
      if (missing <= 0) break;
      x.sessions[i] = 'pressingTrap';
      missing--;
    }
  }
  return { code, phase, week, variant, theme, congested, days };
}

/* ---------- Méthode « Harvestgreen » (FM Arena, progression mesurée) ---------- */

/**
 * Progression mesurée par séance (harvestgreen22, FM Arena, tableur repris par jamiebolden/fm-scoring, 06/11/2026) :
 * CA gagnée sur une saison de 100 matchs par un joueur de 18 ans (PA 150, tous attributs à 8, entraîneurs à 16,
 * installations 20), avec la seule séance en question chaque semaine, intensité « double » en bonne et très bonne
 * forme, aucun travail sinon, priorité individuelle Vitesse. Repères : sans entraînement 10,7 ; une séance tactique
 * ne fait pas mieux que le repos (10,5 à 12) ; le physique et le travail avec ballon font le double (22 à 27).
 * Meilleure semaine : Condition physique légère + Condition physique + Ballon offensif + Ballon défensif = 33,3 ;
 * trois fois la même séance rapporte moins (fatigue). Les séances tactiques servent l'efficacité tactique
 * (victoires 42,7 % contre 39,2 % avec 8 séances par semaine, au prix de blessures), pas les attributs.
 */
export const SESSION_YIELD: Partial<Record<SessionId, number>> = {
  rest: 10.7,
  recovery: 11.0,
  lightConditioning: 11.2,
  conditioning: 24.8,
  heavyConditioning: 24.6,
  individualDevelopment: 22.3,
  attackingBalanced: 25.1,
  defendingBalanced: 24.8,
  possessionBallWork: 26.7,
  pressAvoidance: 11.7,
  ballProgression: 11.9,
  finalThird: 10.6,
  defensiveBlock: 11.8,
  defensivePositioning: 11.6,
  defensiveEngagement: 11.3,
  corners: 12.1,
  freeKicks: 10.6,
  setPiecesPenalties: 11.3,
  passingStyle: 11.4,
  buildUpStrategy: 11.7,
  chanceCreation: 11.3,
  inPossessionShape: 10.7,
  lineOfEngagement: 11.7,
  pressingIntensity: 11.1,
  pressingTrap: 12.1,
  outOfPossessionShape: 11.9,
  teamBonding: 10.8,
  communityOutreach: 11.1,
};
/** Meilleure semaine mesurée : quatre séances, une par jour, rien d'autre. */
export const HARVEST_WEEK_YIELD = 33.3;
/** Priorité individuelle de la méthode : Vitesse pour tous les joueurs de champ (l'attribut qui pèse le plus en match). */
export const HARVEST_FOCUS = 'quickness';

/** Intensité de l'équipe conseillée par méthode : Harvestgreen ne fait travailler que les joueurs en forme, en double. */
export function teamIntensityFor(method: TrainingMethod | undefined): Record<(typeof CONDITION_LEVELS)[number], IndividualIntensity> {
  if (method === 'harvestgreen') return { veryPoor: 'noWork', poor: 'noWork', fair: 'noWork', good: 'double', excellent: 'double' };
  if ((method ?? DEFAULT_METHOD) === 'coach') return COACH_INTENSITY;
  return TEAM_INTENSITY;
}

/**
 * Intensité de l'équipe du programme FM Immersion : double intensité pour les joueurs en forme (c'est ce qui fait
 * progresser, mesure d'harvestgreen22), mais moitié et repos pour ceux qui ne le sont pas, pour arriver frais au match
 * (banc d'essai d'AlexJeuVideal) plutôt que « aucun travail » pour tous les autres.
 */
export const COACH_INTENSITY: Record<(typeof CONDITION_LEVELS)[number], IndividualIntensity> = { veryPoor: 'noWork', poor: 'half', fair: 'normal', good: 'double', excellent: 'double' };

/**
 * Priorité individuelle du programme FM Immersion : le point faible vu en match s'il y en a un ; sinon Vitesse pour
 * les joueurs de champ de 23 ans ou moins qui sont lents (vitesse ou accélération sous `SLOW_BELOW` : l'attribut qui
 * pèse le plus en match d'après harvestgreen22, et qui ne progresse plus après) ; sinon l'attribut clé le plus faible
 * du rôle. Un jeune déjà rapide gagne plus à travailler son vrai point faible (choix du 08/11/2026).
 */
export const SLOW_BELOW = 12;
export function coachFocus(
  player: { age: number | null; positions: string[]; attributes?: Record<string, number> },
  weak: { key: string }[],
  fromStats: string | null,
): string | null {
  const gk = player.positions[0] === 'GB';
  if (fromStats) return fromStats;
  if (!gk && player.age != null && player.age <= 23 && isSlow(player.attributes)) return HARVEST_FOCUS;
  return individualFocus(weak, gk) ?? (!gk && player.age != null && player.age <= 23 ? HARVEST_FOCUS : null);
}
/** Vitesse ou accélération sous le seuil ; attributs inconnus : on reste sur Vitesse, comme avant. */
function isSlow(a: Record<string, number> | undefined): boolean {
  const pace = a?.Pace;
  const acc = a?.Acceleration;
  if (pace == null && acc == null) return true;
  return (pace ?? 20) < SLOW_BELOW || (acc ?? 20) < SLOW_BELOW;
}

/* ---------- Programme FM Immersion (toutes sources réunies) ---------- */

/**
 * Régime tactique de la semaine, d'après l'efficacité tactique lue dans le jeu (0-100) :
 * - « learn » sous 60 : la tactique n'est pas encore comprise, les séances tactiques passent en premier ;
 * - « build » de 60 à 79 : on continue de construire, en gardant la progression ;
 * - « keep » à 80 et plus : on entretient (ce qui est appris s'efface), la progression reprend la main ;
 * - « unknown » : jauge non lue, compromis de 4 séances.
 * Repère (test sur le code d'entraînement de FM27, publié avec le banc d'essai de jamiebolden) : il faut environ 7
 * séances tactiques par semaine, en rotation, pour garder toutes les zones au-dessus de 80 ; passer l'efficacité de 50
 * à 100 rapporte environ +0,15 point par match.
 */
export type TacticalMode = 'learn' | 'build' | 'keep' | 'unknown';
export const TE_LEARN_BELOW = 60;
export const TE_KEEP_FROM = 80;
export function tacticalMode(te: number | null | undefined): TacticalMode {
  if (te == null || !Number.isFinite(te)) return 'unknown';
  return te < TE_LEARN_BELOW ? 'learn' : te < TE_KEEP_FROM ? 'build' : 'keep';
}
/** Séances tactiques visées par semaine selon le régime (la place disponible peut en laisser moins). */
export const TACTICAL_TARGET: Record<TacticalMode, number> = { learn: 7, build: 5, keep: 3, unknown: 4 };
/** Équipes de jeunes : la progression d'abord. */
export const YOUTH_TACTICAL = 2;
/**
 * Séances de développement utiles par semaine : les quatre séances différentes de la meilleure semaine mesurée par
 * harvestgreen22 (33,3 de CA sur la saison) ; au-delà, l'écart entre deux bons programmes reste sous 5 %.
 */
export const DEV_TARGET = 4;
/** Jours de repos complet visés : un jour de repos complet saute le contrôle de blessure à l'entraînement. */
export const FULL_REST_MIN_FREE_DAYS = 3;

/** Une explication de la semaine, libellée dans fm.train.lesson.<id>. */
export interface WeekLesson {
  id: 'mode' | 'modeUnknown' | 'fullRest' | 'devBlock' | 'devShort' | 'tacticalShort' | 'rotation' | 'pressTrap' | 'prep' | 'recover' | 'congested' | 'noMatch' | 'partTime';
  params?: Record<string, string | number>;
}

/** Zones tactiques travaillées les semaines précédentes en rotation : l'ordre de toutes les zones, décalé chaque semaine. */
function rotationAreas(week: number): EffArea[] {
  const order: EffArea[] = ['buildUpStrategy', 'outOfPossessionShape', 'chanceCreation', 'lineOfEngagement', 'inPossessionShape', 'pressingIntensity', 'passingStyle'];
  const k = (week - 1) % order.length;
  return [...order.slice(k), ...order.slice(0, k)];
}

/**
 * Semaine de saison du programme FM Immersion, une seule proposition, construite d'après ce que les tests montrent :
 * - les lendemains de match : Repos puis Récupération ; la veille : une seule séance de préparation ;
 * - un jour de repos complet dès qu'il reste au moins trois jours de travail (deux sans match) : le jeu ne fait pas de
 *   contrôle de blessure à l'entraînement ce jour-là ;
 * - le développement regroupé sur les premiers jours de travail (Condition physique, Ballon offensif, Ballon défensif,
 *   Condition physique légère, au plus quatre : au-delà rien ne s'ajoute) : regrouper les mêmes séances fait passer
 *   le risque de blessure à l'entraînement de 13,8 % à 4,0 % pour une progression presque identique ;
 * - les séances tactiques sur les jours les plus proches du match (ce qui est appris s'efface), leur nombre suivant
 *   l'efficacité tactique (`tacticalMode`) : 2 Pièges du pressing, puis les zones les moins comprises, la zone n° 1 du
 *   style, et une rotation des autres zones d'une semaine à l'autre ;
 * - semaine à 3 matchs ou plus : repos complet. Chaque séance porte sa raison (`why`), la semaine ses explications.
 */
function buildCoachWeek(input: TrainingInput): TrainingWeek {
  const { phase, week, monday } = input;
  const matchDays = new Set(input.matchDays.filter((d) => d >= 0 && d <= 6));
  const variant = Math.min(2, matchDays.size) as 0 | 1 | 2;
  const congested = matchDays.size >= CONGESTED_MATCHES;
  const mode = tacticalMode(input.teOverall);
  const training = input.trainingDays ? new Set(input.trainingDays) : null;
  const lessons: WeekLesson[] = [];
  const kindOf = (d: number): DayKind => {
    if (matchDays.has(d)) return 'match';
    if (training && !training.has(d)) return 'off';
    if (congested) return 'recovery';
    if (d === 0 ? input.matchBeforeMonday : matchDays.has(d - 1)) return 'recovery';
    if (matchDays.has(d + 1)) return 'prep';
    return 'dev';
  };
  const kinds = Array.from({ length: 7 }, (_, d) => kindOf(d));
  // Club à temps partiel : la dernière séance avant un match sert de préparation.
  if (training) {
    for (const m of matchDays) {
      for (const d of [m - 1, m - 2]) {
        if (d < 0) break;
        if (kinds[d] === 'match' || kinds[d] === 'recovery') break;
        if (kinds[d] === 'dev' || kinds[d] === 'prep') {
          kinds[d] = 'prep';
          break;
        }
      }
    }
    lessons.push({ id: 'partTime', params: { count: input.trainingDays!.length } });
  }
  if (congested) {
    lessons.push({ id: 'congested', params: { count: matchDays.size } });
    const days: TrainingDay[] = kinds.map((kind, d) => ({
      date: addDays(monday, d),
      weekday: d,
      kind,
      sessions: kind === 'match' ? ['match', null, null] : kind === 'off' ? [null, null, null] : ['rest', 'rest', null],
      why: kind === 'match' || kind === 'off' ? [null, null, null] : ['congested', 'congested', null],
    }));
    return { code: `${phase}${week}-${variant}`, phase, week, variant, theme: null, congested, days, mode, lessons };
  }

  // Jours de repos complet : le premier jour de travail (juste après la récupération), deux sans aucun match.
  const free = kinds.flatMap((k, d) => (k === 'dev' ? [d] : []));
  const restCount = free.length >= 6 ? 2 : free.length >= FULL_REST_MIN_FREE_DAYS ? 1 : 0;
  const restDays = new Set<number>();
  if (restCount) {
    restDays.add(free[0]!);
    // Sans match : le second au milieu de la semaine, pour couper le travail en deux blocs.
    if (restCount === 2) restDays.add(free[Math.floor(free.length / 2) + 1] ?? free.at(-1)!);
    for (const d of restDays) kinds[d] = 'rest';
    lessons.push({ id: 'fullRest', params: { count: restDays.size } });
  }
  const work = kinds.flatMap((k, d) => (k === 'dev' ? [d] : []));
  const slots = work.length * 2;

  // Combien de séances tactiques et de développement : on garde toujours un peu de progression.
  const minDev = slots >= 4 ? 2 : slots >= 2 ? 1 : 0;
  const target = input.youth ? YOUTH_TACTICAL : TACTICAL_TARGET[mode];
  const tacticalCount = Math.max(0, Math.min(target, slots - minDev));
  const devCount = Math.min(DEV_TARGET + (matchDays.size === 0 ? 1 : 0), slots - tacticalCount);

  // Séances tactiques : 2 Pièges du pressing, zones faibles du jeu, zone n° 1 du style, puis la rotation de la semaine.
  const weak = input.weakAreas ?? [];
  const priorities = input.priorities ?? [];
  const top = priorities[0] ?? null;
  const tactical: { s: SessionId; why: WhyId }[] = [];
  const used = new Set<EffArea>();
  const add = (a: EffArea, why: WhyId) => {
    if (tactical.length >= tacticalCount || used.has(a)) return;
    used.add(a);
    tactical.push({ s: a, why });
  };
  for (let i = 0; i < Math.min(PRESSING_TRAP_SESSIONS, tacticalCount - (top && tacticalCount <= 2 ? 1 : 0)); i++) tactical.push({ s: 'pressingTrap', why: 'press' });
  used.add('pressingTrap');
  for (const a of weak) add(a, 'weak');
  if (top) add(top, 'top');
  for (const a of priorities) add(a, 'top');
  for (const a of rotationAreas(week)) add(a, 'rotate');
  // Les deux Pièges du pressing sur deux jours différents : on intercale une autre zone entre eux.
  if (tactical.length >= 3 && tactical[1]!.s === 'pressingTrap') tactical.splice(1, 0, tactical.splice(2, 1)[0]!);

  // Développement : physique d'abord (loin du match), ballon ensuite ; semaine sans match : Développement individuel.
  const att = ATTACK_BY_STYLE[input.style ?? ''] ?? 'attackingBalanced';
  const def = DEFENCE_BY_STYLE[input.style ?? ''] ?? 'defendingBalanced';
  const growList: SessionId[] = ['conditioning', att, def, 'lightConditioning', 'individualDevelopment'];
  const dev: { s: SessionId; why: WhyId }[] = growList.slice(0, devCount).map((s) => ({ s, why: s === 'individualDevelopment' ? 'indiv' : 'devBlock' }));

  // Le développement remplit les premiers jours de travail (regroupé), le tactique les jours proches du match.
  const queue = [...dev, ...tactical];
  const days: TrainingDay[] = kinds.map((kind, d) => {
    let sessions: TrainingDay['sessions'] = [null, null, null];
    let why: NonNullable<TrainingDay['why']> = [null, null, null];
    if (kind === 'match') sessions = ['match', null, null];
    else if (kind === 'recovery') {
      sessions = ['rest', 'recovery', null];
      why = ['recover', 'recover', null];
    } else if (kind === 'rest') {
      sessions = ['rest', 'rest', null];
      why = ['fullRest', 'fullRest', null];
    } else if (kind === 'prep') {
      const prep: SessionId = phase === 'C' ? (week % 2 ? 'defensiveBlock' : 'setPiecesDelivery') : week % 2 ? 'ballProgression' : 'defensiveBlock';
      sessions = [prep, 'rest', null];
      why = ['prep', 'restDay', null];
    } else if (kind === 'dev') {
      const a = queue.shift();
      const b = queue.shift();
      sessions = [a?.s ?? 'rest', b?.s ?? 'rest', null];
      why = [a?.why ?? 'restDay', b?.why ?? 'restDay', null];
    }
    return { date: addDays(monday, d), weekday: d, kind, sessions, why };
  });

  // Jamais de condition physique à deux jours d'un match : échange avec une séance avec ballon de la semaine.
  const heavy = (s: SessionId | null) => s === 'conditioning' || s === 'heavyConditioning';
  for (const day of days) {
    if (day.kind !== 'dev' || !(matchDays.has(day.weekday + 1) || matchDays.has(day.weekday + 2))) continue;
    day.sessions.forEach((s, i) => {
      if (!heavy(s)) return;
      day.sessions[i] = s === 'conditioning' && !days.some((x) => x.sessions.includes('lightConditioning')) ? 'lightConditioning' : 'possessionBallWork';
      day.why![i] = 'noCondition';
    });
  }

  // Explications de la semaine, dans l'ordre où le joueur les lit.
  const te = input.teOverall;
  lessons.unshift(mode === 'unknown' ? { id: 'modeUnknown', params: { count: tacticalCount } } : { id: 'mode', params: { te: Math.round(te!), mode, count: tacticalCount } });
  if (matchDays.size === 0) lessons.push({ id: 'noMatch' });
  if (devCount >= 2) lessons.push({ id: 'devBlock', params: { count: devCount } });
  else lessons.push({ id: 'devShort', params: { count: devCount } });
  if (tacticalCount < target) lessons.push({ id: 'tacticalShort', params: { count: tacticalCount, target } });
  if (tactical.some((x) => x.s === 'pressingTrap')) lessons.push({ id: 'pressTrap' });
  if (tactical.some((x) => x.why === 'rotate')) lessons.push({ id: 'rotation' });
  if (kinds.includes('prep')) lessons.push({ id: 'prep' });
  if (kinds.includes('recovery')) lessons.push({ id: 'recover' });
  return { code: `${phase}${week}-${variant}`, phase, week, variant, theme: null, congested, days, mode, lessons };
}

/**
 * Semaine de saison « Harvestgreen » : une séance par jour de travail, dans l'ordre Condition physique, Ballon
 * offensif (variante du style), Ballon défensif, Condition physique légère, le reste au repos ; la veille d'un match,
 * une seule séance tactique sur la zone n° 1 (l'efficacité tactique ne se travaille que là). Lendemain de match :
 * Repos puis Récupération. Semaine à 3 matchs ou plus : repos complet.
 */
function buildHarvestWeek(input: TrainingInput): TrainingWeek {
  const { phase, week, monday } = input;
  const matchDays = new Set(input.matchDays.filter((d) => d >= 0 && d <= 6));
  const variant = Math.min(2, matchDays.size) as 0 | 1 | 2;
  const congested = matchDays.size >= CONGESTED_MATCHES;
  const training = input.trainingDays ? new Set(input.trainingDays) : null;
  const kindOf = (d: number): DayKind => {
    if (matchDays.has(d)) return 'match';
    if (training && !training.has(d)) return 'off';
    if (congested) return 'recovery';
    if (d === 0 ? input.matchBeforeMonday : matchDays.has(d - 1)) return 'recovery';
    if (matchDays.has(d + 1)) return 'prep';
    return 'dev';
  };
  const kinds = Array.from({ length: 7 }, (_, d) => kindOf(d));
  const att = ATTACK_BY_STYLE[input.style ?? ''] ?? 'attackingBalanced';
  const def = DEFENCE_BY_STYLE[input.style ?? ''] ?? 'defendingBalanced';
  const order: SessionId[] = ['conditioning', att, def, 'lightConditioning'];
  const top = input.priorities?.[0] ?? 'inPossessionShape';
  let n = 0;
  const days: TrainingDay[] = kinds.map((kind, d) => {
    let sessions: TrainingDay['sessions'] = [null, null, null];
    if (kind === 'match') sessions = ['match', null, null];
    else if (kind === 'recovery') sessions = congested ? ['rest', 'rest', null] : ['rest', 'recovery', null];
    else if (kind === 'prep') sessions = [top, 'rest', null];
    else if (kind === 'dev') {
      // Pas de condition physique l'avant-veille d'un match : on passe au ballon.
      let pick = order[n % order.length]!;
      if (matchDays.has(d + 2) && (pick === 'conditioning' || pick === 'heavyConditioning')) pick = order[(n + 1) % order.length]!;
      sessions = n < order.length ? [pick, 'rest', null] : ['rest', 'rest', null];
      n++;
    }
    return { date: addDays(monday, d), weekday: d, kind, sessions };
  });
  return { code: `${phase}${week}-${variant}`, phase, week, variant, theme: null, congested, days };
}

/* ---------- Méthode « Méta efficacité 1.1 » (AlexJeuVideal) ---------- */

/**
 * Les trois journées de travail de la semaine, relevées dans les 37 programmes .fmf « ENTRAÎNEMENT FM 27 META
 * EFFICACITÉ 1.1 » d'AlexJeuVideal (numéros de séance du jeu entre parenthèses, même ordre que SESSIONS) :
 * - bloc 1 : Piège du pressing (6), Hauteur du pressing (4), Construction (1) ;
 * - bloc 2 : Piège du pressing (6), Création d'occasions (2), Organisation avec le ballon (3) ;
 * - veille de match : Progression du ballon (201), Bloc défensif (203), Condition physique (303).
 * Tout le reste est du Repos (300), lendemains de match compris ; le jour du match : Repos, Match, Repos.
 * Aucune séance de style de passes, d'intensité du pressing ni de positionnement sans ballon : d'après son banc
 * d'essai, elles ne rapportent rien en match. Le n° 303 est déduit de l'ordre des séances, à vérifier à l'écran.
 */
export const META_BLOCKS = {
  b1: ['pressingTrap', 'lineOfEngagement', 'buildUpStrategy'],
  b2: ['pressingTrap', 'chanceCreation', 'inPossessionShape'],
  prep: ['ballProgression', 'defensiveBlock', 'conditioning'],
} as const satisfies Record<string, readonly SessionId[]>;

const REST3: TrainingDay['sessions'] = ['rest', 'rest', 'rest'];

/**
 * Séances tactiques jugées utiles par le banc d'essai, dans l'ordre des fichiers d'AlexJeuVideal (Hauteur du pressing,
 * Construction, Création d'occasions, Organisation avec le ballon), plus l'Organisation défensive.
 */
const META_POOL: EffArea[] = ['lineOfEngagement', 'buildUpStrategy', 'chanceCreation', 'inPossessionShape', 'outOfPossessionShape'];

/**
 * Blocs de la méthode Méta adaptée : les 2 pièges du pressing et la veille de match restent ceux d'AlexJeuVideal ; les
 * 4 autres séances tactiques prennent d'abord les zones prioritaires de la semaine (les plus faibles en match), puis
 * celles de ses fichiers. Sans priorité, ce sont exactement ses blocs.
 */
export function metaBlocks(priorities: EffArea[] = []): { b1: SessionId[]; b2: SessionId[]; prep: SessionId[]; swaps: [SessionId, SessionId][] } {
  const picked = [...new Set([...priorities.filter((a) => META_POOL.includes(a)), ...META_POOL])].slice(0, 4);
  const alex: SessionId[] = [META_BLOCKS.b1[1], META_BLOCKS.b1[2], META_BLOCKS.b2[1], META_BLOCKS.b2[2]];
  // Garde chaque séance du fichier à sa place quand elle reste retenue, pour limiter les changements à faire en jeu.
  const slots: (SessionId | null)[] = alex.map((s) => (picked.includes(s as EffArea) ? s : null));
  const extra = picked.filter((a) => !slots.includes(a));
  const swaps: [SessionId, SessionId][] = [];
  slots.forEach((s, i) => {
    if (s) return;
    slots[i] = extra.shift()!;
    swaps.push([alex[i]!, slots[i]!]);
  });
  return { b1: ['pressingTrap', slots[0]!, slots[1]!], b2: ['pressingTrap', slots[2]!, slots[3]!], prep: [...META_BLOCKS.prep], swaps };
}

/**
 * Semaine de saison façon AlexJeuVideal : un bloc 1, un bloc 2 et une veille de match par semaine (donc 2 pièges du
 * pressing), le reste au repos. La veille sert le dernier match de la semaine ; les blocs prennent les derniers jours
 * libres avant elle (ni match, ni lendemain de match). Semaine à 3 matchs : repos complet.
 */
function buildMetaWeek(input: TrainingInput): TrainingWeek {
  const { phase, week, monday } = input;
  const blocks = input.method === 'meta' ? { ...META_BLOCKS, swaps: [] as [SessionId, SessionId][] } : metaBlocks(input.priorities);
  const matchDays = new Set(input.matchDays.filter((d) => d >= 0 && d <= 6));
  const variant = Math.min(2, matchDays.size) as 0 | 1 | 2;
  const congested = matchDays.size >= CONGESTED_MATCHES;
  const training = input.trainingDays ? new Set(input.trainingDays) : null;
  const after = (d: number) => (d === 0 ? !!input.matchBeforeMonday : matchDays.has(d - 1));
  const days: TrainingDay[] = Array.from({ length: 7 }, (_, d) => ({
    date: addDays(monday, d),
    weekday: d,
    kind: matchDays.has(d) ? 'match' : training && !training.has(d) ? 'off' : after(d) ? 'recovery' : 'dev',
    sessions: matchDays.has(d) ? ['rest', 'match', 'rest'] : training && !training.has(d) ? [null, null, null] : [...REST3],
  }));
  if (!congested) {
    const free = days.filter((x) => x.kind === 'dev').map((x) => x.weekday);
    const last = [...matchDays].sort((a, b) => b - a)[0];
    // Veille du dernier match si elle est libre, sinon le dernier jour libre avant un match.
    // Pas de match dans la semaine : la « veille » prend le dernier jour libre.
    const prepDay = last != null ? (free.includes(last - 1) ? last - 1 : [...free].reverse().find((d) => [...matchDays].some((m) => m > d))) : free.at(-1);
    // Blocs 1 puis 2 sur les derniers jours libres avant la veille (comme ses programmes), sinon sur les autres.
    const before = free.filter((d) => prepDay == null || d < prepDay);
    const others = free.filter((d) => d !== prepDay && !before.includes(d));
    const rest = [...before.slice(-2), ...before.slice(0, -2), ...others].slice(0, 2).sort((a, b) => a - b);
    const set = (d: number | undefined, s: readonly SessionId[], kind: DayKind) => {
      if (d == null) return;
      days[d]!.sessions = [s[0]!, s[1]!, s[2]!];
      days[d]!.kind = kind;
    };
    set(prepDay, blocks.prep, 'prep');
    set(rest[0], blocks.b1, 'dev');
    set(rest[1], blocks.b2, 'dev');
  }
  // Les jours restés au repos complet s'affichent comme des jours de repos.
  for (const x of days) if (x.kind === 'dev' && x.sessions.every((s) => s === 'rest')) x.kind = 'recovery';
  return { code: `${phase}${week}-${variant}`, phase, week, variant, theme: null, congested, days, swaps: congested ? [] : blocks.swaps };
}

const DAY_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
/**
 * Programmes du pack « TOUTES SÉANCES » d'AlexJeuVideal, par nom de fichier (sans .fmf) : le premier jour est le
 * dernier match de la semaine précédente (ou lundi si on joue le lundi), puis les matchs de la semaine.
 */
export const META_FILES = [
  '0 - Dim - Mer', '01 - Dim - Mer - Sam', '02 - Dim - Mer - Dim', '03 - Dim - Jeu', '04 - Dim - Jeu - Dim ', '05 - Dim - Ven', '06 - Dim - Sam', '07 - Dim - Dim',
  '08 - Sam - Mar', '09 - Sam - Mar - Ven', '10 - Sam - Mar - Sam', '11 - Sam - Mar - Dim', '12 - Sam - Mer', '13 - Sam - Mer - Sam', '14 - Sam - Mer - Ven', '15 - Sam - Mer - Dim',
  '16 - Sam - Jeu', '17 - Sam - Jeu - Dim', '18 - Sam - Ven', '19 - Sam - Sam', '20 - Sam - Dim',
  '21 - Ven - Mar', '22 - Ven - Mer', '23 - Ven - Jeu', '24 - Ven - Ven', '25 - Ven - Sam', '26 - Ven - Dim', '27 - Ven - Mar - Ven', '28 - Ven - Mar - Sam', '29 - Ven - Mar - Dim',
  '30 - Ven - Mer - Sam', '31 - Ven - Mer - Dim', '32 - Ven - Jeu - Dim', '33 - Lun - Lun', '34 - Lun - Ven', '35 - Lun - Sam', '36 - Lun - Dim',
] as const;

/**
 * Programme .fmf d'AlexJeuVideal à charger pour la semaine. `prevLast` : jour (0-6) du dernier match de la semaine
 * précédente ; inconnu, on suppose le même rythme que cette semaine. Null si aucun fichier ne correspond.
 */
export function metaProgramme(matchDays: number[], prevLast?: number | null): string | null {
  const days = [...new Set(matchDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!days.length || days.length > 2) return null;
  const head = days[0] === 0 ? 0 : prevLast ?? days.at(-1)!;
  // On joue le lundi : le fichier commence par ce match (« Lun - Lun » quand c'est le seul).
  const parts = days[0] === 0 ? (days.length === 1 ? [0, 0] : days) : [head, ...days];
  const want = parts.map((d) => DAY_FR[d]).join(' - ');
  return META_FILES.find((f) => f.split(' - ').slice(1).join(' - ').trim() === want) ?? null;
}

/** Nombre de séances de chaque catégorie dans la semaine (hors match). */
export function weekLoad(w: TrainingWeek): Partial<Record<SessionCategory, number>> {
  const out: Partial<Record<SessionCategory, number>> = {};
  for (const d of w.days) for (const s of d.sessions) if (s && s !== 'match') out[SESSIONS[s]] = (out[SESSIONS[s]] ?? 0) + 1;
  return out;
}

/* ---------- Programme du jeu le plus proche ---------- */

/** Programmes d'entraînement prédéfinis de FM27 (libellés dans fm.train.preset.<id>). */
export const GAME_PRESETS = ['fullRest', 'preSeason', 'tacticalBalanced', 'tacticalIP', 'tacticalOOP', 'match', 'mix', 'devBalanced', 'devIP', 'devOOP', 'congestion'] as const;
export type GamePreset = (typeof GAME_PRESETS)[number];

/** Programme prédéfini du jeu le plus proche de la semaine, à charger puis ajuster séance par séance. */
export function nearestPreset(w: TrainingWeek): GamePreset {
  if (w.phase === 'R' || w.congested) return 'fullRest';
  if (w.phase === 'P') return 'preSeason';
  if (w.variant === 2) return 'congestion';
  const side = w.theme === 'pressing' ? 'OOP' : w.theme === 'balance' ? 'Balanced' : 'IP';
  if (w.phase === 'T') return `tactical${side}` as GamePreset;
  if (w.phase === 'A') return `dev${side}` as GamePreset;
  return w.phase === 'B' ? 'mix' : 'match';
}

/* ---------- Entraînement individuel ---------- */

/** Intensités individuelles de FM27 (écran Entraîn. individuel), libellés dans fm.train.intensityLevel.<id>. */
export const INDIVIDUAL_INTENSITIES = ['team', 'noWork', 'rest', 'half', 'normal', 'double'] as const;

/**
 * « Intensité de l'équipe » du jeu : il ajuste seul l'intensité et le repos selon la condition de chaque
 * joueur. Réglage conseillé par niveau de condition (du plus mauvais au meilleur).
 */
export const CONDITION_LEVELS = ['veryPoor', 'poor', 'fair', 'good', 'excellent'] as const;
export const TEAM_INTENSITY: Record<(typeof CONDITION_LEVELS)[number], IndividualIntensity> = {
  veryPoor: 'noWork',
  poor: 'half',
  fair: 'normal',
  good: 'normal',
  excellent: 'normal',
};
export type IndividualIntensity = (typeof INDIVIDUAL_INTENSITIES)[number];
export type IntensityReason = 'injured' | 'veryTired' | 'tired' | 'busyWeek' | 'young' | 'veteran' | 'normal';
export interface IndividualAdvice {
  intensity: IndividualIntensity;
  reason: IntensityReason;
  /** Manque de rythme : a besoin de temps de jeu (match de l'équipe réserve ou entrée en jeu). */
  rusty: boolean;
}

/**
 * Intensité individuelle : le jeu règle déjà chacun selon sa condition (intensité de l'équipe), donc on
 * laisse « team ». Jamais de double intensité : le banc d'essai d'AlexJeuVideal n'en met à personne, la
 * fraîcheur rapporte plus en match que le surplus de progression. Les jeunes restent signalés (« young »).
 */
export function individualAdvice(
  p: { age: number | null; condition: number | null; sharpness: number | null; injury: string | null },
  o: { matches?: number } = {},
): IndividualAdvice {
  const rusty = !p.injury && p.sharpness != null && p.sharpness < 70;
  if (p.injury) return { intensity: 'team', reason: 'injured', rusty: false };
  if (p.condition != null && p.condition < 80) return { intensity: 'team', reason: 'veryTired', rusty };
  if (p.condition != null && p.condition < 90) return { intensity: 'team', reason: 'tired', rusty };
  if (p.age != null && p.age <= 21) return { intensity: 'team', reason: (o.matches ?? 1) >= 2 ? 'busyWeek' : 'young', rusty };
  if (p.age != null && p.age >= 32) return { intensity: 'team', reason: 'veteran', rusty };
  return { intensity: 'team', reason: 'normal', rusty };
}

/** Priorités de l'entraînement individuel de FM27 et attributs qu'elles travaillent (libellés dans fm.train.focus.<id>). */
export const INDIVIDUAL_FOCUS: Record<string, { attrs: string[]; gk?: boolean }> = {
  gkShotStopping: { attrs: ['Reflexes', 'OneOnOnes', 'AerialReach'], gk: true },
  gkHandling: { attrs: ['Handling', 'CommandOfArea', 'RushingOut'], gk: true },
  gkDistribution: { attrs: ['Kicking', 'Throwing', 'Passing', 'FirstTouch'], gk: true },
  tackling: { attrs: ['Tackling', 'Bravery', 'Aggression'] },
  marking: { attrs: ['Marking', 'Heading', 'JumpingReach'] },
  defensivePositioning: { attrs: ['Positioning', 'Anticipation', 'Concentration'] },
  containment: { attrs: ['Decisions', 'Composure', 'Concentration'] },
  pressing: { attrs: ['WorkRate', 'Teamwork', 'Aggression'] },
  ballRetention: { attrs: ['FirstTouch', 'Technique', 'Composure'] },
  ballProgression: { attrs: ['Dribbling', 'Passing', 'Vision'] },
  chanceCreation: { attrs: ['Crossing', 'Vision', 'Flair'] },
  chanceConversion: { attrs: ['Finishing', 'LongShots', 'PenaltyTaking'] },
  finalThird: { attrs: ['Movement', 'Anticipation', 'Flair'] },
  attackingMovement: { attrs: ['Movement', 'Acceleration'] },
  quickness: { attrs: ['Pace', 'Acceleration'] },
  agilityBalance: { attrs: ['Agility', 'Balance'] },
  endurance: { attrs: ['Stamina', 'NaturalFitness'] },
  resistance: { attrs: ['Strength'] },
};

/** Priorité individuelle qui travaille l'attribut clé le plus faible (puis le suivant) du rôle visé. */
export function individualFocus(weak: { key: string }[], isGk: boolean): string | null {
  const ids = Object.keys(INDIVIDUAL_FOCUS).filter((id) => !!INDIVIDUAL_FOCUS[id]!.gk === isGk || (!INDIVIDUAL_FOCUS[id]!.gk && isGk));
  for (const w of weak) {
    const hit = ids.find((id) => INDIVIDUAL_FOCUS[id]!.attrs.includes(w.key));
    if (hit) return hit;
  }
  return null;
}

/* ---------- Réglages faits en jeu ---------- */

/** Réglage individuel tel qu'on le saisit dans l'écran Entraîn. individuel du jeu. */
export interface IndividualSetup {
  ip: string | null;
  oop: string | null;
  focus: string | null;
  intensity: IndividualIntensity;
  /** Date de jeu où la priorité actuelle a été réglée en jeu (pour la revoir au bout de trois mois). */
  since?: string;
}
export const SETUP_FIELDS = ['ip', 'oop', 'focus', 'intensity'] as const;
export type SetupField = (typeof SETUP_FIELDS)[number];
export type SetupStatus = 'todo' | 'change' | 'ok';

/** Compare le conseil du jour à ce que le joueur a noté comme réglé en jeu. */
export function setupStatus(rec: IndividualSetup, applied: IndividualSetup | undefined): { status: SetupStatus; changed: SetupField[] } {
  if (!applied) return { status: 'todo', changed: [] };
  const changed = SETUP_FIELDS.filter((f) => (rec[f] ?? null) !== (applied[f] ?? null));
  return { status: changed.length ? 'change' : 'ok', changed };
}

/* ---------- Groupes d'encadrement ---------- */

/** Personnalités défavorables (FR/EN du jeu) : à tenir à l'écart des jeunes, l'influence se transmet. */
const BAD_PERSONALITY = /peu professionnel|unprofessional|peu ambitieux|unambitious|tempéramental|temperamental|mercenaire|mercenary|désinvolte|casual|nonchalant|slack|manque de détermination|faible détermination|low determination|sans ambition|manque d.ambition|faible confiance en soi|antisportif|unsporting|volatile|facilement découragé|easily discouraged|influençable|spineless|craintif|low self.belief/i;
/** Personnalités favorables : modèles pour les jeunes. */
const GOOD_PERSONALITY = /professionnel|professional|déterminé|determined|résolu|resolute|ambitieux|ambitious|perfectionni|leader|meneur|charismatique|charismatic|vaillant|spirited|dévoué|devoted|loyal|fidèle|honnête|honest|sportif|sporting/i;

export type PersonalityTone = 'good' | 'bad' | 'neutral';
export function personalityTone(p: string | null | undefined): PersonalityTone {
  if (!p) return 'neutral';
  if (BAD_PERSONALITY.test(p)) return 'bad';
  return GOOD_PERSONALITY.test(p) ? 'good' : 'neutral';
}

type MentorPlayer = {
  id: string;
  name: string;
  age: number | null;
  line: string | null;
  level: number | null;
  personality: string | null;
  hierarchy: string | null;
  attributes: Record<string, number>;
  team?: string | null;
};

export interface MentoringGroup<P extends MentorPlayer = MentorPlayer> {
  mentor: P;
  mentees: P[];
}
export interface Mentoring<P extends MentorPlayer = MentorPlayer> {
  groups: MentoringGroup<P>[];
  /** Joueurs d'influence à la personnalité défavorable : à ne pas mettre avec les jeunes. */
  avoid: P[];
  /** Jeunes sans tuteur disponible. */
  unassigned: P[];
}

const influence = (p: MentorPlayer) => (/leader|meneur|chef/i.test(p.hierarchy ?? '') ? 2 : /influen/i.test(p.hierarchy ?? '') ? 1 : 0);

/**
 * Groupes d'encadrement : un tuteur expérimenté (24 ans et plus, personnalité favorable ou détermination
 * élevée, influent dans le vestiaire) avec jusqu'à 3 jeunes (21 ans et moins), du même secteur de préférence.
 * Les jeunes qui ont déjà une bonne personnalité passent après les autres.
 */
/** Taille d'un groupe d'encadrement dans FM27 : 3 joueurs (« Choisissez trois joueurs… »), tuteur compris. */
export const MENTORING_GROUP_SIZE = 3;

export function mentoringGroups<P extends MentorPlayer>(players: P[], groupSize = MENTORING_GROUP_SIZE): Mentoring<P> {
  const squad = players.filter((p) => !p.team);
  const det = (p: MentorPlayer) => p.attributes.Determination ?? 10;
  const mentorScore = (p: P) => (personalityTone(p.personality) === 'good' ? 3 : 0) + influence(p) * 1.5 + (det(p) - 10) / 4 + ((p.age ?? 0) >= 28 ? 1 : 0);
  const mentors = squad
    .filter((p) => (p.age ?? 0) >= 24 && personalityTone(p.personality) !== 'bad' && (personalityTone(p.personality) === 'good' || det(p) >= 14))
    .sort((a, b) => mentorScore(b) - mentorScore(a));
  const mentees = squad
    .filter((p) => p.age != null && p.age <= 21)
    .sort((a, b) => (personalityTone(a.personality) === 'good' ? 1 : 0) - (personalityTone(b.personality) === 'good' ? 1 : 0) || (b.level ?? 0) - (a.level ?? 0));
  const avoid = squad.filter((p) => personalityTone(p.personality) === 'bad' && (influence(p) > 0 || (p.age ?? 0) >= 24));

  const groups: MentoringGroup<P>[] = [];
  const unassigned: P[] = [];
  for (const y of mentees) {
    // Tuteur du même secteur s'il a de la place, sinon le premier tuteur avec de la place.
    const open = (m: P) => {
      const g = groups.find((x) => x.mentor.id === m.id);
      return !g || g.mentees.length < groupSize - 1;
    };
    const m = mentors.find((x) => x.line === y.line && open(x)) ?? mentors.find(open);
    if (!m) {
      unassigned.push(y);
      continue;
    }
    let g = groups.find((x) => x.mentor.id === m.id);
    if (!g) groups.push((g = { mentor: m, mentees: [] }));
    g.mentees.push(y);
  }
  return { groups, avoid, unassigned };
}

/* ---------- Semaine courante (accueil) ---------- */

/** Semaine type en cours d'après la date du jeu, le calendrier et les réglages du coach, sans réglage manuel. */
export function currentTrainingWeek(o: {
  gameDate: string;
  fixtures?: unknown;
  seasonStart?: number;
  winterBreak?: WinterBreak | null;
  trainingDays?: number[];
  priorities?: EffArea[];
  style?: string;
  method?: TrainingMethod;
  weakAreas?: EffArea[];
  gaugesKnown?: boolean;
  teOverall?: number | null;
  youth?: boolean;
  /** Le calendrier couvre toute la saison (lu match par match) : une semaine sans match connu n'a pas de match. */
  calendarComplete?: boolean;
}): TrainingWeek {
  return trainingWeekAt(mondayOf(o.gameDate), o);
}

type WeekOptions = Omit<Parameters<typeof currentTrainingWeek>[0], 'gameDate'>;

/** Semaine type qui commence au lundi donné, d'après le calendrier et les réglages du coach. */
export function trainingWeekAt(monday: string, o: WeekOptions): TrainingWeek {
  const { phase, week } = autoPhase(monday, o.seasonStart ?? 8, o.winterBreak);
  // Le calendrier ne couvre que les prochains matchs : au-delà du dernier connu, jours de match par défaut.
  const list = Array.isArray(o.fixtures) ? (o.fixtures as { date?: unknown }[]) : [];
  const hasCalendar = !!o.calendarComplete || list.some((f) => typeof f.date === 'string' && f.date.slice(0, 10) >= monday);
  const cal = weekMatches(o.fixtures, monday);
  const seasonal = phase === 'A' || phase === 'B' || phase === 'C';
  const matchDays = hasCalendar ? cal.days : defaultMatchDays(phase, week, seasonal ? 1 : 0);
  return buildTrainingWeek({ monday, phase, week, matchDays, matchBeforeMonday: hasCalendar && cal.before, trainingDays: o.trainingDays, priorities: o.priorities, style: o.style, method: o.method, weakAreas: o.weakAreas, gaugesKnown: o.gaugesKnown, teOverall: o.teOverall, youth: o.youth });
}

/** Ce qui demande une action côté entraînement : joueurs en manque de rythme (l'intensité, le jeu la règle). */
export function trainingAlerts<P extends { injury: string | null; age: number | null; condition: number | null; sharpness: number | null; team?: string | null }>(players: P[]) {
  const squad = players.filter((p) => !p.team);
  const advice = squad.map((p) => ({ p, a: individualAdvice(p) }));
  return {
    rusty: advice.filter((x) => x.a.rusty).map((x) => x.p),
  };
}

/* ---------- Semaines à venir ---------- */

/** Charge de travail de la semaine (réglage du jeu : Légère, Moyenne, Intensive) ; null en semaine de repos. */
export type WeekWorkload = 'light' | 'medium' | 'heavy';
export function weekWorkload(w: TrainingWeek): WeekWorkload | null {
  if (w.phase === 'R' || w.congested) return null;
  const matches = w.days.filter((d) => d.kind === 'match').length;
  if (matches >= 2) return 'light';
  if (w.phase === 'P' && w.week <= 2) return 'heavy';
  if (matches === 1) return 'medium';
  return w.phase === 'C' ? 'medium' : 'heavy';
}

/**
 * Les prochaines semaines comme dans l'écran Programme d'entraînement du jeu : pour chacune, la
 * « Priorité du calendrier » à choisir et la charge de travail.
 */
export function upcomingWeeks(o: WeekOptions & { gameDate: string }, count = 6) {
  const first = mondayOf(o.gameDate);
  let prevLast: number | null = null;
  return Array.from({ length: count }, (_, i) => {
    const plan = trainingWeekAt(addDays(first, i * 7), o);
    const days = plan.days.filter((d) => d.kind === 'match').map((d) => d.weekday);
    const seasonal = plan.phase === 'A' || plan.phase === 'B' || plan.phase === 'C';
    // Programme .fmf d'AlexJeuVideal à charger (méthode Méta), d'après le dernier match de la semaine d'avant.
    const file = isMeta(o.method) && seasonal && !plan.congested ? metaProgramme(days, i === 0 ? null : prevLast) : null;
    if (days.length) prevLast = days.at(-1)!;
    else prevLast = null;
    return { monday: plan.days[0]!.date, plan, preset: nearestPreset(plan), file, workload: weekWorkload(plan), matches: days.length };
  });
}

/* ---------- Toute la saison ---------- */

/**
 * Type de semaine affiché dans la vue saison : présaison, bloc tactique, trêve, puis en saison selon le nombre de
 * matchs (aucun, un, deux, trois ou plus : enchaînement).
 */
export type SeasonWeekKind = 'preseason' | 'tactical' | 'break' | 'free' | 'single' | 'double' | 'congested' | 'offseason';

export function seasonWeekKind(plan: TrainingWeek, matches: number): SeasonWeekKind {
  if (plan.phase === 'P') return 'preseason';
  if (plan.phase === 'T') return 'tactical';
  if (plan.phase === 'R') return 'break';
  if (plan.congested || matches >= CONGESTED_MATCHES) return 'congested';
  return matches >= 2 ? 'double' : matches === 1 ? 'single' : 'free';
}

/** Lundi où commence la prochaine présaison (4 semaines avant le 1er du mois de reprise), après la date donnée. */
export function nextPreseason(isoDate: string, seasonStart: number): string {
  const monday = mondayOf(isoDate);
  const y = utc(monday).getUTCFullYear();
  for (const year of [y, y + 1, y + 2]) {
    const pre = mondayOf(addDays(`${year}-${String(seasonStart).padStart(2, '0')}-01`, -28));
    if (pre > monday) return pre;
  }
  return addDays(monday, 52 * 7);
}

/**
 * Toutes les semaines de la date du jeu jusqu'à la veille de la prochaine présaison (52 au plus), comme les
 * « Semaines à venir » : plan de la semaine, priorité du calendrier et charge, plus son type, ses adversaires et si
 * ses matchs sont lus dans le calendrier du jeu ou supposés (au-delà du dernier match connu : un match le samedi).
 * Avec le calendrier complet (`calendarComplete`), rien n'est supposé : après le dernier match, c'est l'intersaison.
 */
export function seasonWeeks(o: WeekOptions & { gameDate: string }) {
  const first = mondayOf(o.gameDate);
  const end = nextPreseason(o.gameDate, o.seasonStart ?? 8);
  const count = Math.min(52, Math.max(1, Math.round((utc(end).getTime() - utc(first).getTime()) / (7 * DAY))));
  const list = Array.isArray(o.fixtures) ? (o.fixtures as { date?: unknown; competition?: unknown }[]) : [];
  const lastKnown = list.reduce<string | null>((m, f) => (typeof f.date === 'string' && (!m || f.date.slice(0, 10) > m) ? f.date.slice(0, 10) : m), null);
  return upcomingWeeks(o, count).map((w) => {
    const cal = weekMatches(o.fixtures, w.monday);
    const sunday = addDays(w.monday, 6);
    const competitions = [
      ...new Set(
        list
          .filter((f) => typeof f.date === 'string' && f.date.slice(0, 10) >= w.monday && f.date.slice(0, 10) <= sunday && typeof f.competition === 'string')
          .map((f) => f.competition as string),
      ),
    ];
    const after = !lastKnown || w.monday > lastKnown;
    return {
      ...w,
      kind: o.calendarComplete && after && lastKnown && 'ABC'.includes(w.plan.phase) ? ('offseason' as const) : seasonWeekKind(w.plan, w.matches),
      opponents: cal.days.map((d) => ({ weekday: d, name: cal.opponents[d] ?? null })),
      competitions,
      /** Matchs supposés : la semaine est au-delà du dernier match connu du calendrier. */
      estimated: after && !o.calendarComplete,
    };
  });
}
